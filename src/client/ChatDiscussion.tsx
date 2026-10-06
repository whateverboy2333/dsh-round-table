import {ChatAssetPreview} from './ChatAssetPreview.tsx'
import {TaskRecovery} from './TaskRecovery.tsx'
import {RevisionPanel} from './RevisionPanel.tsx'
import {reviewState,revisionChild} from '../task-review.ts'
import {useEffect,useRef,useState} from 'react'
import type {MeetingMessage,ReleaseDraft,ReleaseTask,MeetingAsset} from '../meeting-flow-types.ts'
import type {WorkflowRun} from '../workflow-types.ts'
import type {MemberStatus} from './ReleasePanel.tsx'
import {HostingComposer} from './HostingComposer.tsx'
import {uiButton as button,uiInput as input} from './ui-state.ts'
import {useScopedOperations} from './use-scoped-operations.ts'
import {chatStyles} from './chat-style.ts'
import {RelativeTime,useRelativeNow} from './RelativeTime.tsx'

interface Props {
 discussions?:import('../discussion-types.ts').DiscussionRecord[];onOpenMember?:(id?:string,taskId?:string)=>void;onCreateTask?:(draft:import('./chat-draft.ts').ChatDraft)=>void
 meetingId:string;messages:MeetingMessage[];releases:ReleaseDraft[];members:{id:string;name:string}[]
 assets:MeetingAsset[];names:Record<string,string>;memberStatus:Record<string,MemberStatus>;run?:WorkflowRun;paused:boolean;archived:boolean
 onChanged:()=>Promise<void>;onNavigate?:(page:string)=>void;onOpenSession?:(id:string)=>void
 onPrepareTask:(message:MeetingMessage)=>void;onSupplement:(task:ReleaseTask)=>void;onPublish:()=>void;draftRunIds?:string[]
}
export function ChatDiscussion({meetingId,messages,releases,members,assets,names,memberStatus,run,paused,archived,onChanged,onNavigate,onOpenSession,onPrepareTask,onSupplement,onPublish,draftRunIds=[],discussions=[],onOpenMember,onCreateTask}:Props):React.ReactNode {
 const {meetingCall,isCurrent}=useScopedOperations()
 const now=useRelativeNow()
 const [search,setSearch]=useState(false),[query,setQuery]=useState(''),[limit,setLimit]=useState(40),[unread,setUnread]=useState(false)
 const [response,setResponse]=useState<{messageIds:string[];nonce:number;contextTaskId?:string;recipientIds?:string[];purpose?:'task-card'}>(),[reference,setReference]=useState<MeetingMessage>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [confirmation,setConfirmation]=useState<{action:string;body:object;text:string}>()
 const scroll=useRef<HTMLDivElement>(null),atBottom=useRef(true),guard=useRef(false),heightBefore=useRef<number>()
 const name=(id:string)=>{if(id==='user')return '你';if(id==='secretary')return '秘书';const m=members.find(m=>m.id===id);return m?`${m.name}${members.filter(x=>x.name===m.name).length>1?' · '+id.slice(-6):''}`:names[id]??`历史成员 · ${id.slice(-6)}`}
 const [revisionTarget,setRevisionTarget]=useState<string>()
 const revisionTask=releases.flatMap(r=>r.tasks).find(t=>t.taskId===revisionTarget)
 const publicMessages=messages.filter(m=>!m.previewOnly),filtered=publicMessages.filter(m=>!query||`${name(m.sender)} ${m.text}`.toLowerCase().includes(query.toLowerCase()))
 const newest=publicMessages.at(-1)?.id
 useEffect(()=>{const box=scroll.current;if(!box)return;if(atBottom.current){box.scrollTop=box.scrollHeight;setUnread(false)}else setUnread(true)},[newest])
 useEffect(()=>{const box=scroll.current;if(box&&heightBefore.current!==undefined){box.scrollTop+=box.scrollHeight-heightBefore.current;heightBefore.current=undefined}},[limit])
 const action=async(fn:()=>Promise<void>)=>{if(guard.current||!isCurrent())return;guard.current=true;setBusy(true);setError('');try{await fn()}catch(e){if(isCurrent())setError(e instanceof Error?e.message:String(e))}finally{guard.current=false;if(isCurrent())setBusy(false)}}
 const refreshAccepted=async()=>{if(!isCurrent())return;try{await onChanged()}catch(e){if(isCurrent())setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`)}}
 const call=(what:string,body:object)=>{void action(async()=>{await meetingCall(meetingId,what,body);await refreshAccepted()})}
 const showReference=(id:string)=>{if(!isCurrent())return;const message=publicMessages.find(m=>m.id===id);if(message){setReference(message);return}void action(async()=>{const {message}=await meetingCall(meetingId,'lookup-message',{id});if(!isCurrent())return;if(!message||message.previewOnly)throw Error('原消息不存在或尚未公开');setReference(message)})}
 const taskPaused=(task:ReleaseTask)=>paused||!!(run?.paused&&task.workflow?.runId===run.id)
 const status=(task:ReleaseTask)=>{
  if(task.restoration?.state==='restoring')return '正在恢复原会话'
  if(task.status==='offline'&&task.error?.startsWith('会话状态需核对'))return '会话状态需核对'
  if(task.status==='queued'){const s=memberStatus[task.toSessionId];return taskPaused(task)?'投递已暂停':s?.running?'等待窗口空闲':s?.blockers.length?'等待前项任务':'等待投递'}
  return {offline:'原窗口未连接',delivering:'正在投递',uncertain:'投递待核实',delivered:'已投递',in_progress:'本会任务执行中',completed:'已回复',failed:'执行失败',cancelled:'已结束'}[task.status]
 }
 const taskActions=(task:ReleaseTask)=><div className="rt-chat-detail-actions">
  <button style={button} onClick={()=>onOpenSession?.(task.toSessionId)}>打开原窗口</button>
  {['delivered','in_progress','uncertain','failed'].includes(task.status)&&task.attempts!==0&&<button style={button} disabled={archived} onClick={()=>onSupplement(task)}>人工补交</button>}
  {['offline','uncertain'].includes(task.status)&&<button style={button} disabled={busy||taskPaused(task)||archived} onClick={()=>task.status==='uncertain'?setConfirmation({action:'retry-release',body:{taskId:task.taskId,allowDuplicate:true},text:'投递结果尚不确定。请先检查原窗口；确认重试可能重复执行。'}):call('retry-release',{taskId:task.taskId})}>重试投递</button>}
  {!['completed','cancelled'].includes(task.status)&&<button style={button} disabled={busy||archived} onClick={()=>setConfirmation({action:'close-task',body:{taskId:task.taskId,confirmed:true},text:'只结束本次会议等待，原窗口工作继续。'})}>结束本会等待</button>}
  {task.status==='completed'&&<><span>{reviewState({releases},task)}</span><button style={button} disabled={busy||archived||task.review==='accepted'||!!revisionChild({releases},task)} onClick={()=>call('review-task',{taskId:task.taskId,review:'accepted'})}>验收通过</button><button style={button} disabled={busy||archived||!!revisionChild({releases},task)} onClick={()=>{void action(async()=>{await meetingCall(meetingId,'review-task',{taskId:task.taskId,review:'changes_requested',note:task.reviewNote??''});await refreshAccepted();if(isCurrent())setRevisionTarget(task.taskId)})}}>要求修改</button></>}
 </div>
 return <section className="rt-chat" aria-label="会议群聊"><style>{chatStyles}</style>
  <div className="rt-chat-toolbar"><span className="rt-chat-muted">会议讨论 · 发言与任务卡</span><div><button style={button} aria-expanded={search} onClick={()=>setSearch(v=>!v)}>搜索</button><button style={button} disabled={archived} onClick={onPublish}>导入成员回复</button></div></div>
  {search&&<input aria-label="搜索会议消息" placeholder="搜索内容或成员" style={input} value={query} onChange={e=>{setQuery(e.target.value);setLimit(40)}}/>}
  {error&&<p role="alert">{error}</p>}
  <div ref={scroll} className="rt-chat-scroll" aria-label="会议消息" onScroll={()=>{const box=scroll.current;if(!box)return;atBottom.current=box.scrollHeight-box.scrollTop-box.clientHeight<60;if(atBottom.current)setUnread(false)}}>
   {filtered.length>limit&&<button style={button} onClick={()=>{heightBefore.current=scroll.current?.scrollHeight;setLimit(n=>n+40)}}>更早消息（还有 {filtered.length-limit} 条）</button>}
   {!filtered.length&&<div className="rt-chat-empty"><b>{query?'没有匹配的消息':archived?'暂无已公开内容':members.length?'开始会议讨论':'先添加会议成员'}</b><p>{query?'试试其他关键词。':archived?'会议已归档，可到设置页恢复后继续记录。':members.length?'在下方记录一个议题，或 @成员请他回应。':'也可以先记录议题；添加成员后用 @ 点名。'}</p>{!query&&!archived&&!members.length&&<button style={button} onClick={()=>onNavigate?.('members')}>添加会议成员</button>}<small>只有明确选中的内容才会交给成员。</small></div>}
   {filtered.slice(-limit).map(m=>{
    const own=m.sender==='user',release=m.releaseId?releases.find(r=>r.id===m.releaseId):undefined,task=m.taskId?releases.flatMap(r=>r.tasks).find(t=>t.taskId===m.taskId):undefined
    const discussion=m.discussionId?discussions.find(d=>d.id===m.discussionId):undefined
    return <article key={m.id} id={`flow-${m.id}`} data-flow-message={m.id} className={`rt-chat-row ${own?'own':''}`}>
     <button className={`rt-chat-avatar ${m.sender==='secretary'?'secretary':''}`} aria-label={own?'主持人':`查看${name(m.sender)}成员详情`} disabled={own||m.sender==='secretary'} onClick={()=>onOpenMember?.(m.sender)}>{own?'你':name(m.sender).slice(0,1)}</button>
     <div className="rt-chat-message"><div className="rt-chat-author"><b>{name(m.sender)}</b><RelativeTime timestamp={m.time} now={now}/>{m.source?.kind==='manual'&&<small>人工公开{m.source.excerpt?' · 节选':''}</small>}</div>
      <div className="rt-chat-bubble">
       {!!m.replyTo?.length&&<div className="rt-chat-reply-links">{m.replyTo.slice(0,3).map(id=><button key={id} onClick={()=>showReference(id)}>↳ {publicMessages.find(x=>x.id===id)?.text.slice(0,75)??'查看引用原文'}</button>)}{m.replyTo.length>3&&<small>另有 {m.replyTo.length-3} 条引用，可在详情查看</small>}</div>}
       {!!release&&<div className="rt-chat-chips"><b>工作任务卡</b>{release.recipientIds.map(id=><span key={id} className="rt-chat-mention">@{name(id)}</span>)}</div>}
       {!!discussion&&discussion.messageId===m.id&&<div className="rt-chat-chips">{discussion.recipientIds.map(id=><span key={id} className="rt-chat-mention">@{name(id)}</span>)}<small>{discussion.contextTaskId?'原工作澄清／补充':'普通讨论消息'}</small></div>}
       {m.text.length>1200?<details><summary>{m.text.slice(0,170)}… 展开全文</summary><p className="rt-chat-text">{m.text}</p></details>:<p className="rt-chat-text">{m.text}</p>}
       {!!m.assetIds?.length&&<ChatAssetPreview meetingId={meetingId} assets={assets} assetIds={m.assetIds}/>}
      </div>
      <div className="rt-chat-receipts">{discussion?.messageId===m.id&&discussion.deliveries.map(d=><span key={d.toSessionId} data-discussion-receipt={discussion.id}>{name(d.toSessionId)} · {discussion.replies.some(r=>r.sessionId===d.toSessionId)?'已回应':d.status==='delivered'?'已送入原会话':d.status==='queued'?'等待接收':d.status==='offline'?'恢复需处理':d.status==='uncertain'?'送达需核实':d.status==='cancelled'?'已结束':d.status==='failed'?'接收失败，图文未处理':'投递中'}</span>)}{release?.tasks.map(t=><span key={t.taskId} data-chat-receipt={t.taskId} data-status={t.status}>{name(t.toSessionId)} · {status(t)}</span>)}{discussion?.messageId===m.id&&discussion.deliveries.filter(d=>d.error).map(d=><span key={'error-'+d.toSessionId} role="alert">{name(d.toSessionId)}：{d.error}</span>)}{m.recordOnly&&!release&&<span>仅记录 · 未投递</span>}{m.kind==='minutes'&&<span>{m.deliveries?.some(d=>d.status==='delivered')?'已公开 · 有成员投递记录':'已公开到会议 · 未向成员投递'}</span>}{m.deliveries?.map(d=><span key={d.sessionId}>{name(d.sessionId)} · {d.status==='delivered'?'已投递':'未送达'}</span>)}</div>
      <div className="rt-chat-message-actions"><button className="rt-chat-link" disabled={archived} onClick={()=>setResponse({messageIds:[m.id],nonce:Date.now(),...(m.taskId?{contextTaskId:m.taskId,recipientIds:[m.sender]}:m.releaseId?{contextTaskId:release?.tasks[0]?.taskId,recipientIds:release?.recipientIds}:{})})}>回复</button><details><summary>更多</summary><div className="rt-chat-detail-actions"><button style={button} disabled={archived} onClick={()=>{setResponse({messageIds:[m.id],nonce:Date.now(),purpose:'task-card'});onPrepareTask(m)}}>据此生成任务卡</button><button style={button} disabled={archived||busy||m.id.startsWith('conclusion-')} onClick={()=>call('mark-conclusion',{messageId:m.id})}>标记为结论</button><button style={button} onClick={()=>{void navigator.clipboard.writeText(m.text).catch(e=>setError(String(e)))}}>复制正文</button><button style={button} onClick={()=>showReference(m.id)}>来源与全文</button></div>{(m.replyTo??[]).map(id=><button key={id} style={button} onClick={()=>showReference(id)}>查看引用 {publicMessages.find(x=>x.id===id)?.text.slice(0,25)??'历史消息'}</button>)}{release?.tasks.map(t=><button key={t.taskId} style={button} onClick={()=>onOpenMember?.(t.toSessionId,t.taskId)}>{name(t.toSessionId)} · {status(t)} → 成员工作日志</button>)}{task&&<button style={button} onClick={()=>onOpenMember?.(task.toSessionId,task.taskId)}>查看这项工作的详细日志</button>}</details></div>
     </div>
    </article>
   })}
  </div>
  {unread&&<button className="rt-chat-new" onClick={()=>{const box=scroll.current;if(box)box.scrollTop=box.scrollHeight;atBottom.current=true;setUnread(false)}}>有新消息 ↓</button>}
  {reference&&<div className="rt-chat-overlay" role="dialog" aria-label="引用原文"><header><b>{name(reference.sender)} · {new Date(reference.time).toLocaleString()}</b><button style={button} onClick={()=>setReference(undefined)}>关闭原文</button></header><p className="rt-chat-text">{reference.text}</p><small>{reference.source?.kind==='manual'?`人工公开 · 原回复 #${reference.source.seq}${reference.source.excerpt?' · 节选':''}`:reference.source?.kind==='agent'?'Agent正式提交':'会议资料'}<br/>{reference.id}{reference.taskId?` / ${reference.taskId}`:''}</small></div>}
  {confirmation&&<div className="rt-chat-overlay" role="alertdialog" aria-label="确认任务操作"><p>{confirmation.text}</p><button style={button} disabled={busy} onClick={()=>{call(confirmation.action,confirmation.body);setConfirmation(undefined)}}>确认</button><button style={button} onClick={()=>setConfirmation(undefined)}>取消</button></div>}
  {revisionTask&&<RevisionPanel key={revisionTask.taskId} meetingId={meetingId} task={revisionTask} memberName={name(revisionTask.toSessionId)} onChanged={onChanged} onClose={()=>setRevisionTarget(undefined)}/>}
  <HostingComposer key={`${meetingId}:${run?.id??'plain'}`} onCreateTask={onCreateTask} meetingId={meetingId} run={run} members={members} messages={publicMessages} assets={assets} paused={paused} archived={archived} prepared={response} onPrepared={()=>setResponse(undefined)} onChanged={onChanged} onNavigate={onNavigate} memberStatus={memberStatus} draftRunIds={draftRunIds}/>
  <div className="rt-chat-floating-layer" data-rt-chat-floating-layer=""/>
 </section>
}
