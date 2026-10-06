import {randomUUID} from 'node:crypto'
import {mutateMeeting,stateRoot,type Meeting} from './meetings.ts'
import {freezeRelease} from './meeting-flow.ts'
import {workflowHash} from './workflow-projection.ts'
import {validWorkflowId,type WorkflowActivation,type WorkflowRun} from './workflow-types.ts'
import {workflowBudget} from './workflow-budget.ts'
export interface TemporaryInput {title:string;instruction:string;messageIds:string[];assetIds:string[];recipientIds:string[]}
export function previewTemporary(m:Meeting,r:WorkflowRun,input:TemporaryInput){
 if(!input||typeof input.title!=='string'||typeof input.instruction!=='string'||!input.instruction.trim()||input.instruction.length>100000)throw new Error('请填写本次要求（不超过10万字符）')
 if(![input.messageIds,input.assetIds,input.recipientIds].every(a=>Array.isArray(a)&&a.length<=200&&a.every(x=>typeof x==='string')&&new Set(a).size===a.length))throw new Error('临时回应的来源或成员列表非法')
 if(r.status!=='active'||r.paused||m.releasePaused||m.archivedAt||m.deletion)throw new Error('会议或流程已暂停、结束或归档')
 if(r.workReserved+input.recipientIds.length>workflowBudget(r).workAttempts)throw new Error('当前流程的普通投递额度不足')
 const release=freezeRelease(m,{id:'temporary-preview',version:1,status:'draft',title:input.title,instruction:input.instruction,messageIds:input.messageIds,assetIds:input.assetIds,recipientIds:input.recipientIds,createdAt:0,tasks:[]})
 return {fingerprint:workflowHash({runId:r.id,budget:workflowBudget(r),workReserved:r.workReserved,members:m.memberSessionIds,title:m.title,input,inputs:release.inputs,assets:release.assetIds}),characters:JSON.stringify(release.inputs).length+input.instruction.length,inputs:release.inputs,assetIds:release.assetIds,recipientIds:input.recipientIds}
}
export async function startTemporary(meetingId:string,runId:string,input:TemporaryInput,fingerprint:string,requestId:string):Promise<WorkflowActivation>{
 if(!validWorkflowId(requestId)||requestId.length>80)throw new Error('请求ID非法');let result!:WorkflowActivation
 await mutateMeeting(stateRoot(),meetingId,m=>{
  result=startTemporaryInMeeting(m,runId,input,fingerprint,requestId);return m
 });return result
}
/** Caller holds the meeting lock; permits an atomic chat receipt alongside the activation. */
export function startTemporaryInMeeting(m:Meeting,runId:string,input:TemporaryInput,fingerprint:string,requestId:string):WorkflowActivation {
  if(!validWorkflowId(requestId)||requestId.length>80)throw new Error('请求ID非法')
  const r=m.workflow?.runs.find(r=>r.id===runId);if(!r)throw new Error('流程实例不存在')
  const requestHash=workflowHash({input,fingerprint,requestId}),old=r.activations.find(a=>a.requestId===requestId)
  if(old){if(!old.temporary||old.requestHash!==requestHash)throw new Error('请求ID已用于不同的执行');return old}
  const p=previewTemporary(m,r,input);if(p.fingerprint!==fingerprint)throw new Error('输入、成员或额度已变化，请重新预览')
  const id=randomUUID(),nodeId=`temporary-${requestId}`,now=Date.now()
  const release=freezeRelease(m,{id:`workflow-${id}`,version:1,status:'draft',title:input.title||'临时回应',instruction:input.instruction,messageIds:input.messageIds,assetIds:input.assetIds,recipientIds:input.recipientIds,createdAt:now,tasks:[]})
  const result:WorkflowActivation={id,nodeId,slotKey:nodeId,round:0,attempt:1,definitionRevision:r.definition.revision,node:{id:nodeId,title:input.title||'临时回应',kind:'work',memberIds:input.recipientIds,instruction:input.instruction,inputs:[],includeIncoming:false},createdAt:now,requestId,requestHash,inputFingerprint:fingerprint,messageIds:input.messageIds,assetIds:p.assetIds??[],sourceActivationIds:[],incomingEdgeIds:[],releaseId:release.id,temporary:true}
  release.tasks.forEach(t=>{t.workflow={runId,activationId:id,reservedDeliveries:1}})
  m.releases=[...(m.releases??[]),release];r.activations.push(result);r.workReserved+=release.tasks.length;r.events.push({id:randomUUID(),time:now,action:'temporary',activationId:id,details:`临时回应：${result.node.title}；不推进主流程`});return result
}
