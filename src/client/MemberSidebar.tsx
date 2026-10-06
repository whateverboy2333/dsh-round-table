import {useEffect,useRef,useState} from 'react'
import {memberWorkLog,type MemberLogMeeting} from './member-work-log.ts'
import {uiButton as button} from './ui-state.ts'
export interface SidebarMember {id:string;name:string;statusLabel?:string;workspaceLabel?:string;connected?:boolean;running?:boolean;historical?:boolean}
export interface MemberSidebarProps {open:boolean;meeting:MemberLogMeeting;members:SidebarMember[];selectedMemberId?:string|null;onSelectMember?:(id:string|null)=>void;onClose:()=>void;onNavigateTask?:(taskId:string)=>void;focusTaskId?:string;renderManagement?:()=>React.ReactNode;renderMemberDetails?:(memberId:string)=>React.ReactNode;renderTaskActions?:(memberId:string)=>React.ReactNode}
/** Local side-panel navigation does not navigate or replace the mounted discussion. */
export function MemberSidebar({open,meeting,members,selectedMemberId,onSelectMember,onClose,onNavigateTask,focusTaskId,renderManagement,renderMemberDetails,renderTaskActions}:MemberSidebarProps):React.ReactNode{
 const [selection,setSelection]=useState<string|null>(null),[page,setPage]=useState<'details'|'log'>('details'),panel=useRef<HTMLElement>(null),returnFocus=useRef<HTMLElement>()
 const selected=selectedMemberId===undefined?selection:selectedMemberId,member=members.find(m=>m.id===selected),logs=member?memberWorkLog(meeting,member.id):[]
 const choose=(id:string|null)=>{setSelection(id);setPage('details');onSelectMember?.(id)}
 const close=()=>{onClose();returnFocus.current?.focus()}
 useEffect(()=>{if(!open)return;if(typeof document!=='undefined')returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:undefined;panel.current?.focus();return()=>returnFocus.current?.focus()},[open])
 useEffect(()=>{if(focusTaskId)setPage('log')},[focusTaskId,selected])
 if(!open)return null
 return <aside ref={panel} className="rt-member-sidebar" aria-label="会议成员边栏" tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close()}}}>
  <header className="rt-member-sidebar-header"><strong>{member?member.name:'会议成员'}</strong><button style={button} onClick={close}>收起成员边栏</button></header>
  <div className="rt-member-sidebar-scroll">
   {!member?<><p className="rt-member-note">查看成员详情与本会工作日志；讨论与未发送输入保持原位。</p><div className="rt-member-roster">{members.map(m=><article key={m.id}><button style={{...button,width:'100%',textAlign:'left'}} onClick={()=>choose(m.id)}>{m.name}</button><small>{m.statusLabel??(m.running?'原窗口忙碌':m.connected?'可接收':m.historical?'历史成员':'状态待核对')}{m.workspaceLabel?` · ${m.workspaceLabel}`:''}</small></article>)}</div>{!members.length&&<p>本会尚无成员，可在下方添加原窗口。</p>}{renderManagement?.()}</>:<>
    <button style={button} onClick={()=>choose(null)}>返回成员列表</button><p className="rt-member-note">{member.statusLabel??'原窗口状态以宿主核对为准'}{member.workspaceLabel?` · ${member.workspaceLabel}`:''}</p>
    <nav aria-label="成员详情导航" className="rt-member-tabs"><button style={button} aria-pressed={page==='details'} onClick={()=>setPage('details')}>成员详情</button><button style={button} aria-pressed={page==='log'} onClick={()=>setPage('log')}>会议工作日志</button></nav>
    {page==='details'?renderMemberDetails?.(member.id)??<p>请选择工作日志查看这位成员在本会的公开记录。</p>:<section aria-label={`${member.name}的会议工作日志`}><p className="rt-member-note">仅整理本会已有要求、资料、投递、回应、修改和验收事实。普通回应不等同工作成果；不自动读取原窗口其他私聊。</p>{!logs.length&&<p>这位成员尚无本会工作记录。</p>}{logs.map(item=><details key={item.id} open={!!focusTaskId&&item.taskId===focusTaskId} data-member-log={item.id}><summary>{item.kind==='task'?'工作任务':item.kind==='discussion'?'普通讨论':'参会'} · {item.title}</summary><p>{item.status}</p>{item.parentTaskId&&<p>这是原工作要求的关联修改，原结果仍保留。</p>}{item.taskId&&onNavigateTask&&<button style={button} onClick={()=>onNavigateTask(item.taskId!)}>查看这项工作</button>}{item.materials.length>0&&<details><summary>选定资料（{item.materials.length}）</summary>{item.materials.map(m=><div key={m.id}><b>{m.name}</b>{m.text&&<p className="rt-member-log-text">{m.text}</p>}</div>)}</details>}{item.entries.map(entry=><article key={entry.id} className="rt-member-log-entry"><small>{new Date(entry.time).toLocaleString()}</small><b>{entry.title}</b><p className="rt-member-log-text">{entry.text}</p>{entry.source&&<small>{entry.source}</small>}</article>)}</details>)}{renderTaskActions?.(member.id)}</section>}
   </>}
  </div>
 </aside>
}
