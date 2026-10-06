import type {TaskCardMeetingFields,TaskCardGeneration,TaskCard} from './task-card-types.ts'
/** Browser-safe projection: stored links, never parses arbitrary chat or private history. */
export interface TaskCardProjectionMeeting extends TaskCardMeetingFields {memberNames?:Record<string,string>;discussions?:{id:string;messageId:string;replies:{sessionId:string;messageId:string;text:string;time:number}[];deliveries:{toSessionId:string;status:string;error?:string;updatedAt:number}[]}[]}
export interface TaskCardFact {id:string;time:number;kind:'generation'|'proposal'|'edit'|'publication';memberId?:string;cardId?:string;generationId?:string;title:string;text:string}
const member=(m:TaskCardProjectionMeeting,id:string|undefined)=>id?m.memberNames?.[id]??'原会议成员':'待确认'
const generated=(c:TaskCard)=>c.versions.find(v=>v.source==='generator')??c.versions[0]!
export function taskCardGenerationRequestText(m:TaskCardProjectionMeeting,g:TaskCardGeneration):string {
 const names=g.recipientIds.map(id=>member(m,id)).join('、'),target=g.cardId?m.taskCards?.find(c=>c.id===g.cardId):undefined
 return g.kind==='adjust'?`请原生成成员${names}调整「${target?.title??'指定任务卡'}」的 v${g.baseVersion}。\n调整意见：${g.adjustmentNote??'以这次明确调整请求为准'}\n返回内容仅为建议，不覆盖当前编辑，不立即执行。`:`请${names}依据各自实际收到的会议上下文提出后续任务卡。${g.userInstruction?`\n额外说明：${g.userInstruction}`:'\n主持人没有额外正文。'}\n每项待办一张卡；生成属于准备工作，待逐项修改和确认发布后才通知执行。`
}
export function taskCardResponseText(m:TaskCardProjectionMeeting,g:TaskCardGeneration,sid:string):string {
 const response=g.responses.find(r=>r.sessionId===sid);if(!response)return '原成员已回传本次生成内容，卡片入库尚待核实；不会自动执行。'
 if(response.emptyReason)return `${member(m,sid)}没有提出新的待办：${response.emptyReason}\n这不是已完成工作成果。`
 if(g.kind==='adjust'){const c=m.taskCards?.find(c=>c.id===g.cardId),p=c?.proposals.find(p=>p.generationId===g.id);return p?`${member(m,sid)}返回「${p.title}」的调整建议，基于 v${p.baseVersion}。尚未采纳，不覆盖现有正文。\n\n${p.body}`:'调整内容已回传，建议版本入库待核实。'}
 return `${member(m,sid)}提出 ${response.cardIds.length} 项后续工作，尚未批准执行。\n\n${response.cardIds.map(id=>{const c=m.taskCards?.find(c=>c.id===id);if(!c)return '卡片记录缺失，请核对';const v=generated(c);return `## ${v.title}\n生成：${member(m,c.generatorSessionId)} · 建议执行：${member(m,v.assigneeSessionId)} · 原稿 v${v.version}\n\n${v.body}`}).join('\n\n')}`
}
export function projectTaskCardMessage(m:TaskCardProjectionMeeting,message:{id?:string;messageId?:string;discussionId?:string;sender?:string;by?:string;text?:string}):string|undefined{
 const publication=m.cardPublications?.find(p=>p.status==='published'&&p.cards.some(c=>c.releaseId&&`sent-${c.releaseId}`===(message.id??message.messageId)))
 if(publication){const c=publication.cards.find(c=>c.releaseId&&`sent-${c.releaseId}`===(message.id??message.messageId))!;return `已批准发布「${c.title}」 · v${c.version}\n生成：${member(m,c.generatorSessionId)} · 执行：${member(m,c.assigneeSessionId)}\n本会文件：${c.relativePath??'文件位置待核实'}\n已加入执行通知队列；通知与接收不代表完成。\n\n${c.body}`}
 const mid=message.id??message.messageId,d=m.discussions?.find(d=>d.id===message.discussionId||d.messageId===mid||d.replies.some(r=>r.messageId===mid)),g=m.taskCardGenerations?.find(g=>g.discussionId===d?.id||g.discussionId===message.discussionId);if(!g)return undefined
 if(d?.messageId===mid||message.sender==='user'||message.by==='user')return taskCardGenerationRequestText(m,g)
 const reply=d?.replies.find(r=>r.messageId===mid),sid=reply?.sessionId??message.sender??message.by;if(!sid||!g.recipientIds.includes(sid))return '任务卡生成回应待核实。'
 return taskCardResponseText(m,g,sid)
}
export function taskCardFacts(m:TaskCardProjectionMeeting):TaskCardFact[]{
 const facts:TaskCardFact[]=[]
 for(const g of m.taskCardGenerations??[]){facts.push({id:g.id,time:g.createdAt,kind:'generation',generationId:g.id,title:g.kind==='adjust'?'指定任务卡调整请求':'已@原成员生成任务卡',text:taskCardGenerationRequestText(m,g)});for(const r of g.responses)facts.push({id:`response-${g.id}-${r.sessionId}`,time:r.createdAt,kind:'proposal',generationId:g.id,memberId:r.sessionId,cardId:g.cardId,title:g.kind==='adjust'?'原生成成员调整建议':'原成员提出后续工作',text:taskCardResponseText(m,g,r.sessionId)})}
 for(const c of m.taskCards??[])for(const v of c.versions.filter(v=>v.source!=='generator'))facts.push({id:`card-version-${c.id}-${v.version}`,time:v.createdAt,kind:'edit',cardId:c.id,memberId:c.generatorSessionId,title:`${v.source==='user'?'用户修改':'用户采纳调整'}「${v.title}」 · v${v.version}`,text:`${v.source==='user'?'主持人直接编辑':'主持人明确采纳原生成者的调整'}，这是卡片版本修改，不等于执行完成。\n执行：${member(m,v.assigneeSessionId)}\n\n${v.body}`})
 for(const p of m.cardPublications??[])facts.push({id:p.id,time:p.publishedAt??p.createdAt,kind:'publication',title:p.status==='published'?'选定任务卡已批准发布':'任务卡批准写入待核实',text:`${p.status==='published'?p.execute?'文件已写入，已按批准版本加入通知执行队列；接收与完成仍以执行记录为准。':'历史批准记录仅保存文件，未通知执行。':'已保留批准快照；文件写入或回执尚待核实，没有据此宣称执行。'}\n\n${p.cards.map(c=>`## ${c.title} · v${c.version}\n生成：${member(m,c.generatorSessionId)} · 执行：${member(m,c.assigneeSessionId)}${c.relativePath?`\n本会文件：${c.relativePath}`:''}\n\n${c.body}`).join('\n\n')}`})
 return facts.sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id))
}
