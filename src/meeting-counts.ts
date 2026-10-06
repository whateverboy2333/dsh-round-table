import {revisionChild,taskNeedsAttention} from './task-review.ts'
import type {ReleaseDraft} from './meeting-flow-types.ts'
/** Projection only: reviewing history is distinct from an execution failure. */
export function meetingTaskCounts(m:{releases?:ReleaseDraft[]}){
 const tasks=(m.releases??[]).flatMap(r=>r.tasks),current=tasks.filter(t=>!revisionChild(m,t))
 return {pending:tasks.filter(t=>!['completed','failed','cancelled'].includes(t.status)).length,attention:tasks.filter(t=>taskNeedsAttention(m,t)).length,completed:tasks.filter(t=>t.status==='completed').length,
 awaitingReview:current.filter(t=>t.status==='completed'&&t.review!=='accepted').length,
 faults:current.filter(t=>['offline','uncertain','failed'].includes(t.status)).length,
 running:current.filter(t=>['delivering','delivered','in_progress'].includes(t.status)).length}
}
