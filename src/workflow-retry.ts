import type {Meeting} from './meetings.ts'
import type {WorkflowRun,WorkflowStatus} from './workflow-types.ts'
import {latestActivation,workflowSlot} from './workflow-slot.ts'
/** Revision edges describe ancestry; only a non-revision consumer freezes a result. */
function revisionFamily(run:WorkflowRun,activationId:string):Set<string>{
 const family=new Set([activationId]);let changed=true
 while(changed){changed=false;for(const a of run.activations)if(a.revisionOfTaskId&&!family.has(a.id)&&a.sourceActivationIds.some(id=>family.has(id))){family.add(a.id);changed=true}}
 return family
}
export function hasWorkflowResultConsumer(run:WorkflowRun,activationId:string,m?:Meeting):boolean{
 const family=revisionFamily(run,activationId)
 // Older frozen inputs may record only the logical source. Their message IDs
 // still identify the actual producer, without rewriting historical records.
 const messages=new Set((m?.releases??[]).flatMap(r=>r.tasks).filter(t=>t.workflow?.runId===run.id&&family.has(t.workflow.activationId)&&t.resultMessageId).map(t=>t.resultMessageId!))
 return run.activations.some(a=>!a.revisionOfTaskId&&(a.sourceActivationIds.some(id=>family.has(id))||a.messageIds.some(id=>messages.has(id))))
}
export function workflowRetryIssues(m:Meeting,run:WorkflowRun,nodeId:string,status:WorkflowStatus):string[]{
 const slot=workflowSlot(run,nodeId),old=latestActivation(run,slot.slotKey);if(!old)return []
 const issues:string[]=[]
 const family=revisionFamily(run,old.id)
 for(const task of (m.releases??[]).flatMap(r=>r.tasks))if(task.workflow?.runId===run.id&&family.has(task.workflow.activationId)&&!['completed','failed','cancelled'].includes(task.status))issues.push(`成员「${m.memberNames?.[task.toSessionId]??task.toSessionId}」的任务 ${task.taskId} 尚未结束，请先等待结果或明确结束该任务，再重新执行`)
 if(!['failed','ended','submitted','changes_requested','waiting_review'].includes(status))issues.push('请先结束原执行的等待，再重新执行')
 if(hasWorkflowResultConsumer(run,old.id,m))issues.push('已有后续环节使用本次结果，请新建运行或按返工路径执行')
 const ids=new Set(run.activations.filter(a=>a.slotKey===slot.slotKey).map(a=>a.id)),node=run.definition.nodes.find(n=>n.id===nodeId)!
 for(const member of node.memberIds){const used=(m.releases??[]).flatMap(d=>d.tasks).filter(t=>t.toSessionId===member&&t.workflow?.runId===run.id&&ids.has(t.workflow.activationId)).reduce((n,t)=>n+t.workflow!.reservedDeliveries,0);if(used>=run.definition.limits.nodeAttempts)issues.push('本轮成员执行额度已用尽')}
 return [...new Set(issues)]
}
