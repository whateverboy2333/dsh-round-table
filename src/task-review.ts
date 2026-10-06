import type {ReleaseDraft,ReleaseTask} from './meeting-flow-types.ts'
type MeetingTasks={releases?:ReleaseDraft[]}
export function revisionChild(m:MeetingTasks,t:ReleaseTask):ReleaseDraft|undefined{return t.review==='changes_requested'?m.releases?.filter(r=>r.parentTaskId===t.taskId&&r.status==='released'&&r.tasks.some(x=>x.status!=='cancelled')).at(-1):undefined}
export function effectiveTask(m:MeetingTasks,t:ReleaseTask,seen=new Set<string>()):ReleaseTask{if(seen.has(t.taskId))return t;seen.add(t.taskId);const child=revisionChild(m,t)?.tasks.find(x=>x.toSessionId===t.toSessionId);return child?effectiveTask(m,child,seen):t}
export const effectiveReleaseTasks=(m:MeetingTasks,r:ReleaseDraft)=>r.tasks.map(t=>effectiveTask(m,t))
export function taskNeedsAttention(m:MeetingTasks,t:ReleaseTask):boolean{return !revisionChild(m,t)&&(['offline','uncertain','failed'].includes(t.status)||t.status==='completed'&&t.review!=='accepted')}
export function taskNeedsAction(m:MeetingTasks,t:ReleaseTask):boolean{return !revisionChild(m,t)&&(!['completed','cancelled'].includes(t.status)||t.status==='completed'&&t.review!=='accepted')}
export function reviewState(m:MeetingTasks,t:ReleaseTask):string{
 const child=revisionChild(m,t);if(child){const latest=effectiveTask(m,t);return latest.status==='completed'?(latest.review==='accepted'?'修改结果已通过（原结果保留）':'修改结果待验收'):latest.status==='failed'?'修改任务执行失败':'等待修改结果'}
 return t.review==='accepted'?'已通过':t.review==='changes_requested'?'修改要求待发送':t.status==='completed'?'待验收':''
}
export function resultIsUsable(t:ReleaseTask,requireReview=false){return t.status==='completed'&&!!t.resultMessageId&&t.review!=='changes_requested'&&(!requireReview||t.review==='accepted')}
