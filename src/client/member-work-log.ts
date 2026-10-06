import {projectTaskCardMessage,taskCardFacts,type TaskCardProjectionMeeting} from '../task-card-projection.ts'
import type {MeetingAsset,MeetingMessage,ReleaseDraft} from '../meeting-flow-types.ts'

export interface MemberLogDiscussion {
 id:string;messageId:string;instruction:string;recipientIds:string[];createdAt:number;contextTaskId?:string;messageIds:string[];assetIds:string[];inputs?:MeetingMessage[]
 deliveries:{toSessionId:string;status:string;updatedAt:number;deliveredAt?:number;error?:string}[]
 replies:{sessionId:string;text:string;messageId:string;time:number}[]
}
export interface MemberLogEvent {id:string;kind:string;time:number;sessionId?:string;toSessionId?:string;taskId?:string;status?:string;title?:string;text?:string;result?:string;error?:string;by?:string;deliveries?:{sessionId:string;status:string;error?:string}[]}
export interface MemberLogMeeting extends TaskCardProjectionMeeting {meetingId:string;title?:string;messages?:MeetingMessage[];releases?:ReleaseDraft[];assets?:MeetingAsset[];events?:MemberLogEvent[];discussions?:MemberLogDiscussion[]}
export interface MemberWorkLogEntry {id:string;kind:'request'|'delivery'|'reply'|'result'|'review'|'revision'|'membership';time:number;title:string;text:string;taskId?:string;messageId?:string;source?:string}
export interface MemberWorkLogItem {id:string;kind:'discussion'|'task'|'participation';title:string;taskId?:string;parentTaskId?:string;status:string;entries:MemberWorkLogEntry[];materials:{id:string;name:string;text?:string}[]}
const taskState=(status:string)=>({queued:'等待投递',offline:'未连接，等待恢复',delivering:'投递中',uncertain:'投递待核实',delivered:'已投递，等待正式结果',in_progress:'处理中',completed:'已提交正式结果',failed:'任务失败',cancelled:'已结束等待'} as Record<string,string>)[status]??status
const deliveryState=(status:string)=>({queued:'等待接收',offline:'未连接',delivering:'投递中',delivered:'已送入原窗口',uncertain:'送达待核实',failed:'投递失败',cancelled:'已结束'} as Record<string,string>)[status]??status
const sourceLabel=(source:MeetingMessage['source'],fallback:string)=>source?.kind==='manual'?`主持人主动选入的原回复${source.seq!==undefined?` #${source.seq}`:''}${source.excerpt?' · 节选':''}${source.digest?` · 来源摘要 ${source.digest}`:''}`:fallback
/** Only this meeting's persisted records are inputs; no raw Session history or model summary. */
export function memberWorkLog(meeting:MemberLogMeeting,memberId:string):MemberWorkLogItem[]{
 const messages=(meeting.messages??[]).filter(m=>!m.previewOnly),assets=meeting.assets??[],items:MemberWorkLogItem[]=[],knownMessages=new Set<string>()
 const discussions=(meeting.discussions??[]).filter(d=>d.recipientIds.includes(memberId)||d.replies.some(r=>r.sessionId===memberId))
 const discussionMessages=new Set(discussions.flatMap(d=>[d.messageId,...d.replies.filter(r=>r.sessionId===memberId).map(r=>r.messageId)]))
 const materials=(messageIds:string[],assetIds:string[],inputs?:MeetingMessage[])=>[...messageIds.flatMap(id=>{const m=(inputs??messages).find(m=>m.id===id&&!m.previewOnly);return m?[{id:m.id,name:sourceLabel(m.source,'选定会议消息'),text:m.text}]:[]}),...assetIds.map(id=>{const a=assets.find(x=>x.id===id);return {id,name:a?`${a.name} · v${a.version}`:'选定附件（内容不可用）',...(a?.text!==undefined?{text:a.text}:{})}})]
 for(const release of meeting.releases??[])for(const task of release.tasks.filter(t=>t.toSessionId===memberId)){
  const entries:MemberWorkLogEntry[]=[{id:`request-${task.taskId}`,kind:'request',time:release.releasedAt??release.createdAt,title:release.parentTaskId?'修改要求':'工作要求',text:projectTaskCardMessage(meeting,{id:`sent-${release.id}`,sender:'user',text:release.instruction})??release.instruction,taskId:task.taskId}]
  if(release.parentTaskId)entries.push({id:`revision-${task.taskId}`,kind:'revision',time:release.createdAt,title:'关联修改任务',text:release.revisionNote??release.instruction,taskId:release.parentTaskId})
  knownMessages.add(`sent-${release.id}`)
  if(task.resultMessageId)knownMessages.add(task.resultMessageId)
  if(task.deliveredAt!==undefined)entries.push({id:`delivery-${task.taskId}`,kind:'delivery',time:task.deliveredAt,title:'投递到成员原窗口',text:'本会已记录原窗口接收这项工作要求；接收不代表完成。',taskId:task.taskId})
  if(task.restoration)entries.push({id:`restoration-${task.taskId}`,kind:'delivery',time:task.restoration.updatedAt,title:task.restoration.state==='restored'?'原窗口恢复完成':task.restoration.state==='restoring'?'正在恢复原窗口':'原窗口恢复未成功',text:task.restoration.reason??'恢复状态来自本任务已保存的宿主核对记录。',taskId:task.taskId})
  if(task.claimedAt!==undefined)entries.push({id:`claim-${task.taskId}`,kind:'delivery',time:task.claimedAt,title:'成员认领工作要求',text:'成员已明确认领；认领不代表提交成果。',taskId:task.taskId})
  entries.push({id:`state-${task.taskId}`,kind:'delivery',time:task.closedAt??task.updatedAt,title:taskState(task.status),text:task.status==='cancelled'?task.closedReason??task.error??'已结束本会等待；历史内容保留，不代表原窗口停止或任务完成。':task.error??(task.status==='completed'?'正式结果已记录；验收以主持人意见为准。':task.deliveredAt?'已记录投递，当前进展以本会任务状态为准。':'未记录送达，不代表已执行。'),taskId:task.taskId})
  if(task.result!==undefined)entries.push({id:`result-${task.taskId}`,kind:'result',time:task.completedAt??task.updatedAt,title:'正式提交的成果',text:task.result,taskId:task.taskId,messageId:task.resultMessageId,source:sourceLabel(task.resultSource,'成员明确提交到本会')})
  if(task.reviewHistory?.length)for(const review of task.reviewHistory)entries.push({id:`review-${review.id}`,kind:'review',time:review.time,title:review.review==='accepted'?'主持人验收通过':'主持人要求修改',text:review.note||'已记录主持人的验收动作。',taskId:task.taskId})
  else if(task.review||task.reviewNote)entries.push({id:`review-${task.taskId}`,kind:'review',time:task.updatedAt,title:task.review==='accepted'?'主持人验收通过':task.review==='changes_requested'?'主持人要求修改':'主持人意见',text:task.reviewNote||'已记录主持人的验收动作。',taskId:task.taskId})
  for(const message of messages.filter(m=>(m.taskId===task.taskId||m.contextTaskId===task.taskId)&&!discussionMessages.has(m.id))){knownMessages.add(message.id);if(message.id===task.resultMessageId)continue;entries.push({id:message.id,kind:message.sender===memberId?'reply':'request',time:message.time,title:message.sender===memberId?'本会补充回应（非工作成果）':'关联会议消息',text:message.text,taskId:task.taskId,messageId:message.id,source:sourceLabel(message.source,'本会已公开消息')})}
  items.push({id:task.taskId,kind:'task',title:release.title??release.instruction.slice(0,60),taskId:task.taskId,parentTaskId:release.parentTaskId,status:taskState(task.status),entries,materials:materials(release.messageIds,release.assetIds??[],release.inputs)})
 }
 for(const discussion of discussions){
  const delivery=discussion.deliveries.find(x=>x.toSessionId===memberId),replies=discussion.replies.filter(x=>x.sessionId===memberId)
  if(!discussion.recipientIds.includes(memberId)&&!replies.length)continue
  knownMessages.add(discussion.messageId);replies.forEach(r=>knownMessages.add(r.messageId))
  const entries:MemberWorkLogEntry[]=[{id:`request-${discussion.id}`,kind:'request',time:discussion.createdAt,title:discussion.contextTaskId?'任务澄清／补充消息':'普通讨论消息',text:projectTaskCardMessage(meeting,{id:discussion.messageId,discussionId:discussion.id,sender:'user'})??discussion.instruction,messageId:discussion.messageId,taskId:discussion.contextTaskId}]
  if(delivery)entries.push({id:`delivery-${discussion.id}`,kind:'delivery',time:delivery.deliveredAt??delivery.updatedAt,title:deliveryState(delivery.status),text:delivery.error??'仅记录普通消息送达；不建立或完成工作任务。',taskId:discussion.contextTaskId})
  for(const reply of replies)entries.push({id:reply.messageId,kind:'reply',time:reply.time,title:meeting.taskCardGenerations?.some(g=>g.discussionId===discussion.id)?'原成员准备卡片（非工作成果）':'普通回应（非工作成果）',text:projectTaskCardMessage(meeting,{id:reply.messageId,discussionId:discussion.id,sender:reply.sessionId})??reply.text,messageId:reply.messageId,taskId:discussion.contextTaskId,source:'成员明确回传到本会'})
  const existing=discussion.contextTaskId?items.find(x=>x.taskId===discussion.contextTaskId):undefined
  if(existing){existing.entries.push(...entries);existing.materials.push(...materials(discussion.messageIds,discussion.assetIds,discussion.inputs))}
  else items.push({id:discussion.id,kind:'discussion',title:meeting.taskCardGenerations?.some(g=>g.discussionId===discussion.id)?meeting.taskCardGenerations.find(g=>g.discussionId===discussion.id)?.kind==='adjust'?'指定任务卡调整':'任务卡生成准备':discussion.contextTaskId?'关联任务的讨论':discussion.instruction.slice(0,60)||'普通讨论',taskId:discussion.contextTaskId,status:replies.length?'已有普通回应':delivery?deliveryState(delivery.status):'未记录送达',entries,materials:materials(discussion.messageIds,discussion.assetIds,discussion.inputs)})
 }
 for(const message of messages.filter(m=>!knownMessages.has(m.id)&&(m.sender===memberId||m.recipientIds?.includes(memberId))))items.push({id:message.id,kind:'discussion',title:message.sender===memberId?'本会发言':'发送给成员的会议消息',status:'已记录会议内容',entries:[{id:message.id,kind:message.sender===memberId?'reply':'request',time:message.time,title:message.sender===memberId?'本会普通发言（非工作成果）':'会议消息',text:message.text,messageId:message.id,source:sourceLabel(message.source,'本会公开消息')}],materials:materials([],message.assetIds??[])})
 const ownCards=new Set((meeting.taskCards??[]).filter(c=>c.generatorSessionId===memberId||c.assigneeSessionId===memberId).map(c=>c.id))
 const cardFacts=taskCardFacts({...meeting,cardPublications:(meeting.cardPublications??[]).map(p=>({...p,cards:p.cards.filter(c=>c.generatorSessionId===memberId||c.assigneeSessionId===memberId)})).filter(p=>p.cards.length)}).filter(f=>f.kind==='edit'&&f.cardId&&ownCards.has(f.cardId)||f.kind==='publication')
 for(const fact of cardFacts)items.push({id:fact.id,kind:'discussion',title:fact.title,status:fact.kind==='publication'?'批准发布记录（完成以执行状态为准）':'卡片版本修改（未执行）',entries:[{id:fact.id,kind:fact.kind==='publication'?'request':'revision',time:fact.time,title:fact.title,text:fact.text}],materials:[]})
 const participation=(meeting.events??[]).filter(e=>['join','leave'].includes(e.kind)&&e.sessionId===memberId).map(e=>({id:e.id,kind:'membership' as const,time:e.time,title:e.kind==='join'?'加入本会':'移出本会',text:e.kind==='join'?'成员加入本场会议。':'历史内容保留，移除不代表原任务完成。'}))
 if(participation.length)items.push({id:'participation',kind:'participation',title:'参会记录',status:'本会成员变更',entries:participation,materials:[]})
 for(const item of items){item.entries.sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));item.materials=item.materials.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i)}
 return items.sort((a,b)=>Math.max(...b.entries.map(e=>e.time))-Math.max(...a.entries.map(e=>e.time)))
}
