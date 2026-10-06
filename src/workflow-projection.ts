import {assetInputText,assetImageRef} from './asset-reference.ts'
import {workflowRetryIssues} from './workflow-retry.ts'
import {effectiveReleaseTasks,resultIsUsable} from './task-review.ts'
/** Read-only projection. Readiness never creates a release or wakes an Agent. */
import {createHash} from 'node:crypto'
import type {Meeting} from './meetings.ts'
import {meetingMessageStream} from './meeting-flow.ts'
import type {WorkflowRun,WorkflowNode,WorkflowNodeView,WorkflowActivation,WorkflowPlan} from './workflow-types.ts'
import {assertWorkflowGraph,workflowSemantic} from './workflow-graph.ts'
import {assertWorkflowWritable} from './workflow-state.ts'
import {workflowBudget} from './workflow-budget.ts'

export const workflowHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const unique=(v:string[])=>[...new Set(v)]
export {latestActivation,workflowSlot} from './workflow-slot.ts'
import {latestActivation,workflowSlot} from './workflow-slot.ts'


export function workflowViews(m:Meeting,run:WorkflowRun,ignoreActivationFor?:Set<string>):WorkflowNodeView[]{
 assertWorkflowWritable(m);assertWorkflowGraph(run.definition)
 if(run.activations.some(a=>a.node.stepsInternal!==undefined||run.definition.nodes.some(n=>n.id===a.nodeId&&n.stepsInternal!==undefined)))throw Error('内部依赖步骤不能拥有执行激活记录')
 const stream=new Map(meetingMessageStream(m).map(x=>[x.id,x])),assets=new Map((m.assets??[]).map(a=>[a.id,a]))
 const nodes=new Map(run.definition.nodes.map(n=>[n.id,n])),cache=new Map<string,WorkflowNodeView>(),visiting=new Set<string>()
 function evaluate(nodeId:string,forced?:number):WorkflowNodeView {
  const n=nodes.get(nodeId)!,slot=workflowSlot(run,nodeId,forced),loop=run.definition.loops.find(l=>l.id===slot.loopId)
  if(n.stepsInternal!==undefined&&(run.pendingInputs?.[slot.slotKey]?.length??0)>0)throw Error('内部依赖步骤不能暂存额外输入')
  const key=slot.slotKey;if(cache.has(key))return cache.get(key)!
  const v:WorkflowNodeView={nodeId,...slot,status:'waiting_inputs',missing:[],messageIds:[],assetIds:[],sourceActivationIds:[],incomingEdgeIds:[],submitted:0,required:n.memberIds.length}
  if(visiting.has(key)){v.missing.push('输入绑定存在循环依赖');return v}visiting.add(key)
  const done=()=>{visiting.delete(key);cache.set(key,v);return v}
  const a=ignoreActivationFor?.has(key)?undefined:latestActivation(run,key)
  if(a){
   v.activationId=a.id
   v.incomingEdgeIds=[...a.incomingEdgeIds]
   if(a.skipped){v.status='skipped';if(a.skipMode==='bypass'){v.messageIds=[...a.messageIds];v.assetIds=[...a.assetIds];v.sourceActivationIds=[...a.sourceActivationIds,a.id]}return done()}
   if(n.kind==='work'){
    const release=m.releases?.find(r=>r.id===a.releaseId),tasks=release?effectiveReleaseTasks(m,release):[]
    v.required=a.node.memberIds.length;v.submitted=tasks.filter(t=>t.status==='completed').length
    v.messageIds=tasks.filter(t=>resultIsUsable(t,a.node.requireReview||!release!.tasks.some(old=>old.taskId===t.taskId))&&stream.has(t.resultMessageId!)).map(t=>t.resultMessageId!)
    v.sourceActivationIds=unique([a.id,...tasks.flatMap(t=>t.workflow?[t.workflow.activationId]:[])])
    if(tasks.some(t=>t.review==='changes_requested')){v.status='changes_requested';v.missing.push('结果已被要求修改；待修改结果提交并验收后继续');return done()}
    if((a.node.requireReview||tasks.some(t=>!release!.tasks.some(old=>old.taskId===t.taskId)))&&tasks.every(t=>t.status==='completed')&&tasks.some(t=>t.review!=='accepted')){v.status='waiting_review';v.missing.push('结果已提交，等待主持人验收通过');return done()}
    if(v.submitted===v.required&&v.messageIds.length===v.required){v.status='submitted';return done()}
    const priority=['uncertain','failed','cancelled','delivering','in_progress','delivered','offline','queued'] as const
    const status=priority.find(s=>tasks.some(t=>t.status===s));v.status=status==='cancelled'?'ended':status==='delivered'?'in_progress':status??'failed'
    if(!tasks.length)v.missing.push('关联的执行任务缺失')
    return done()
   }
   if(n.kind==='minutes'){
    const record=m.minutes?.find(x=>x.id===a.minutesId),message=meetingMessageStream(m).find(x=>x.kind==='minutes'&&m.events.some(e=>e.id===x.id&&e.kind==='minutes'&&e.minutesId===a.minutesId))
    v.sourceActivationIds=[a.id];v.required=1;v.submitted=record?1:0
    v.status=record?'submitted':a.minutesStatus==='failed'?'failed':a.minutesStatus==='cancelled'?'ended':'in_progress'
    if(message)v.messageIds=[message.id];return done()
   }
   v.messageIds=[...a.messageIds];v.assetIds=[...a.assetIds];v.sourceActivationIds=[...a.sourceActivationIds,a.id];v.incomingEdgeIds=[...a.incomingEdgeIds]
   v.required=a.incomingEdgeIds.length;v.submitted=v.required
   v.status=n.decision&&!a.choiceEdgeId?'waiting_decision':'submitted';return done()
  }
  let incoming=run.definition.edges.filter(e=>e.to===nodeId)
  if(loop?.entryIds.includes(nodeId))incoming=incoming.filter(e=>slot.round===1?e.kind!=='loop':e.kind==='loop'&&e.loopId===loop.id)
  else incoming=incoming.filter(e=>e.kind!=='loop')
  let inactive=0
  for(const edge of incoming){
   const parentLoop=run.definition.loops.find(l=>l.nodeIds.includes(edge.from))
   const parentRound=loop&&parentLoop?.id===loop.id?(nodeId===loop.advanceId?slot.round-1:slot.round):undefined
   const p=evaluate(edge.from,parentRound),pa=p.activationId?run.activations.find(x=>x.id===p.activationId):undefined
   const bypass=p.status==='skipped'&&pa?.skipMode==='bypass'
   if(p.status==='not_walked'||p.status==='skipped'&&!bypass||(edge.kind==='choice'&&pa?.choiceEdgeId&&pa.choiceEdgeId!==edge.id)){inactive++;continue}
   v.incomingEdgeIds.push(edge.id)
   if(n.kind==='join'){v.required++;if(p.status==='submitted')v.submitted++}
   if(p.status!=='submitted'&&!bypass||(edge.kind==='choice'&&!pa?.choiceEdgeId))v.missing.push(`等待「${nodes.get(edge.from)!.title}」${edge.kind==='choice'?'提交并选路':'提交'}`)
   else {v.sourceActivationIds.push(...p.sourceActivationIds);if(n.includeIncoming){v.messageIds.push(...p.messageIds);v.assetIds.push(...p.assetIds)}}
  }
  if(incoming.length&&inactive===incoming.length){v.status='not_walked';return done()}
  for(const b of [...n.inputs,...(run.pendingInputs?.[key]??[])]){
   if(b.kind==='message'){if(stream.has(b.id))v.messageIds.push(b.id);else v.missing.push(`消息 ${b.id} 不存在`)}
   if(b.kind==='asset'){if(assets.has(b.id))v.assetIds.push(b.id);else v.missing.push(`附件 ${b.id} 不存在`)}
   if(b.kind==='node'){
    const sourceLoop=run.definition.loops.find(l=>l.nodeIds.includes(b.nodeId))
    const r=sourceLoop?(sourceLoop.id===loop?.id?slot.round:run.rounds[sourceLoop.id]??1):0
    if(b.round==='previous'&&r<2){v.missing.push(`「${nodes.get(b.nodeId)!.title}」没有上一轮结果`);continue}
    const p=evaluate(b.nodeId,b.round==='previous'?r-1:r)
    if(p.status!=='submitted')v.missing.push(`指定的「${nodes.get(b.nodeId)!.title}」结果未提交`)
    else {v.messageIds.push(...p.messageIds);v.assetIds.push(...p.assetIds);v.sourceActivationIds.push(...p.sourceActivationIds)}
   }
   if(b.kind==='activation'){
    const source=run.activations.find(a=>a.id===b.activationId)
    if(!source||source.skipped){v.missing.push(`来源执行 ${b.activationId} 不存在或已跳过`);continue}
    if(source.node.kind==='work'){
     const release=m.releases?.find(d=>d.id===source.releaseId),tasks=release?effectiveReleaseTasks(m,release):[]
     if(tasks.length!==source.node.memberIds.length||tasks.some(t=>!resultIsUsable(t,source.node.requireReview||!release!.tasks.some(old=>old.taskId===t.taskId))))v.missing.push(`来源执行 ${b.activationId} 未完整提交`)
     else {v.messageIds.push(...tasks.map(t=>t.resultMessageId!));v.sourceActivationIds.push(source.id)}
    }else if(source.node.kind==='minutes'){
     const record=m.minutes?.find(x=>x.id===source.minutesId),event=m.events.find(e=>e.kind==='minutes'&&e.minutesId===source.minutesId)
     if(!record||!event||!stream.has(event.id))v.missing.push(`来源纪要 ${source.id} 未完成或记录缺失`)
     else {v.messageIds.push(event.id);v.sourceActivationIds.push(source.id)}
    }else if(source.node.decision&&!source.choiceEdgeId)v.missing.push(`来源汇合 ${source.id} 尚未选路`)
    else {v.messageIds.push(...source.messageIds);v.assetIds.push(...source.assetIds);v.sourceActivationIds.push(source.id)}
   }
  }
  if(n.kind==='work')for(const id of n.memberIds)if(!m.memberSessionIds.includes(id)||id===m.secretary?.sessionId)v.missing.push(`成员 ${id} 已离会或不是普通成员`)
  if(n.kind==='minutes'&&m.secretary?.status!=='ready')v.missing.push('会议秘书尚未就绪')
  // Every input binding keeps the producer of the result it actually freezes,
  // including revisions selected through an older logical activation.
  for(const task of (m.releases??[]).flatMap(r=>r.tasks))if(task.resultMessageId&&v.messageIds.includes(task.resultMessageId)&&task.workflow?.runId===run.id)v.sourceActivationIds.push(task.workflow.activationId)
  // A prior join may already be frozen when a source is later returned. Keep its
  // historical input, but do not let a NEW downstream start bypass that return.
  const checkedSources=new Set<string>(),checkSource=(id:string):void=>{if(checkedSources.has(id))return;checkedSources.add(id);const source=run.activations.find(a=>a.id===id);if(!source||source.skipped)return;const release=m.releases?.find(r=>r.id===source.releaseId);if(source.node.kind==='work'&&release&&effectiveReleaseTasks(m,release).some(t=>!resultIsUsable(t,source.node.requireReview||!release.tasks.some(old=>old.taskId===t.taskId))))v.missing.push(`来源「${source.node.title}」仍待验收或已退回，不能开始新的下游任务`);source.sourceActivationIds.forEach(checkSource)}
  v.sourceActivationIds.forEach(checkSource)
  for(const messageId of v.messageIds){const task=(m.releases??[]).flatMap(r=>r.tasks).find(t=>t.resultMessageId===messageId);if(!task)continue;const activation=task.workflow?m.workflow?.runs.find(r=>r.id===task.workflow!.runId)?.activations.find(a=>a.id===task.workflow!.activationId):undefined;if(!resultIsUsable(task,activation?.node.requireReview||!!(m.releases??[]).find(r=>r.parentTaskId&&r.tasks.includes(task))))v.missing.push(`所选结果 ${messageId} 已被退回或仍待验收，请选择合格的正式结果`)}
  v.messageIds=unique(v.messageIds);v.assetIds=unique([...v.assetIds,...v.messageIds.flatMap(id=>stream.get(id)?.assetIds??[])]);v.sourceActivationIds=unique(v.sourceActivationIds)
  if(v.messageIds.some(id=>!stream.has(id))||v.assetIds.some(id=>!assets.has(id)))v.missing.push('绑定的消息或附件已缺失')
  if(!Number.isSafeInteger(slot.round)){v.status='limit';v.missing.push('轮次超出可记录范围，请新建运行')}
  else if(!v.missing.length)v.status=n.stepsInternal!==undefined?'submitted':n.kind==='join'&&run.executionPolicy!=='per-node-v1'?(n.decision?'waiting_decision':'submitted'):'ready'
  if(run.status!=='active'&&v.status==='ready')v.status='ended'
  return done()
 }
 return run.definition.nodes.map(n=>evaluate(n.id))
}

export function previewWorkflow(m:Meeting,run:WorkflowRun,nodeIds:string[],retry=false):WorkflowPlan {
 if(!Array.isArray(nodeIds)||!nodeIds.length||new Set(nodeIds).size!==nodeIds.length||nodeIds.some(id=>!run.definition.nodes.some(n=>n.id===id)))throw new Error('请选择存在且不重复的流程节点')
 if(nodeIds.some(id=>run.definition.nodes.some(n=>n.id===id&&n.stepsInternal!==undefined)))throw Error('内部依赖步骤不能作为执行环节，请选择实际工作步骤')
 const ignore=retry?new Set(nodeIds.map(id=>workflowSlot(run,id).slotKey)):undefined
 const currentViews=retry?workflowViews(m,run):undefined
 const views=workflowViews(m,run,ignore),stream=meetingMessageStream(m),missing:string[]=[]
 if(m.releasePaused||m.archivedAt||m.deletion||run.paused||run.status!=='active')missing.push('会议或流程已暂停、归档或结束')
 const items=nodeIds.map(id=>{
  const node=run.definition.nodes.find(n=>n.id===id)!,view=views.find(v=>v.nodeId===id)!
  if(retry)missing.push(...workflowRetryIssues(m,run,id,currentViews!.find(v=>v.nodeId===id)!.status))
  if(view.status!=='ready')missing.push(`「${node.title}」尚不可开始`)
  missing.push(...view.missing)
  const messages=view.messageIds.map(id=>stream.find(x=>x.id===id)),assets=view.assetIds.map(id=>m.assets?.find(a=>a.id===id))
  const characters=JSON.stringify(messages).length+JSON.stringify(assets.map(a=>a?assetInputText(a,m):'')).length+node.instruction.length
  if(characters>100000)missing.push(`「${node.title}」输入超过100000字符，请减少资料`)
  if(assets.filter(a=>a&&assetImageRef(a)).length>4)missing.push(`「${node.title}」最多接收4张图片`)
  return {node,view,messageIds:view.messageIds,assetIds:view.assetIds,characters,sourceActivationIds:view.sourceActivationIds,incomingEdgeIds:view.incomingEdgeIds}
 })
 const work=items.filter(x=>x.node.kind==='work').reduce((n,x)=>n+x.node.memberIds.length,0),minutes=items.filter(x=>x.node.kind==='minutes').length
 if(minutes>1||minutes&&(m.minutesJob?.status==='running'||run.activations.some(a=>a.minutesStatus==='reserved'||a.minutesStatus==='running')))missing.push('同一会议一次只能生成一份纪要，请等待当前秘书任务结束')
 const budget=workflowBudget(run)
 if(run.workReserved+work>budget.workAttempts)missing.push('普通成员投递额度不足，可在进程页手动追加')
 if(run.minutesStarted+minutes>budget.minutesStarts)missing.push('秘书生成额度不足，可在进程页手动追加')
 for(const x of items)if(run.activations.filter(a=>a.slotKey===x.view.slotKey&&!a.temporary&&!a.skipped).length>=run.definition.limits.nodeAttempts)missing.push(`「${x.node.title}」已达到本轮执行尝试上限`)
 const fingerprint=workflowHash({runId:run.id,definition:workflowSemantic(run.definition),budget,revision:run.definition.revision,rounds:run.rounds,members:m.memberSessionIds,secretary:m.secretary,workReserved:run.workReserved,minutesStarted:run.minutesStarted,items:items.map(x=>({nodeId:x.node.id,slot:x.view.slotKey,activation:x.view.activationId,sources:x.sourceActivationIds,edges:x.incomingEdgeIds,messages:x.messageIds.map(id=>stream.find(s=>s.id===id)),assets:x.assetIds.map(id=>m.assets?.find(a=>a.id===id))})),missing})
 return {runId:run.id,definitionRevision:run.definition.revision,nodeIds,fingerprint,ready:!missing.length,missing:unique(missing),items}
}
