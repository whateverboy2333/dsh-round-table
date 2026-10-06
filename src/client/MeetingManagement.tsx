import {useState} from 'react'
import {downloadText} from './ui-state.ts'
import {useScopedOperations} from './use-scoped-operations.ts'
const button:React.CSSProperties={font:'inherit',padding:'5px 8px',border:'1px solid var(--dsw-alias-border-l1)',borderRadius:6,background:'var(--dsw-alias-bg-base)',color:'inherit',cursor:'pointer'}
export function MeetingManagement({meeting,onChanged,onDeleted}:{meeting:{meetingId:string;title:string;description?:string;archivedAt?:number;minutesSource?:'formal'|'session';secretaryTitleError?:string;deletion?:{error?:string;notify?:boolean}};onChanged:()=>Promise<void>;onDeleted:(message:string)=>void}):React.ReactNode{
  const {meetingCall,isCurrent}=useScopedOperations()
  const [edit,setEdit]=useState(false),[title,setTitle]=useState(meeting.title),[description,setDescription]=useState(meeting.description??'')
  const [confirm,setConfirm]=useState(false),[notify,setNotify]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string>()
  const [archiveConfirm,setArchiveConfirm]=useState(false),[sourceConfirm,setSourceConfirm]=useState(false)
  const refreshAccepted=async()=>{if(!isCurrent())return;try{await onChanged()}catch(e){if(isCurrent())setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`)}}
  const manage=async(action:string,body:object)=>{if(busy||!isCurrent())return;setBusy(true);setError(undefined);try{await meetingCall(meeting.meetingId,action,body);await refreshAccepted()}catch(e){if(isCurrent())setError(String(e instanceof Error?e.message:e))}finally{if(isCurrent())setBusy(false)}}
  const act=async(action:string,body:unknown)=>{if(busy||!isCurrent())return;setBusy(true);setError(undefined);try{
    const result=await meetingCall(meeting.meetingId,action,body) as {deliveries?:{sessionId:string;status:string;error?:string}[]}
    if(!isCurrent())return
    if(action==='delete'){const failed=result.deliveries?.filter(d=>d.status!=='delivered')??[];onDeleted(`会议已删除，普通成员会话保留。${failed.length?`未送达通知：${failed.map(d=>`${d.sessionId}（${d.error}）`).join('；')}`:''}`)}
    else{setEdit(false);await refreshAccepted()}
  }catch(e){if(isCurrent()){setError(e instanceof Error?e.message:String(e));try{await onChanged()}catch{/* The original request error stays visible. */}}}finally{if(isCurrent())setBusy(false)}}
  return <section data-meeting-management="" style={{fontSize:12,display:'flex',flexDirection:'column',gap:6,flex:'none'}}>
    <b>纪要读取范围</b><p>当前：{meeting.minutesSource==='session'?'参会期间原会话回复（可能含私聊）':'仅正式会议资料'}。生成前可在纪要页预览输入。已生成的历史纪要不自动改写。</p>
    <div><button style={button} disabled={busy||meeting.minutesSource!=='session'} onClick={()=>{void manage('minutes-source',{source:'formal'})}}>只读正式资料</button><button style={button} disabled={busy||meeting.minutesSource==='session'} onClick={()=>setSourceConfirm(true)}>包括原会话回复…</button></div>
    {sourceConfirm&&<div role="alertdialog" aria-label="确认纪要范围"><p>这会读取成员参会期间的原会话回复，可能包含未发布的私聊。是否允许？</p><button style={button} onClick={()=>{void manage('minutes-source',{source:'session',confirmed:true});setSourceConfirm(false)}}>确认允许读取</button><button style={button} onClick={()=>setSourceConfirm(false)}>取消</button></div>}
    <b>保存与整理</b><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={button} disabled={busy} onClick={()=>{if(!isCurrent())return;setBusy(true);void meetingCall(meeting.meetingId,'export').then(v=>{if(isCurrent())downloadText(`${meeting.title.replace(/[\\/:*?"<>|]/g,'_')}.md`,v.markdown)}).catch(e=>{if(isCurrent())setError(String(e))}).finally(()=>{if(isCurrent())setBusy(false)})}}>导出会议与验收记录</button><button style={button} disabled={busy} onClick={()=>meeting.archivedAt?void manage('archive',{archived:false}):setArchiveConfirm(true)}>{meeting.archivedAt?'恢复归档会议':'结束并归档…'}</button></div>
    {archiveConfirm&&<div role="alertdialog" aria-label="确认归档"><p>保留全部资料，结束未完成的会议等待，不停止或删除原窗口。归档后可恢复。</p><button style={button} onClick={()=>{void manage('archive',{archived:true,confirmed:true});setArchiveConfirm(false)}}>确认归档</button><button style={button} onClick={()=>setArchiveConfirm(false)}>取消</button></div>}
    <div style={{display:'flex',gap:6}}><button style={button} type="button" disabled={busy||!!meeting.deletion} onClick={()=>{setTitle(meeting.title);setDescription(meeting.description??'');setEdit(true);setConfirm(false)}}>编辑会议信息</button><button style={{...button,color:'var(--dsw-alias-state-error-primary)'}} type="button" disabled={busy} onClick={()=>{setConfirm(true);setEdit(false)}}>删除会议</button></div>
    {edit&&<div style={{display:'flex',flexDirection:'column',gap:6}}><label>会议标题<input aria-label="编辑会议标题" value={title} onChange={e=>setTitle(e.target.value)} disabled={busy}/></label><label>会议说明<textarea aria-label="编辑会议说明" value={description} onChange={e=>setDescription(e.target.value)} disabled={busy}/></label><div><button style={button} disabled={busy||!title.trim()} onClick={()=>{void act('edit',{title,description})}}>保存修改</button> <button style={button} disabled={busy} onClick={()=>setEdit(false)}>取消编辑</button></div></div>}
    {meeting.secretaryTitleError&&<p role="alert">会议已改名，秘书名称同步失败：{meeting.secretaryTitleError} <button style={button} disabled={busy||!!meeting.deletion} onClick={()=>{void act('edit',{title:meeting.title,description:meeting.description??''})}}>重试同步名称</button></p>}
    {meeting.deletion&&<p role="alert">会议正在删除或删除未完成，仅可重试删除。{meeting.deletion.error}</p>}
    {confirm&&<div role="alertdialog" aria-label="确认永久删除会议" style={{border:'1px solid var(--dsw-alias-state-error-primary)',padding:8,borderRadius:8}}><p>永久删除会议「{meeting.title}」、全部会议记录及其专属秘书会话，无法恢复。普通成员会话不受影响。</p><label><input type="checkbox" checked={meeting.deletion?.notify ?? notify} onChange={e=>setNotify(e.target.checked)} disabled={busy||!!meeting.deletion}/>通知普通参会成员会议已解散</label><div style={{marginTop:8}}><button style={button} disabled={busy} onClick={()=>setConfirm(false)}>取消</button> <button style={{...button,color:'var(--dsw-alias-state-error-primary)'}} disabled={busy} onClick={()=>{void act('delete',{confirmed:true,notify})}}>{busy?'删除中…':'永久删除'}</button></div></div>}
    {error&&<p role="alert" style={{overflowWrap:'anywhere'}}>{error}</p>}
  </section>
}
