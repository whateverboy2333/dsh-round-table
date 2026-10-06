import {hasWorkflowResultConsumer} from './workflow-retry.ts'
import {createHash,randomUUID} from 'node:crypto'
import {mutateMeeting,stateRoot,type Meeting} from './meetings.ts'
import {findReleaseTask,freezeRelease} from './meeting-flow.ts'
import {revisionChild} from './task-review.ts'
import {workflowBudget} from './workflow-budget.ts'
import {workflowTaskAllowed} from './workflow-guard.ts'
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
/** Only pre-commit validation uses this error; storage/transport failures remain uncertain. */
export class RevisionStartRejected extends Error {readonly requestState='rejected';constructor(message:string){super(message);this.name='RevisionStartRejected'}}
export function previewTaskRevision(m:Meeting,taskId:string,note:string){
 const found=findReleaseTask(m,taskId);if(found?.task.status!=='completed')throw Error('只有已提交结果可以要求修改')
 if(typeof note!=='string'||!note.trim()||note.length>100000)throw Error('请填写本次修改意见（不超过10万字符）')
 const {task,draft}=found,missing:string[]=[];if(draft.instruction.length+note.length+(task.result?.length??0)>100000)missing.push('修改意见与原结果过长，请先缩小范围');if(m.archivedAt||m.releasePaused||m.deletion)missing.push('会议已暂停或结束')
 if(!m.memberSessionIds.includes(task.toSessionId))missing.push('原处理成员已离会')
 if(task.review!=='changes_requested')missing.push('请先将此结果标为要求修改')
 if(revisionChild(m,task))missing.push('已有接续修改任务，请查看该任务并从其结果继续')
 const run=task.workflow?m.workflow?.runs.find(r=>r.id===task.workflow!.runId):undefined,a=run?.activations.find(x=>x.id===task.workflow!.activationId)
 if(task.workflow){
  if(!run||!a||!workflowTaskAllowed(m,task,true))missing.push('原流程已暂停、结束或该执行已被替代')
  else{if(hasWorkflowResultConsumer(run,a.id,m))missing.push('已有后续环节使用了此结果；请走返工路线或新建运行')
   if(run.workReserved>=workflowBudget(run).workAttempts)missing.push('流程普通投递额度不足')
   const ids=new Set(run.activations.filter(x=>x.slotKey===a.slotKey).map(x=>x.id)),used=(m.releases??[]).flatMap(r=>r.tasks).filter(t=>t.toSessionId===task.toSessionId&&t.workflow?.runId===run.id&&ids.has(t.workflow.activationId)).reduce((n,t)=>n+t.workflow!.reservedDeliveries,0)
   if(used>=run.definition.limits.nodeAttempts)missing.push('本环节本轮的成员执行额度不足，请走返工路线或新建运行')
  }
 }
 const messageIds=[...new Set([...draft.messageIds,...(task.resultMessageId?[task.resultMessageId]:[])])],instruction=`请修改上一轮正式结果。\n原任务要求：${draft.instruction}\n修改意见：${note.trim()}\n保留原要求的目标，完成后提交本轮修改结果；不要把未确认的建议当作已批准决策。`,assetIds=draft.assetIds??[]
 const fingerprint=digest({task,note:note.trim(),messages:messageIds.map(id=>m.events.find(e=>e.id===id)),assets:assetIds,members:m.memberSessionIds,run:run?{status:run.status,paused:run.paused,work:run.workReserved,events:run.events}:null,missing})
 return {taskId,recipientId:task.toSessionId,title:`修改：${draft.title??draft.instruction.slice(0,50)}`,instruction,messageIds,assetIds,originalResult:task.result??'',note:note.trim(),fingerprint,ready:!missing.length,missing}
}
export async function startTaskRevision(meetingId:string,input:{taskId:string;note:string;fingerprint:string;requestId:string;confirmed:boolean}){
 if(input.confirmed!==true||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId))throw new RevisionStartRejected('请明确确认本次修改任务')
 let result;await mutateMeeting(stateRoot(),meetingId,m=>{
  const id=`revision-${input.requestId}`,old=m.releases?.find(r=>r.id===id)
  if(old){if(old.parentTaskId!==input.taskId||old.revisionNote!==input.note.trim())throw Error('请求ID已用于不同修改');result=old;return m}
  let plan:ReturnType<typeof previewTaskRevision>,release:ReturnType<typeof freezeRelease>
  try{
   plan=previewTaskRevision(m,input.taskId,input.note);if(plan.fingerprint!==input.fingerprint)throw Error('任务或输入已变化，请重新预览');if(!plan.ready)throw Error(plan.missing.join('；'))
   release=freezeRelease(m,{id,version:1,status:'draft',title:plan.title,instruction:plan.instruction,messageIds:plan.messageIds,assetIds:plan.assetIds,recipientIds:[plan.recipientId],createdAt:Date.now(),tasks:[],parentTaskId:input.taskId,revisionNote:plan.note})
  }catch(error){throw new RevisionStartRejected(error instanceof Error?error.message:String(error))}
  const found=findReleaseTask(m,input.taskId)!
  if(found.task.workflow){
   const run=m.workflow!.runs.find(r=>r.id===found.task.workflow!.runId)!,source=run.activations.find(a=>a.id===found.task.workflow!.activationId)!,activationId=randomUUID()
   const activation={...structuredClone(source),id:activationId,node:{...structuredClone(source.node),memberIds:[plan.recipientId],instruction:plan.instruction},createdAt:Date.now(),requestId:input.requestId,requestHash:plan.fingerprint,inputFingerprint:plan.fingerprint,messageIds:plan.messageIds,assetIds:plan.assetIds,sourceActivationIds:[source.id],releaseId:id,temporary:true,revisionOfTaskId:input.taskId}
   run.activations.push(activation);run.workReserved++;run.events.push({id:randomUUID(),time:Date.now(),action:'revision',activationId,details:`对「${source.node.title}」的结果明确发送修改意见；仅${m.memberNames?.[plan.recipientId]??'原处理成员'}执行，原结果保留`})
   release.tasks[0]!.workflow={runId:run.id,activationId,reservedDeliveries:1}
  }
  m.releases=[...(m.releases??[]),release];result=release;return m
 });return result
}
