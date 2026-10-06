/** Small list projection; never imports host modules or infers an Agent's state. */
export interface MeetingListItem {
 meetingId:string;title:string;description?:string;createdAt:number;lastActivity?:number;memberSessionIds:string[]
 pinnedAt?:number;archivedAt?:number;releasePaused?:boolean;deletion?:{error?:string};listReadOnly?:boolean
 workflowStatus?:'active'|'paused'|'completed'|'stopped';counts?:{pending:number;attention:number;completed:number;awaitingReview?:number;faults?:number;running?:number}
 secretary?:{status:'ready'|'initializing'|'failed'}
}
export function sortedMeetings<T extends MeetingListItem>(meetings:readonly T[],query:string,archived:boolean):T[]{
 const q=query.trim().toLowerCase()
 return meetings.filter(m=>!!m.archivedAt===archived&&`${m.title} ${m.description??''}`.toLowerCase().includes(q)).sort((a,b)=>
  Number(!!b.pinnedAt)-Number(!!a.pinnedAt)||(b.pinnedAt??0)-(a.pinnedAt??0)||(b.lastActivity??b.createdAt)-(a.lastActivity??a.createdAt)||a.meetingId.localeCompare(b.meetingId))
}
export function meetingListStatus(m:MeetingListItem):{label:string;tone:'neutral'|'warning'|'active'|'done'|'review'}{
 if(m.deletion)return {label:'删除未完成',tone:'warning'}
 if(m.archivedAt)return {label:'已归档',tone:'neutral'}
 if(m.listReadOnly)return {label:'需升级后管理',tone:'warning'}
 if(m.releasePaused||m.workflowStatus==='paused')return {label:'已暂停',tone:'neutral'}
 if((m.counts?.faults??0)>0)return {label:'需核实／故障',tone:'warning'}
 if((m.counts?.awaitingReview??0)>0)return {label:'待验收',tone:'review'}
 if(m.counts?.awaitingReview===undefined&&(m.counts?.attention??0)>0)return {label:'待处理／验收',tone:'neutral'}
 if((m.counts?.pending??0)>0||m.workflowStatus==='active')return {label:'进行中',tone:'active'}
 if(m.workflowStatus==='completed')return {label:'流程已完成',tone:'done'}
 if(m.workflowStatus==='stopped')return {label:'流程已停止',tone:'neutral'}
 return {label:'可讨论',tone:'neutral'}
}
export function matchesMeetingState(m:MeetingListItem,type:string):boolean{
 if(type==='review')return (m.counts?.awaitingReview??0)>0
 if(type==='fault')return (m.counts?.faults??0)>0||!!m.deletion||!!m.listReadOnly||m.secretary?.status==='failed'
 if(type==='running')return (m.counts?.running??0)>0||m.workflowStatus==='active'||m.secretary?.status==='initializing'
 return true
}
