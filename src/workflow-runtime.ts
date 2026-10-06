import {assetModelSnapshot} from './asset-reference.ts'
import {verifyWorkflowCards,workflowDraftWarnings} from './workflow-card.ts'
import {workflowRetryIssues} from './workflow-retry.ts'
import {randomUUID} from 'node:crypto'
import {mutateMeeting,stateRoot,listMeetings,type Meeting} from './meetings.ts'
import {freezeRelease,meetingMessageStream} from './meeting-flow.ts'
import {assertWorkflowDraft,assertWorkflowGraph,workflowSemantic} from './workflow-graph.ts'
import {isStepsDefinition} from './workflow-steps.ts'
import {latestActivation,previewWorkflow,workflowHash,workflowSlot,workflowViews} from './workflow-projection.ts'
import {workflowNeedsExplicitResume,validWorkflowId,type WorkflowDefinition,type WorkflowRun,type WorkflowState,type WorkflowActivation} from './workflow-types.ts'
import {workflowSupported} from './workflow-state.ts'
import {cancelMinutes} from './minutes.ts'
import {queuedWorkflowSlot} from './workflow-slot.ts'
import {workflowBudget} from './workflow-budget.ts'

const uid=()=>randomUUID()
function minutesContext(m:Meeting,r:WorkflowRun,ids:string[]){
 const seen=new Set<string>(),visit=(id:string)=>{if(seen.has(id))return;seen.add(id);r.activations.find(a=>a.id===id)?.sourceActivationIds.forEach(visit)};ids.forEach(visit)
 const sources=r.activations.filter(a=>seen.has(a.id)),omitted=new Set(sources.filter(a=>a.skipped).map(a=>a.id))
 for(const source of sources.filter(a=>a.node.kind==='join'))for(const g of r.definition.parallelGroups.filter(g=>g.joinId===source.nodeId)){
  const branchNodes=new Set<string>(),walk=(id:string)=>{if(id===g.joinId||branchNodes.has(id))return;branchNodes.add(id);r.definition.edges.filter(e=>e.from===id&&e.kind!=='loop').forEach(e=>walk(e.to))};g.branchIds.forEach(walk)
  for(const a of r.activations)if(a.skipped&&a.round===source.round&&a.loopId===source.loopId&&branchNodes.has(a.nodeId)&&latestActivation(r,a.slotKey)?.id===a.id)omitted.add(a.id)
 }
 return {context:sources.map(x=>({activationId:x.id,nodeId:x.nodeId,title:x.node.title,round:x.round,definitionRevision:x.definitionRevision,temporary:!!x.temporary,revisionOfTaskId:x.revisionOfTaskId,results:(m.releases?.find(d=>d.id===x.releaseId)?.tasks??[]).map(t=>({taskId:t.taskId,memberId:t.toSessionId,status:t.status,review:t.review??'not_reviewed',...(t.reviewNote?{reviewNote:t.reviewNote}:{})})),...(x.choiceEdgeId?{choice:r.definition.edges.find(e=>e.id===x.choiceEdgeId)?.label,reason:x.choiceReason}:{})})),omitted:r.activations.filter(a=>omitted.has(a.id)).map(a=>({activationId:a.id,title:a.node.title,round:a.round,reason:a.skipReason??'主持人跳过'}))}
}
function audit(r:WorkflowRun,action:string,details:string,activationId?:string){r.events.push({id:uid(),time:Date.now(),action,details,...(activationId?{activationId}:{})})}
function getRun(m:Meeting,runId:string){const r=m.workflow?.runs.find(r=>r.id===runId);if(!r)throw new Error('流程实例不存在');return r}
function managementRun(r:WorkflowRun){return r.automatic?.pauseReason&&r.automatic.pauseReason!=='主持人暂停后续执行'?{...r,paused:false}:r}
function available(m:Meeting,r:WorkflowRun){if(m.releasePaused||m.archivedAt||m.deletion||r.paused||r.status!=='active')throw new Error('会议或流程已暂停、归档或结束')}
export async function extendWorkflowBudget(meetingId:string,input:{runId:string;requestId:string;work:number;minutes:number;expected:{workAttempts:number;minutesStarts:number};confirmed:boolean}):Promise<void>{
 if(input.confirmed!==true)throw Error('请确认追加额度；追加不会开始任务')
 if(!validWorkflowId(input.requestId)||![input.work,input.minutes].every(n=>Number.isSafeInteger(n)&&n>=0)||input.work>1000||input.minutes>100||input.work+input.minutes===0)throw Error('追加额度非法：普通投递0—1000次，秘书0—100次，至少一项大于0')
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const r=getRun(m,input.runId),old=r.budgetGrants?.find(g=>g.requestId===input.requestId)
  if(old){if(old.work!==input.work||old.minutes!==input.minutes)throw Error('请求ID已用于不同的追加额度');return m}
  if(r.status!=='active'||m.archivedAt||m.deletion)throw Error('会议已归档或流程已结束，不能追加额度')
  const budget=workflowBudget(r)
  if(!input.expected||input.expected.workAttempts!==budget.workAttempts||input.expected.minutesStarts!==budget.minutesStarts)throw Error('额度已变化，请刷新后重新确认')
  if(!Number.isSafeInteger(budget.workAttempts+input.work)||!Number.isSafeInteger(budget.minutesStarts+input.minutes))throw Error('累计额度超出可记录范围')
  r.budgetGrants??=[];r.budgetGrants.push({requestId:input.requestId,work:input.work,minutes:input.minutes,createdAt:Date.now()})
  audit(r,'budget',`主持人追加普通投递${input.work}次、秘书${input.minutes}次；仅增加额度，未启动任何环节`);return m
 })
}
export async function saveWorkflow(meetingId:string,value:unknown,expectedRevision?:number,confirmedFuture=false):Promise<WorkflowDefinition>{
 assertWorkflowDraft(value);const definition=structuredClone(value)
 if(definition.executionPolicy==='per-node-v1')definition.nodes=definition.nodes.map(n=>n.stepsInternal?n:{...n,autoReceiveAndRun:n.autoReceiveAndRun===true})
 let saved!:WorkflowDefinition
 await mutateMeeting(stateRoot(),meetingId,m=>{
  if(m.archivedAt)throw new Error('会议已归档，不能修改流程')
  const state:WorkflowState=m.workflow??{schemaVersion:1,versions:[],runs:[]},old=state.draft
  if(old&&old.revision!==expectedRevision)throw new Error('流程定义已更新，请刷新后保存')
  const same=old&&workflowHash(workflowSemantic(old))===workflowHash(workflowSemantic(definition))
  saved={...structuredClone(definition),revision:old?(same?old.revision:old.revision+1):1,layoutRevision:(old?.layoutRevision??0)+1}
  const active=state.runs.find(r=>r.status==='active')
  if(active&&active.executionPolicy!==definition.executionPolicy)throw Error('活动流程的执行策略已冻结；请结束旧运行后在新流程中切换')
  if(active){
   assertWorkflowGraph(saved)
   if(isStepsDefinition(active.definition)!==isStepsDefinition(saved))throw Error('活动流程的步骤编排格式已冻结；请结束旧运行后切换')
   if(isStepsDefinition(active.definition)&&(workflowHash(active.definition.steps)!==workflowHash(saved.steps)||workflowHash(active.definition.edges)!==workflowHash(saved.edges)||workflowHash(active.definition.nodes.map(n=>({id:n.id,kind:n.kind,stepsInternal:n.stepsInternal})))!==workflowHash(saved.nodes.map(n=>({id:n.id,kind:n.kind,stepsInternal:n.stepsInternal})))))throw Error('运行中的步骤结构已冻结；请结束本轮后调整顺序或并行阶段')
  }
  if(active&&!same){
   if(active.automatic&&!confirmedFuture)throw Error('请明确确认更新自动协作尚未开始的环节；历史冻结输入不会变化')
   if(active.definition.id!==saved.id)throw new Error('活动流程不能替换为另一个定义')
   if(workflowHash(active.definition.loops)!==workflowHash(saved.loops)||workflowHash(active.definition.parallelGroups)!==workflowHash(saved.parallelGroups)||workflowHash(active.definition.limits)!==workflowHash(saved.limits)||active.definition.entryId!==saved.entryId)throw new Error('运行中不能更改回路、并行组、入口或额度')
   const frozen=new Set(active.activations.filter(a=>!a.temporary).map(a=>a.nodeId))
   for(const id of frozen)if(workflowHash(active.definition.nodes.find(n=>n.id===id))!==workflowHash(saved.nodes.find(n=>n.id===id)))throw new Error('已激活节点的配置已冻结；请在新流程中修改')
   const consumedEdges=(d:WorkflowDefinition)=>d.edges.filter(e=>frozen.has(e.from)||frozen.has(e.to))
   if(workflowHash(consumedEdges(active.definition))!==workflowHash(consumedEdges(saved)))throw new Error('已激活节点的连接关系已冻结')
  }
  if(isStepsDefinition(saved))state.schemaVersion=3
  else if(saved.executionPolicy==='per-node-v1')state.schemaVersion=Math.max(state.schemaVersion,2)
  if(old&&!state.versions.some(v=>v.id===old.id&&v.revision===old.revision&&workflowHash(workflowSemantic(v))===workflowHash(workflowSemantic(old))))state.versions.push(structuredClone(old))
  if(!same)state.versions.push(structuredClone(saved))
  state.draft=saved
  if(active){
   active.definition=structuredClone(saved)
   if(!same){
    if(active.executionPolicy==='per-node-v1'&&active.automatic){active.paused=true;if(active.automatic.pauseReason!=='主持人暂停后续执行')active.automatic.pauseReason='尚未开始的环节配置已保存；核对后确认继续逐环节接力，尚未启动'}
    audit(active,'definition',active.executionPolicy==='per-node-v1'?'更新尚未激活的环节；配置仅保存，确认继续后才可接力':'更新尚未激活的环节')
   }
  }
  return {...m,workflow:state}
 });return saved
}
export async function createWorkflowRun(meetingId:string,definitionRevision:number,requestId:string,mode:'manual'|'automatic'='manual',confirmed=false):Promise<WorkflowRun>{
 if(mode==='automatic'&&!confirmed)throw Error('请确认自动协作的成员、资料、停止点、预算和轮次上限')
 if(!validWorkflowId(requestId)||requestId.length>80)throw new Error('请求ID非法');let result!:WorkflowRun
 await mutateMeeting(stateRoot(),meetingId,m=>{
  if(m.archivedAt||m.releasePaused)throw new Error('会议已暂停或归档')
  const state=m.workflow,d=state?.draft;if(!state||!d)throw new Error('请先保存流程')
  if(d.executionPolicy==='per-node-v1')throw Error('逐环节运行请使用初始执行预览，并以该预览指纹确认开始；不能只建立自动容器')
  const effectiveMode=mode
    const id=`run-${requestId}`,existing=state.runs.find(r=>r.id===id)
  if(existing){if((existing.automatic?'automatic':'manual')!==effectiveMode)throw Error('请求ID已用于不同协作模式');if(existing.events[0]?.details!==String(definitionRevision))throw new Error('请求ID已用于另一次运行');result=existing;return m}
  if(d.revision!==definitionRevision)throw new Error('流程版本已更新，请重新预览')
  if(state.runs.some(r=>r.status==='active'))throw new Error('当前会议已有活动流程')
  assertWorkflowGraph(d)
  result={id,...(d.executionPolicy?{executionPolicy:d.executionPolicy}:{}),definition:structuredClone(d),status:'active',paused:false,createdAt:Date.now(),rounds:Object.fromEntries(d.loops.map(l=>[l.id,1])),activations:[],workReserved:0,minutesStarted:0,events:[]}
  if(effectiveMode==='automatic')result.automatic={mode:'automatic',authorizedAt:Date.now(),roundCaps:Object.fromEntries(d.loops.map(l=>[l.id,l.maxRounds]))}
  audit(result,'created',String(definitionRevision));state.runs.push(result);return m
 });return result
}
function closeActivations(m:Meeting,r:WorkflowRun,ids:Set<string>,reason:string){
 for(const d of m.releases??[])for(const t of d.tasks)if(t.workflow?.runId===r.id&&ids.has(t.workflow.activationId)&&!['completed','failed','cancelled'].includes(t.status))Object.assign(t,{status:'cancelled',closedAt:Date.now(),updatedAt:Date.now(),closedReason:reason,error:reason})
}
function skippedActivation(r:WorkflowRun,nodeId:string,reason:string):WorkflowActivation {
 const n=r.definition.nodes.find(n=>n.id===nodeId)!,slot=workflowSlot(r,nodeId)
 return {id:uid(),nodeId,...slot,attempt:(latestActivation(r,slot.slotKey)?.attempt??0)+1,definitionRevision:r.definition.revision,node:structuredClone(n),createdAt:Date.now(),requestId:uid(),requestHash:'skip',inputFingerprint:'',messageIds:[],assetIds:[],sourceActivationIds:[],incomingEdgeIds:[],skipped:true,skipReason:reason}
}
export function previewPartialWorkflow(m:Meeting,r:WorkflowRun,joinId:string){
 if(r.definition.nodes.find(n=>n.id===joinId)?.stepsInternal)throw Error('内部步骤依赖必须等待全部分支真实完成，不能部分继续')
 const group=r.definition.parallelGroups.find(g=>g.joinId===joinId)
 if(!group)throw new Error('这里只能对明确的并行汇合选择部分继续')
 const views=workflowViews(m,r),joinView=views.find(v=>v.nodeId===joinId)!
 const branches=group.branchIds.map(branchId=>{
  const ids=new Set<string>();const visit=(id:string)=>{if(id===joinId||ids.has(id))return;ids.add(id);r.definition.edges.filter(e=>e.from===id&&e.kind!=='loop').forEach(e=>visit(e.to))};visit(branchId)
  const ends=r.definition.edges.filter(e=>e.to===joinId&&ids.has(e.from)).map(e=>views.find(v=>v.nodeId===e.from)!)
  const active=ends.filter(v=>!['not_walked','skipped'].includes(v.status)),submitted=active.length>0&&active.every(v=>v.status==='submitted')
  return {branchId,title:r.definition.nodes.find(n=>n.id===branchId)!.title,nodeIds:[...ids],submitted,active:active.length>0,ends}
 })
 return {joinId,branches,skipBranchIds:branches.filter(b=>b.active&&!b.submitted).map(b=>b.branchId),fingerprint:workflowHash({runId:r.id,revision:r.definition.revision,joinView,branches})}
}
export async function continuePartialWorkflow(meetingId:string,input:{runId:string;joinId:string;skipBranchIds:string[];fingerprint:string;confirmed:boolean;reason:string}):Promise<void>{
 if(input.confirmed!==true||!input.reason?.trim())throw new Error('请确认缺失分支并填写部分继续的原因')
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const r=getRun(m,input.runId);available(m,managementRun(r));const plan=previewPartialWorkflow(m,r,input.joinId)
  if(plan.fingerprint!==input.fingerprint)throw new Error('分支状态已变化，请重新确认缺失清单')
  if(!plan.branches.some(b=>b.submitted)||!plan.skipBranchIds.length)throw new Error('需要至少一个已提交分支和一个未完成分支')
  if(!Array.isArray(input.skipBranchIds)||workflowHash([...input.skipBranchIds].sort())!==workflowHash([...plan.skipBranchIds].sort()))throw new Error('必须明确确认全部未完成分支')
  const ids=new Set(plan.branches.filter(b=>input.skipBranchIds.includes(b.branchId)).flatMap(b=>b.nodeIds))
  const existing=r.activations.filter(a=>ids.has(a.nodeId)&&a.slotKey===workflowSlot(r,a.nodeId).slotKey)
  if(r.activations.some(a=>!ids.has(a.nodeId)&&a.sourceActivationIds.some(id=>existing.some(x=>x.id===id))))throw new Error('后续环节已经使用这些结果，不能更改汇合来源')
  closeActivations(m,r,new Set(existing.map(a=>a.id)),`部分继续，跳过：${input.reason}`)
  for(const id of ids){const a=skippedActivation(r,id,input.reason);r.activations.push(a);audit(r,'partial-skip',`${a.node.title}：${input.reason}`,a.id)}
  audit(r,'partial-continue',`汇合 ${input.joinId}；缺失分支 ${input.skipBranchIds.join('、')}；${input.reason}`)
  return m
 })
}
export async function clearWorkflowChoice(meetingId:string,runId:string,nodeId:string,activationId?:string):Promise<void>{
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const r=getRun(m,runId);available(m,managementRun(r));const a=activationId?r.activations.find(a=>a.id===activationId&&a.nodeId===nodeId):latestActivation(r,workflowSlot(r,nodeId).slotKey)
  if(!a?.choiceEdgeId)return m
  if(r.activations.some(x=>x.sourceActivationIds.includes(a.id)))throw new Error('所选路径已开始执行，不能撤销；请按返工路径处理或停止流程')
  audit(r,'clear-choice',`撤销 ${a.choiceEdgeId}`,a.id);delete a.choiceEdgeId;delete a.choiceReason;return m
 })
}
export async function queueWorkflowInput(meetingId:string,runId:string,nodeId:string,messageId:string):Promise<{slotKey:string;round:number}>{
 let result!:{slotKey:string;round:number}
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const {run:r,node:n,slot}=workflowQueueTarget(m,runId,nodeId)
  if(!meetingMessageStream(m).some(x=>x.id===messageId))throw new Error('所选会议消息不存在')
  r.pendingInputs??={};const inputs=r.pendingInputs[slot.slotKey]??=[]
  if(!inputs.some(b=>b.kind==='message'&&b.id===messageId)){inputs.push({kind:'message',id:messageId});audit(r,'queue-input',`为「${n.title}」第${slot.round||1}轮暂存消息 ${messageId}；尚未投递`)}
  result=slot;return m
 });return result
}
export async function addWorkflowInputs(meetingId:string,input:{runId:string;nodeId:string;requestId:string;text:string;messageIds:string[];assetIds:string[];confirmed:boolean}):Promise<{slotKey:string;round:number;messageId?:string}>{
 if(input.confirmed!==true)throw Error('请确认将资料暂存到指定环节；不会立即执行')
 if(!validWorkflowId(input.requestId)||input.requestId.length>80||typeof input.text!=='string'||input.text.length>100000||![input.messageIds,input.assetIds].every(a=>Array.isArray(a)&&a.every(x=>typeof x==='string'))||!input.text.trim()&&!input.messageIds.length&&!input.assetIds.length)throw Error('请输入或选择要补充的资料')
 const {confirmed,...identity}=input;const requestHash=workflowHash(identity),auditId=`input-${input.requestId}`;let result!:{slotKey:string;round:number;messageId?:string}
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const r=getRun(m,input.runId),old=r.events.find(e=>e.id===auditId)
  if(old){const previous=JSON.parse(old.details);if(previous.hash!==requestHash)throw Error('补充请求编号已用于其他内容');result=previous.result;return m}
  if(m.archivedAt||m.deletion||m.releasePaused||r.status!=='active')throw Error('会议或流程已结束、暂停或归档')
  const node=r.definition.nodes.find(n=>n.id===input.nodeId),slot=queuedWorkflowSlot({...r,paused:false},input.nodeId)
  if(!node||node.kind==='join'||!slot)throw Error('请选择尚可补充输入的成员或秘书环节')
  const messages=meetingMessageStream(m)
  if(input.messageIds.some(id=>!messages.some(x=>x.id===id&&!x.previewOnly))||input.assetIds.some(id=>!m.assets?.some(a=>a.id===id)))throw Error('所选会议资料已经缺失，请刷新后重新选择')
  const messageId=input.text.trim()?`workflow-input-${input.requestId}`:undefined
  if(messageId)m.events.push({id:messageId,kind:'message',by:'user',time:Date.now(),text:input.text.trim(),replyTo:[...input.messageIds],assetIds:[...input.assetIds]})
  r.pendingInputs??={};const queued=r.pendingInputs[slot.slotKey]??=[]
  for(const binding of [...input.messageIds.map(id=>({kind:'message' as const,id})),...input.assetIds.map(id=>({kind:'asset' as const,id})),...(messageId?[{kind:'message' as const,id:messageId}]:[])])if(!queued.some(b=>b.kind===binding.kind&&(b.kind==='message'||b.kind==='asset')&&b.id===binding.id))queued.push(binding)
  r.pendingInputs[slot.slotKey]=queued;result={slotKey:slot.slotKey,round:slot.round,...(messageId?{messageId}:{})}
  if(r.automatic){r.paused=true;r.automatic.pauseReason='环节补充输入已暂存；核对新增资料后确认继续自动协作，尚未执行'}
  r.events.push({id:auditId,time:Date.now(),action:'stage-materials',details:JSON.stringify({hash:requestHash,result,summary:`「${node.title}」第${slot.round||1}轮资料已暂存，沿用${node.kind==='minutes'?'秘书':node.memberIds.join('、')}，没有投递或推进`})});return m
 });return result
}
/** Read-only exact target resolution, shared by the stage picker and atomic chat staging. */
export function workflowQueueTarget(m:Meeting,runId:string,nodeId:string){
 const run=getRun(m,runId);available(m,run)
 const node=run.definition.nodes.find(n=>n.id===nodeId);if(!node||node.kind==='join')throw new Error('请选择成员或秘书处理环节')
 const slot=queuedWorkflowSlot(run,nodeId)
 if(!slot)throw new Error('该环节已开始且没有可用下一轮；请临时点名或新建运行')
 return {run,node,slot}
}
export async function bypassWorkflowNode(meetingId:string,input:{runId:string;nodeId:string;expectedActivationId?:string;confirmed:boolean;reason:string}):Promise<void>{
 if(input.confirmed!==true||!input.reason?.trim())throw new Error('请确认跳过并填写原因；后续只沿用本环节已有输入')
 let cancelledJob:string|undefined
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const r=getRun(m,input.runId);available(m,managementRun(r));const node=r.definition.nodes.find(n=>n.id===input.nodeId)
  if(!node||node.kind==='join')throw new Error('只能跳过成员或秘书处理环节；汇合请使用选路或部分继续')
  if(r.definition.loops.some(l=>l.advanceId===node.id))throw new Error('修改环节不能用跳过推进轮次，请选择退出路线或停止流程')
  const slot=workflowSlot(r,node.id),old=latestActivation(r,slot.slotKey)
  if(old?.skipped&&old.skipMode==='bypass')return m
  if(old?.id!==input.expectedActivationId)throw new Error('环节执行已变化，请重新检查后确认')
  if(old&&r.activations.some(a=>a.sourceActivationIds.includes(old.id)))throw new Error('下游已使用本次结果，不能改写；请另建执行或走返工路径')
  const view=workflowViews(m,r).find(v=>v.nodeId===node.id)!
  if(!old&&view.status!=='ready')throw new Error('本环节输入尚未齐全，不能沿用不存在的输入')
  const a=skippedActivation(r,node.id,input.reason);a.skipMode='bypass'
  a.messageIds=[...(old?.messageIds??view.messageIds)];a.assetIds=[...(old?.assetIds??view.assetIds)];a.sourceActivationIds=[...(old?.sourceActivationIds??view.sourceActivationIds)];a.incomingEdgeIds=[...(old?.incomingEdgeIds??view.incomingEdgeIds)]
  if(old){closeActivations(m,r,new Set([old.id]),`主持人跳过：${input.reason}`);if(old.minutesStatus==='running'||old.minutesStatus==='reserved'){old.minutesStatus='cancelled';cancelledJob=old.minutesJobId}}
  const messageId=`skip-${a.id}`;m.events.push({id:messageId,kind:'message',by:'user',time:Date.now(),text:`【主持人跳过处理】${node.title}：${input.reason}。本环节没有作为成功结果使用，后续仅沿用已有输入。`,replyTo:[...a.messageIds]});a.messageIds.push(messageId)
  r.activations.push(a);audit(r,'bypass',`${node.title}：${input.reason}；仅沿用输入，下一环节仍需手动开始`,a.id);return m
 })
 if(cancelledJob)await cancelMinutes(meetingId,cancelledJob)
}
interface StartInput {runId:string;nodeIds:string[];fingerprint:string;requestId:string;retry?:boolean;confirmed?:boolean;automaticAdmission?:boolean;initial?:boolean}
export function activateWorkflowNodes(m:Meeting,input:StartInput):WorkflowActivation[]{
 if(!validWorkflowId(input.requestId))throw new Error('请求ID非法');let result:WorkflowActivation[]=[]
 const requestHash=workflowHash(input)
  const r=getRun(m,input.runId),existing=r.activations.filter(a=>a.requestId===input.requestId)
  if(input.nodeIds.some(id=>r.definition.nodes.find(n=>n.id===id)?.stepsInternal))throw Error('内部步骤依赖不能执行；请选择实际成员步骤')
  if(existing.length){if(existing.some(a=>a.requestHash!==requestHash))throw new Error('相同请求ID不能使用不同输入');return existing}
  available(m,r)
  if(r.executionPolicy==='per-node-v1'&&!input.automaticAdmission&&input.confirmed!==true)throw Error('请预览并明确确认开始所选环节；未勾选不能由自动容器代为授权')
  if(input.initial&&(r.executionPolicy!=='per-node-v1'||workflowHash(input.nodeIds)!==workflowHash(initialNodeIds(r.definition))||r.activations.length))throw Error('初始预览只能用于尚未激活的完整首步骤')
  if(input.automaticAdmission&&r.executionPolicy==='per-node-v1'&&(!r.automatic||input.nodeIds.some(id=>r.definition.nodes.find(n=>n.id===id)?.autoReceiveAndRun!==true||r.definition.nodes.find(n=>n.id===id)?.confirmation)))throw Error('自动接力仅能开始明确勾选且无需主持确认的环节')
  const plan=input.initial?initialPreviewPlan(m,r):previewWorkflow(m,r,input.nodeIds,input.retry)
  const automaticAdmission=!!r.automatic&&(r.executionPolicy!=='per-node-v1'||input.automaticAdmission===true)
  if(plan.fingerprint!==input.fingerprint)throw new Error('流程、成员或输入已变，请重新预览')
  if(!plan.ready)throw new Error(plan.missing.join('；'))
  const automaticItems=automaticAdmission?plan.items:input.initial&&r.executionPolicy==='per-node-v1'?plan.items.filter(item=>item.node.autoReceiveAndRun===true):[]
  if(automaticItems.length){const warnings=workflowDraftWarnings(m,automaticItems);if(warnings.length)throw Error(warnings.join('；'))}
  if(automaticAdmission)for(const item of plan.items)if(item.view.loopId&&item.view.round>r.automatic!.roundCaps[item.view.loopId]!)throw Error('自动协作轮次上限已到，请明确追加后继续')
  for(const item of plan.items){
   const old=latestActivation(r,item.view.slotKey)
   if(old&&!input.retry)throw new Error('本环节已经开始')
   if(old&&input.retry){
    const oldView=workflowViews(m,r).find(x=>x.nodeId===item.node.id)!
    const issues=workflowRetryIssues(m,r,item.node.id,oldView.status);if(issues.length)throw new Error(issues.join('；'))
    closeActivations(m,r,new Set([old.id]),'主持人重新执行本节点')
   }
   const attempts=r.activations.filter(a=>a.slotKey===item.view.slotKey).length
   for(const member of item.node.memberIds){
    const ids=new Set(r.activations.filter(a=>a.slotKey===item.view.slotKey).map(a=>a.id))
    const used=(m.releases??[]).flatMap(d=>d.tasks).filter(t=>t.toSessionId===member&&t.workflow?.runId===r.id&&ids.has(t.workflow.activationId)).reduce((n,t)=>n+t.workflow!.reservedDeliveries,0)
    if(used>=r.definition.limits.nodeAttempts)throw new Error('本轮成员执行额度已用尽')
   }
   const a:WorkflowActivation={id:uid(),nodeId:item.node.id,slotKey:item.view.slotKey,round:item.view.round,...(item.view.loopId?{loopId:item.view.loopId}:{}),attempt:attempts+1,definitionRevision:r.definition.revision,node:structuredClone(item.node),createdAt:Date.now(),requestId:input.requestId,requestHash,inputFingerprint:input.fingerprint,messageIds:item.messageIds,assetIds:item.assetIds,sourceActivationIds:item.sourceActivationIds,incomingEdgeIds:item.incomingEdgeIds}
   if(item.node.kind==='work'){
    const release=freezeRelease(m,{id:`workflow-${a.id}`,version:1,status:'draft',title:item.node.title,instruction:item.node.instruction||'请根据所选资料完成本环节并提交正式结果',messageIds:a.messageIds,assetIds:a.assetIds,recipientIds:item.node.memberIds,createdAt:Date.now(),tasks:[]})
    for(const t of release.tasks)t.workflow={runId:r.id,activationId:a.id,reservedDeliveries:1}
    a.releaseId=release.id;r.workReserved+=release.tasks.length;m.releases=[...(m.releases??[]),release]
   }else if(item.node.kind==='minutes'){
    a.minutesJobId=uid();a.minutesStatus='reserved';r.minutesStarted++
    a.minutesInput=structuredClone({title:m.title,description:m.description??'',memberIds:m.memberSessionIds,memberRoles:m.memberRoles??{},messages:meetingMessageStream(m).filter(x=>a.messageIds.includes(x.id)),assets:(m.assets??[]).filter(x=>a.assetIds.includes(x.id)).map(asset=>assetModelSnapshot(asset,m)),...minutesContext(m,r,a.sourceActivationIds)})
   }
   if(a.loopId)r.rounds[a.loopId]=Math.max(r.rounds[a.loopId]??1,a.round)
   r.activations.push(a);audit(r,'start',`${item.node.title} · 第${a.round||1}轮 · 尝试${a.attempt}`,a.id);result.push(a)
   for(const group of r.definition.parallelGroups.filter(g=>g.branchIds.includes(a.nodeId))){
    r.forks??=[];let fork=r.forks.find(f=>f.groupId===group.id&&f.round===a.round&&f.loopId===a.loopId)
    if(!fork){fork={id:uid(),groupId:group.id,round:a.round,...(a.loopId?{loopId:a.loopId}:{}),branchIds:[...group.branchIds],sourceActivationIds:[...a.sourceActivationIds],activationIds:[]};r.forks.push(fork)}
    fork.activationIds.push(a.id)
   }
  }
 return result
}
export async function startWorkflowNodes(meetingId:string,input:StartInput):Promise<WorkflowActivation[]>{
 let result:WorkflowActivation[]=[]
 await mutateMeeting(stateRoot(),meetingId,async m=>{const r=getRun(m,input.runId);if(workflowNeedsExplicitResume(r))throw Error('本轮已暂停；请先核对并确认继续本轮，开始单个环节不能替代未来规则或重启后的恢复授权');if(r.automatic&&r.paused&&input.confirmed===true&&r.automatic.pauseReason!=='主持人暂停后续执行'){r.paused=false;delete r.automatic.pauseReason}if(!r.activations.some(a=>a.requestId===input.requestId))await verifyWorkflowCards(m,input.nodeIds,r.definition.nodes);result=activateWorkflowNodes(m,input);return m});return result
}
function initialRun(m:Meeting,requestId:string):WorkflowRun {
 if(!validWorkflowId(requestId)||requestId.length>80)throw new Error('请求ID非法')
 const d=m.workflow?.draft;if(!d)throw new Error('请先保存流程')
 assertWorkflowGraph(d)
 if(m.workflow!.runs.some(r=>r.status==='active'))throw new Error('当前会议已有活动流程')
 return {id:`run-${requestId}`,...(d.executionPolicy?{executionPolicy:d.executionPolicy}:{}),definition:structuredClone(d),status:'active',paused:false,createdAt:Date.now(),rounds:Object.fromEntries(d.loops.map(l=>[l.id,1])),activations:[],workReserved:0,minutesStarted:0,events:[]}
}
function initialNodeIds(d:WorkflowDefinition):string[]{return isStepsDefinition(d)?[...(d.steps.stages[0]?.nodeIds??[])]:[d.entryId]}
function initialPreviewPlan(m:Meeting,run:WorkflowRun){
 const plan=previewWorkflow(m,run,initialNodeIds(run.definition)),item=plan.items[0]
 if(isStepsDefinition(run.definition))return plan
 if(run.executionPolicy!=='per-node-v1'||item?.node.kind!=='join'||!['submitted','waiting_decision'].includes(item.view.status)||item.view.missing.length)return plan
 const missing=plan.missing.filter(message=>message!==('「'+item.node.title+'」尚不可开始'))
 return {...plan,missing,ready:missing.length===0,fingerprint:workflowHash({initialJoin:true,base:plan.fingerprint})}
}
export function previewInitialWorkflow(m:Meeting,requestId:string){
 const run=initialRun(m,requestId)
 return initialPreviewPlan(m,run)
}
export async function startInitialWorkflow(meetingId:string,input:{requestId:string;definitionRevision:number;fingerprint:string;mode?:'manual'|'automatic';confirmed?:boolean}):Promise<WorkflowActivation[]>{
 if(input.mode==='automatic'&&input.confirmed!==true)throw Error('请确认自动协作的成员、资料、停止点、预算和轮次上限')
 let result:WorkflowActivation[]=[]
 await mutateMeeting(stateRoot(),meetingId,async m=>{
  const old=m.workflow?.runs.find(r=>r.id===`run-${input.requestId}`)
  if(old){
   if((old.automatic?'automatic':'manual')!==(old.executionPolicy==='per-node-v1'?'automatic':input.mode??'manual'))throw Error('请求ID已用于不同协作模式')
   if(old.events[0]?.action!=='created-and-started'||old.events[0]?.details!==String(input.definitionRevision))throw new Error('请求ID已用于不同操作')
   result=activateWorkflowNodes(m,{runId:old.id,nodeIds:initialNodeIds(old.definition),requestId:input.requestId,fingerprint:input.fingerprint,...(old.executionPolicy==='per-node-v1'?{initial:true,confirmed:true}:{})});return m
  }
  const run=initialRun(m,input.requestId)
  if(run.executionPolicy==='per-node-v1'&&input.confirmed!==true)throw Error('请预览并确认逐环节接力的成员、自动环节、手动停止点及额度')
  if(run.definition.revision!==input.definitionRevision)throw new Error('流程版本已改变，请重新预览')
  const plan=initialPreviewPlan(m,run)
  if(plan.fingerprint!==input.fingerprint)throw new Error('输入或会议状态已改变，请重新预览')
  if(!plan.ready)throw new Error(plan.missing.join('；'))
  if(run.executionPolicy==='per-node-v1'||input.mode==='automatic')run.automatic={mode:'automatic',authorizedAt:Date.now(),roundCaps:Object.fromEntries(run.definition.loops.map(l=>[l.id,l.maxRounds]))}
  await verifyWorkflowCards(m,initialNodeIds(run.definition),run.definition.nodes)
  audit(run,'created-and-started',String(input.definitionRevision));m.workflow!.runs.push(run)
  result=activateWorkflowNodes(m,{runId:run.id,nodeIds:initialNodeIds(run.definition),requestId:input.requestId,fingerprint:input.fingerprint,...(run.executionPolicy==='per-node-v1'?{initial:true,confirmed:true}:{})})
  return m
 });return result
}
export async function chooseWorkflowPath(meetingId:string,runId:string,nodeId:string,edgeId:string,reason=''):Promise<void>{
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const r=getRun(m,runId);available(m,r.automatic?.pauseReason?{...r,paused:false}:r)
  const node=r.definition.nodes.find(n=>n.id===nodeId),edge=r.definition.edges.find(e=>e.id===edgeId)
  if(!node?.decision||edge?.from!==nodeId||edge.kind!=='choice')throw new Error('请选择这个人工决策节点的合法出口')
  const v=workflowViews(m,r).find(v=>v.nodeId===nodeId)!,old=latestActivation(r,v.slotKey)
  if(old?.choiceEdgeId===edgeId)return m
  if(old?.choiceEdgeId)throw new Error('已有选路记录，请先撤销原选择')
  if(v.status!=='waiting_decision')throw new Error('当前环节仍缺少输入，不能选路')
  const a:WorkflowActivation=old??{id:uid(),nodeId,slotKey:v.slotKey,round:v.round,...(v.loopId?{loopId:v.loopId}:{}),attempt:1,definitionRevision:r.definition.revision,node:structuredClone(node),createdAt:Date.now(),requestId:uid(),requestHash:'manual-choice',inputFingerprint:workflowHash(v),messageIds:v.messageIds,assetIds:v.assetIds,sourceActivationIds:v.sourceActivationIds,incomingEdgeIds:v.incomingEdgeIds}
  a.choiceEdgeId=edgeId;a.choiceReason=reason;if(!old)r.activations.push(a);audit(r,'choice',`${edge.label}${reason?'：'+reason:''}`,a.id)
  return m
 })
}
export function canCompleteWorkflow(m:Meeting,r:WorkflowRun):boolean {
 const views=workflowViews(m,r),ends=r.definition.nodes.filter(n=>!r.definition.edges.some(e=>e.from===n.id)).map(n=>views.find(v=>v.nodeId===n.id)!)
 const pending=(m.releases??[]).flatMap(d=>d.tasks).some(t=>t.workflow?.runId===r.id&&!['completed','failed','cancelled'].includes(t.status))
 return !pending&&ends.some(v=>v.status==='submitted')&&ends.every(v=>['submitted','not_walked','skipped'].includes(v.status))
}
export async function controlWorkflow(meetingId:string,runId:string,action:'pause'|'resume'|'stop'|'complete'):Promise<void>{
 const cancelJobs:string[]=[]
 await mutateMeeting(stateRoot(),meetingId,m=>{
  const r=getRun(m,runId);if(r.status!=='active'){if(action==='stop'||action==='complete'&&r.status==='completed')return m;throw new Error('流程已结束')}
  if(action==='complete'){if(!canCompleteWorkflow(m,r))throw new Error('所选路径尚未全部提交，或仍有未结束任务；不能标为完成');r.status='completed';r.paused=true}
  else if(action==='stop'){r.status='stopped';r.paused=true;closeActivations(m,r,new Set(r.activations.map(a=>a.id)),'主持人停止流程，原窗口继续工作');for(const a of r.activations)if(a.minutesStatus==='running'||a.minutesStatus==='reserved'){a.minutesStatus='cancelled';if(a.minutesJobId)cancelJobs.push(a.minutesJobId)}}
  else {r.paused=action==='pause';if(r.automatic){if(action==='resume')delete r.automatic.pauseReason;else r.automatic.pauseReason='主持人暂停后续执行'}}
  audit(r,action,action==='pause'?'暂停新的开始和未投递任务':action==='resume'?r.automatic?'主持人确认继续自动协作，满足冻结条件的例行环节接力':'恢复已授权队列；可开始环节仍需人工开始':action==='complete'?'主持人确认本次流程完成，保留全部历史':'结束本流程等待');return m
 })
 for(const jobId of cancelJobs)await cancelMinutes(meetingId,jobId)
}
export async function recoverWorkflows(root:string):Promise<void>{
 for(const m of await listMeetings(root))if(!m.deletion&&workflowSupported(m)&&m.workflow?.runs.some(r=>r.status==='active'))await mutateMeeting(root,m.meetingId,current=>{
  for(const r of current.workflow!.runs)if(r.status==='active'){
   r.paused=true;if(r.automatic)r.automatic.pauseReason='服务重启，检查已投递与结果后确认继续自动协作；未自动重发'
   for(const a of r.activations)if(a.minutesStatus==='reserved'||a.minutesStatus==='running'){
    const record=current.minutes?.find(x=>x.workflow?.activationId===a.id&&x.workflow?.runId===r.id)
    if(record){a.minutesId=record.id;a.minutesStatus='completed'}
    else {a.minutesStatus='failed';a.minutesError='服务重启前未确认秘书生成，未自动重发'}
   }
   audit(r,'recovered','服务重启，流程暂停；检查结果后手动恢复')
  }return current
 })
}
