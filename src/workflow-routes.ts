import {pumpAutomaticWorkflows,extendAutomaticRounds} from './workflow-auto.ts'
import {bindWorkflowCard,workflowDraftWarnings} from './workflow-card.ts'
import {listPublishedTaskCards} from './task-cards.ts'
import type {WorkflowCardBinding} from './workflow-types.ts'
import {addWorkflowInputs} from './workflow-runtime.ts'
import {inboxHasPending} from './host-runtime.ts'
/** User-side route adapter only; ordinary Agent tools cannot start or route workflows. */
import type {Context} from '@deepseek-ai/cordis'
import {SessionId} from '@deepseek-ai/dsh-session'
import {mutateMeeting,requireActiveMeeting,stateRoot,type Meeting} from './meetings.ts'
import {validateWorkflowDraft,validateWorkflowGraph,layoutWorkflow} from './workflow-graph.ts'
import {previewWorkflow,workflowViews} from './workflow-projection.ts'
import {saveWorkflow,createWorkflowRun,startWorkflowNodes,chooseWorkflowPath,clearWorkflowChoice,controlWorkflow,previewPartialWorkflow,continuePartialWorkflow,queueWorkflowInput,previewInitialWorkflow,startInitialWorkflow,bypassWorkflowNode} from './workflow-runtime.ts'
import {startMinutes} from './minutes.ts'
import type {WorkflowDefinition,WorkflowActivation,WorkflowPlan} from './workflow-types.ts'
import {isStepsDefinition} from './workflow-steps.ts'
import {previewTemporary,startTemporary,type TemporaryInput} from './workflow-temporary.ts'
import {extendWorkflowBudget} from './workflow-runtime.ts'
function withAvailability(ctx:Context,plan:WorkflowPlan,m?:Meeting):WorkflowPlan {
 const ids=[...new Set(plan.items.flatMap(x=>x.node.memberIds))]
 return {...plan,...(m?{warnings:workflowDraftWarnings(m,plan.items)}:{}),memberAvailability:Object.fromEntries(ids.map(id=>{const a=ctx.agents.get(SessionId(id));return [id,{connected:!!a,busy:a?.status==='running'||(a?inboxHasPending(a.inbox):false)}]}))}
}
async function startBoundMinutes(ctx:Context,meetingId:string,runId:string,activations:WorkflowActivation[]){
 for(const a of activations)if(a.node.kind==='minutes'&&a.minutesJobId&&a.minutesStatus==='reserved'){
  try{await startMinutes(ctx,meetingId,'full',{runId,activationId:a.id,jobId:a.minutesJobId})}
  catch(error){await mutateMeeting(stateRoot(),meetingId,m=>{const a2=m.workflow?.runs.find(r=>r.id===runId)?.activations.find(x=>x.id===a.id);if(a2?.minutesStatus==='reserved'){a2.minutesStatus='failed';a2.minutesError=String(error instanceof Error?error.message:error)}return m})}
 }
}

export async function workflowAction(ctx:Context,meetingId:string,action:string,body:Record<string,unknown>):Promise<unknown>{
 const string=(key:string)=>{if(typeof body[key]!=='string'||!(body[key] as string).trim())throw new Error(`缺少 ${key}`);return body[key] as string}
 const ids=(key:string)=>{if(!Array.isArray(body[key])||(body[key] as unknown[]).some(x=>typeof x!=='string'))throw new Error(`非法 ${key}`);return body[key] as string[]}
 if(action==='workflow-validate')return {issues:validateWorkflowDraft(body.definition)}
 if(action==='workflow-layout'){
  const issues=validateWorkflowGraph(body.definition);return issues.length?{issues}:{definition:layoutWorkflow(body.definition as WorkflowDefinition),issues:[]}
 }
 if(action==='workflow-save')return {definition:await saveWorkflow(meetingId,body.definition,typeof body.expectedRevision==='number'?body.expectedRevision:undefined,body.confirmedFuture===true)}
 if(action==='workflow-published-cards')return {cards:listPublishedTaskCards(await requireActiveMeeting(stateRoot(),meetingId))}
 if(action==='workflow-bind-card'){const m=await requireActiveMeeting(stateRoot(),meetingId);return {node:bindWorkflowCard(m,body.node as import('./workflow-types.ts').WorkflowNode,body.binding as WorkflowCardBinding)}}
 if(action==='workflow-initial-preview'){const m=await requireActiveMeeting(stateRoot(),meetingId),plan=previewInitialWorkflow(m,string('requestId'));return {plan:{...withAvailability(ctx,plan,m),...(isStepsDefinition(m.workflow?.draft)?{automaticWarnings:workflowDraftWarnings(m,plan.items.filter(item=>item.node.autoReceiveAndRun===true))}:{})}}}
 if(action==='workflow-initial-start'){
  if(typeof body.definitionRevision!=='number')throw new Error('缺少流程版本')
  const requestId=string('requestId'),activations=await startInitialWorkflow(meetingId,{requestId,definitionRevision:body.definitionRevision,fingerprint:string('fingerprint'),mode:body.mode==='automatic'?'automatic':'manual',confirmed:body.confirmed===true})
  await startBoundMinutes(ctx,meetingId,`run-${requestId}`,activations);return {activations}
 }
 if(action==='workflow-create'){
  if(typeof body.definitionRevision!=='number')throw new Error('缺少流程版本')
  return {run:await createWorkflowRun(meetingId,body.definitionRevision,string('requestId'),body.mode==='automatic'?'automatic':'manual',body.confirmed===true)}
 }
 const runId=string('runId'),m=await requireActiveMeeting(stateRoot(),meetingId),r=m.workflow?.runs.find(r=>r.id===runId)
 if(!r)throw new Error('流程实例不存在')
 if(action==='workflow-input-add')return await addWorkflowInputs(meetingId,{runId,nodeId:string('nodeId'),requestId:string('requestId'),text:typeof body.text==='string'?body.text:'',messageIds:ids('messageIds'),assetIds:ids('assetIds'),confirmed:body.confirmed===true})
 if(action==='workflow-auto-rounds'){await extendAutomaticRounds(meetingId,{runId,loopId:string('loopId'),maxRounds:Number(body.maxRounds),expected:Number(body.expected),confirmed:body.confirmed===true});return {ok:true}}
 if(action==='workflow-budget'){
  if(typeof body.work!=='number'||typeof body.minutes!=='number'||!body.expected||typeof body.expected!=='object')throw Error('追加额度参数不完整')
  await extendWorkflowBudget(meetingId,{runId,requestId:string('requestId'),work:body.work,minutes:body.minutes,expected:body.expected as {workAttempts:number;minutesStarts:number},confirmed:body.confirmed===true});return {ok:true}
 }
 if(action==='workflow-bypass'){await bypassWorkflowNode(meetingId,{runId,nodeId:string('nodeId'),...(typeof body.activationId==='string'?{expectedActivationId:body.activationId}:{}),confirmed:body.confirmed===true,reason:string('reason')});return {ok:true}}
 if(action==='workflow-queue-input')return await queueWorkflowInput(meetingId,runId,string('nodeId'),string('messageId'))
 if(action==='workflow-temporary-preview')return {plan:previewTemporary(m,r,body.input as TemporaryInput)}
 if(action==='workflow-temporary-start')return {activation:await startTemporary(meetingId,runId,body.input as TemporaryInput,string('fingerprint'),string('requestId'))}
 if(action==='workflow-view')return {views:workflowViews(m,r)}
 if(action==='workflow-preview')return {plan:withAvailability(ctx,previewWorkflow(m,r.automatic&&r.automatic.pauseReason!=='主持人暂停后续执行'?{...r,paused:false}:r,ids('nodeIds'),body.retry===true),m)}
 if(action==='workflow-partial-preview')return {plan:previewPartialWorkflow(m,r,string('joinId'))}
 if(action==='workflow-partial'){
  await continuePartialWorkflow(meetingId,{runId,joinId:string('joinId'),skipBranchIds:ids('skipBranchIds'),fingerprint:string('fingerprint'),confirmed:body.confirmed===true,reason:string('reason')});return {ok:true}
 }
 if(action==='workflow-choice'){await chooseWorkflowPath(meetingId,runId,string('nodeId'),string('edgeId'),typeof body.reason==='string'?body.reason:'');return {ok:true}}
 if(action==='workflow-clear-choice'){await clearWorkflowChoice(meetingId,runId,string('nodeId'),typeof body.activationId==='string'?body.activationId:undefined);return {ok:true}}
 if(action==='workflow-control'){
  if(!['pause','resume','stop','complete'].includes(String(body.control)))throw new Error('非法流程控制')
  if(body.control==='stop'&&body.confirmed!==true)throw new Error('请确认停止流程；原窗口继续工作')
  if(body.control==='resume'&&r.automatic&&body.confirmed!==true)throw Error('请检查停止原因并确认继续自动协作')
  await controlWorkflow(meetingId,runId,body.control as 'pause'|'resume'|'stop'|'complete');return {ok:true}
 }
 if(action==='workflow-start'){
  const activations=await startWorkflowNodes(meetingId,{runId,nodeIds:ids('nodeIds'),fingerprint:string('fingerprint'),requestId:string('requestId'),retry:body.retry===true,confirmed:body.confirmed===true})
  await startBoundMinutes(ctx,meetingId,runId,activations)
  return {activations}
 }
 throw new Error('未知流程操作')
}
