import {verifyWorkflowCards,workflowDraftWarnings} from './workflow-card.ts'
/** Automatic admission uses frozen graph state, never conversational intent. */
import type {Context} from '@deepseek-ai/cordis'
import {randomUUID} from 'node:crypto'
import {listMeetings,mutateMeeting,stateRoot,type Meeting} from './meetings.ts'
import {inspectMember} from './member-session.ts'
import {activateWorkflowNodes,canCompleteWorkflow} from './workflow-runtime.ts'
import {previewWorkflow,workflowViews,workflowHash,latestActivation} from './workflow-projection.ts'
import {workflowSupported} from './workflow-state.ts'
import {startMinutes} from './minutes.ts'
import type {WorkflowRun,WorkflowActivation} from './workflow-types.ts'

const pumps=new WeakMap<object,Promise<void>>()
function pause(m:Meeting,r:WorkflowRun,reason:string){
 if(!r.automatic||r.status!=='active')return
 r.paused=true;r.automatic.pauseReason=reason
 r.events.push({id:randomUUID(),time:Date.now(),action:'automatic-pause',details:reason})
}
function disposition(m:Meeting,r:WorkflowRun):{reason?:string;nodeIds:string[];done?:boolean}{
 const views=workflowViews(m,r),problem=views.find(v=>['uncertain','offline','failed','ended','changes_requested','waiting_review','waiting_decision','limit'].includes(v.status))
 if(problem){const n=r.definition.nodes.find(n=>n.id===problem.nodeId)!,labels:Record<string,string>={waiting_review:'等待主持人验收',waiting_decision:'等待主持人选路',changes_requested:'结果已要求修改，等待主持人处理',uncertain:'投递结果不确定，须核对原窗口',offline:'成员投递失败或不可用',failed:'执行失败',ended:'执行等待已结束',limit:'执行上限'};return {reason:`「${n.title}」${labels[problem.status]}${problem.missing.length?'：'+problem.missing.join('；'):''}`,nodeIds:[]}}
 const ready=views.filter(v=>v.status==='ready'&&(r.executionPolicy!=='per-node-v1'||r.definition.nodes.find(n=>n.id===v.nodeId)!.autoReceiveAndRun===true))
 const drafts=workflowDraftWarnings(m,ready.map(v=>({node:r.definition.nodes.find(n=>n.id===v.nodeId)!,messageIds:v.messageIds})))
 if(drafts.length)return {reason:drafts.join('；'),nodeIds:[]}
 const unreadableImage=ready.find(v=>r.definition.nodes.find(n=>n.id===v.nodeId)!.kind==='minutes'&&v.assetIds.some(id=>m.assets?.some(a=>a.id===id&&a.image&&!a.text?.trim())))
 if(unreadableImage)return {reason:`「${r.definition.nodes.find(n=>n.id===unreadableImage.nodeId)!.title}」含无法直接核实的图片资料，先补充已确认的文字证据或由主持预览确认；未自动宣称秘书已看图`,nodeIds:[]}
 const confirmation=ready.find(v=>r.definition.nodes.find(n=>n.id===v.nodeId)!.confirmation)
 if(confirmation)return {reason:`「${r.definition.nodes.find(n=>n.id===confirmation.nodeId)!.title}」设置了主持人确认，预览后开始本环节`,nodeIds:[]}
 const nodeIds=ready.map(v=>v.nodeId)
 for(const v of ready)if(v.loopId&&v.round>(r.automatic?.roundCaps[v.loopId]??r.definition.loops.find(l=>l.id===v.loopId)!.maxRounds))return {reason:`自动协作轮次上限已到：第${v.round}轮尚未开始；可明确追加轮次或选择退出路线`,nodeIds:[]}
 if(nodeIds.length)return {nodeIds}
 if(canCompleteWorkflow(m,r))return {nodeIds:[],done:true}
 // Unchecked ready steps await a manual start without blocking checked parallel work.
 if(r.executionPolicy==='per-node-v1'&&views.some(v=>v.status==='ready'))return {nodeIds:[]}
 if(views.some(v=>['queued','delivering','in_progress'].includes(v.status)))return {nodeIds:[]}
 const missing=views.filter(v=>v.status==='waiting_inputs').flatMap(v=>v.missing)
 return {reason:missing.length?`输入尚未齐全：${[...new Set(missing)].join('；')}`:'当前没有可自动开始的环节，等待主持人检查流程',nodeIds:[]}
}
async function pumpOnce(ctx:Context):Promise<void>{
 for(const original of await listMeetings(stateRoot())){
  if(!workflowSupported(original)||original.archivedAt||original.deletion||original.releasePaused)continue
  const initial=original.workflow?.runs.find(r=>r.status==='active'&&r.automatic&&!r.paused);if(!initial)continue
  const desired=disposition(original,initial),unavailable:string[]=[]
  for(const memberId of [...new Set(desired.nodeIds.flatMap(id=>initial.definition.nodes.find(n=>n.id===id)!.memberIds))]){
   const availability=await inspectMember(ctx,memberId)
   if(!['ready','busy','unloaded'].includes(availability.state))unavailable.push(`成员 ${memberId}：${availability.reason??availability.state}`)
  }
  let activations:WorkflowActivation[]=[]
  await mutateMeeting(stateRoot(),original.meetingId,async current=>{
   const r=current.workflow?.runs.find(r=>r.id===initial.id)
   if(!r?.automatic||r.paused||r.status!=='active'||current.archivedAt||current.deletion||current.releasePaused)return current
   // Results, routing or configuration may change during read-only Host inspection.
   const next=disposition(current,r)
   if(workflowHash({definition:r.definition,disposition:next})!==workflowHash({definition:initial.definition,disposition:desired}))return current
   if(next.reason||unavailable.length){pause(current,r,next.reason??unavailable.join('；'));return current}
   if(next.done){r.status='completed';r.paused=true;r.events.push({id:randomUUID(),time:Date.now(),action:'automatic-complete',details:'冻结路径已完整提交且没有未结束任务，本次自动协作完成'});return current}
   if(!next.nodeIds.length)return current
   try{await verifyWorkflowCards(current,next.nodeIds,r.definition.nodes)}catch(error){pause(current,r,`任务卡文件校验失败：${error instanceof Error?error.message:String(error)}`);return current}
   const plan=previewWorkflow(current,r,next.nodeIds)
   if(!plan.ready){pause(current,r,plan.missing.join('；'));return current}
   // Persisted slot + attempt identities survive duplicate ticks, module reloads and resumes.
   const requestId='auto-'+workflowHash({runId:r.id,slots:plan.items.map(i=>({slot:i.view.slotKey,attempt:(latestActivation(r,i.view.slotKey)?.attempt??0)+1})).sort((a,b)=>a.slot.localeCompare(b.slot))})
   activations=activateWorkflowNodes(current,{runId:r.id,nodeIds:next.nodeIds,fingerprint:plan.fingerprint,requestId,...(r.executionPolicy==='per-node-v1'?{automaticAdmission:true}:{})})
   return current
  })
  for(const a of activations)if(a.node.kind==='minutes'&&a.minutesJobId&&a.minutesStatus==='reserved'){
   try{await startMinutes(ctx,original.meetingId,'full',{runId:initial.id,activationId:a.id,jobId:a.minutesJobId})}
   catch(error){await mutateMeeting(stateRoot(),original.meetingId,m=>{const r=m.workflow?.runs.find(r=>r.id===initial.id),stored=r?.activations.find(x=>x.id===a.id);if(stored?.minutesStatus==='reserved'){stored.minutesStatus='failed';stored.minutesError=error instanceof Error?error.message:String(error)}if(r)pause(m,r,`秘书未开始：${error instanceof Error?error.message:String(error)}`);return m})}
  }
 }
}
export function pumpAutomaticWorkflows(ctx:Context):Promise<void>{
 const existing=pumps.get(ctx);if(existing)return existing
 const work=pumpOnce(ctx);pumps.set(ctx,work);void work.finally(()=>{if(pumps.get(ctx)===work)pumps.delete(ctx)}).catch(()=>{});return work
}
export function attachAutomaticWorkflowLifecycle(ctx:Context):void{
 ctx.effect(()=>{let stopped=false;const tick=()=>{if(!stopped)void pumpAutomaticWorkflows(ctx).catch(error=>ctx.logger.warn(`自动协作检查失败：${String(error)}`))};const timer=setInterval(tick,2000);tick();return async()=>{stopped=true;clearInterval(timer);await pumps.get(ctx)}},'round-table: automatic workflow queue')
}
export async function extendAutomaticRounds(meetingId:string,input:{runId:string;loopId:string;maxRounds:number;expected:number;confirmed:boolean}):Promise<void>{
 if(input.confirmed!==true||!Number.isSafeInteger(input.maxRounds)||input.maxRounds<1)throw Error('请明确确认新的自动轮次上限')
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const r=m.workflow?.runs.find(r=>r.id===input.runId),loop=r?.definition.loops.find(l=>l.id===input.loopId)
  if(!r?.automatic||!loop||r.status!=='active'||m.archivedAt||m.deletion)throw Error('活动自动协作回路不存在')
  const current=r.automatic.roundCaps[loop.id];if(current===input.maxRounds)return m
  if(current!==input.expected||input.maxRounds<=current)throw Error('上限已变化或没有增加，请重新确认')
  r.automatic.roundCaps[loop.id]=input.maxRounds;r.events.push({id:randomUUID(),time:Date.now(),action:'automatic-round-cap',details:`主持人明确将「${r.definition.nodes.find(n=>n.id===loop.gateId)?.title}」自动上限从${current}轮增加到${input.maxRounds}轮；尚未恢复或启动`});return m
 })
}
