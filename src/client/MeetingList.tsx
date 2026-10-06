import {useEffect,useRef,useState} from 'react'
import {meetingCall,uiButton as button,uiInput as input} from './ui-state.ts'
import {sortedMeetings,meetingListStatus,matchesMeetingState,type MeetingListItem} from './meeting-list-state.ts'
import {RelativeTime,useRelativeNow} from './RelativeTime.tsx'
import {useScopedOperations} from './use-scoped-operations.ts'

type Selected={meetingId:string;title:string}
type Outcome=Selected&{ok:boolean;error?:string}
export function MeetingList({meetings,onCreate,onOpen,onChanged}:{meetings:MeetingListItem[]|undefined;onCreate:()=>void;onOpen:(id:string)=>void;onChanged:()=>Promise<void>}):React.ReactNode{
 const {meetingCall,isCurrent}=useScopedOperations()
 const now=useRelativeNow()
 const [query,setQuery]=useState(''),[archived,setArchived]=useState(false),[managing,setManaging]=useState(false)
 const [stateType,setStateType]=useState('all')
 const [selected,setSelected]=useState<string[]>([]),[confirmation,setConfirmation]=useState<Selected[]>(),[outcomes,setOutcomes]=useState<Outcome[]>([])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[progress,setProgress]=useState(0)
 const guard=useRef(false)
 const listed=sortedMeetings(meetings??[],query,archived).filter(m=>matchesMeetingState(m,stateType)),eligible=listed.filter(m=>!m.deletion&&!m.listReadOnly&&!m.archivedAt)
 const eligibleIds=eligible.map(m=>m.meetingId),selectedVisible=selected.filter(id=>eligibleIds.includes(id)),all=eligible.length>0&&selectedVisible.length===eligible.length
 const eligibilityStamp=eligibleIds.slice().sort().join('|')
 useEffect(()=>{setSelected(old=>old.filter(id=>eligibleIds.includes(id)))},[eligibilityStamp])
 const resetSelection=()=>{setSelected([]);setConfirmation(undefined);setOutcomes([]);setNotice('');setError('')}
 const pin=async(m:MeetingListItem)=>{
  if(guard.current||!isCurrent())return;guard.current=true;setBusy(true);setError('');setNotice('');setProgress(0)
  try{await meetingCall(m.meetingId,'pin',{pinned:!m.pinnedAt});if(!isCurrent())return;await onChanged();if(isCurrent())setNotice(m.pinnedAt?'已取消置顶。':'会议已置顶。')}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{guard.current=false;setBusy(false)}
 }
 const archive=async()=>{
  if(guard.current||!confirmation?.length||!isCurrent())return;guard.current=true;setBusy(true);setError('');setNotice('');setProgress(0);setOutcomes([])
  const snapshot=confirmation,results:Outcome[]=[];setConfirmation(undefined)
  try{
   for(const item of snapshot){
    if(!isCurrent())return
    try{await meetingCall(item.meetingId,'archive',{archived:true,confirmed:true});results.push({...item,ok:true})}
    catch(e){results.push({...item,ok:false,error:e instanceof Error?e.message:String(e)})}
    if(!isCurrent())return;setProgress(results.length);setOutcomes([...results])
   }
   setSelected(results.filter(r=>!r.ok).map(r=>r.meetingId))
   const succeeded=results.filter(r=>r.ok).length;setNotice(`已归档 ${succeeded} 个会议${results.length>succeeded?`，${results.length-succeeded} 个未确认成功；请查看下方原因。`:'。'}`)
   await onChanged()
  }catch(e){setError(`列表刷新失败，请刷新核对：${String(e)}`)}finally{guard.current=false;setBusy(false)}
 }
 const badgeColor=(tone:string)=>tone==='warning'?'var(--dsw-alias-state-error-primary,#9a5600)':tone==='active'?'var(--dsw-alias-state-business-primary,#2470b5)':tone==='review'?'var(--dsw-alias-label-primary)':tone==='done'?'#16794c':'var(--dsw-alias-label-secondary)'
 return <section aria-label="会议列表" style={{display:'flex',flexDirection:'column',flex:1,minHeight:0,minWidth:0,fontSize:12}}>
  <div style={{flex:'none',marginBottom:8,display:'flex',flexDirection:'column',gap:8}}>
   <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={button} disabled={busy} onClick={onCreate}>新建会议</button><button style={button} disabled={busy||archived||meetings===undefined} aria-pressed={managing} onClick={()=>{setManaging(!managing);resetSelection()}}>{managing?'退出管理':'管理会议'}</button></div>
   <input aria-label="搜索会议" placeholder="搜索会议名称或说明" style={input} value={query} disabled={busy} onChange={e=>{setQuery(e.target.value);resetSelection()}}/>
   <label>状态 <select aria-label="按会议状态筛选" value={stateType} disabled={busy} style={button} onChange={e=>{setStateType(e.target.value);resetSelection()}}><option value="all">全部状态</option><option value="review">待验收</option><option value="fault">需核实／故障</option><option value="running">执行中</option></select></label>
   <label><input type="checkbox" checked={archived} disabled={busy} onChange={e=>{setArchived(e.target.checked);setManaging(false);resetSelection()}}/>查看已归档会议</label>
   {managing&&<div style={{padding:8,border:'1px solid var(--dsw-alias-border-l2)',borderRadius:8,display:'flex',flexDirection:'column',gap:8}}><label><input type="checkbox" aria-label="全选当前筛选结果" checked={all} disabled={busy||!eligible.length} onChange={()=>{setSelected(all?[]:eligibleIds);setConfirmation(undefined)}}/>全选当前筛选结果</label><span>已选 {selectedVisible.length} 个会议</span><button style={button} disabled={busy||!selectedVisible.length} onClick={()=>setConfirmation(eligible.filter(m=>selectedVisible.includes(m.meetingId)).map(m=>({meetingId:m.meetingId,title:m.title})))}>归档所选会议…</button><small>更改搜索或归档视图会清空选择。</small></div>}
   {busy&&progress>0&&<p role="status" style={{margin:0}}>已处理 {progress} 个会议…</p>}
   {notice&&<p role="status" style={{margin:0,overflowWrap:'anywhere'}}>{notice}</p>}{error&&<p role="alert" style={{margin:0,color:'var(--dsw-alias-state-error-primary)',overflowWrap:'anywhere'}}>{error}</p>}
  </div>
  <div style={{flex:1,minHeight:0,minWidth:0,overflowY:'auto',overflowX:'hidden'}}>
   {confirmation&&<section role="alertdialog" aria-label="确认批量归档" style={{border:'1px solid var(--dsw-alias-border-l2)',padding:10,borderRadius:8,marginBottom:10,overflowWrap:'anywhere'}}><b>归档以下 {confirmation.length} 个会议？</b><p>保留会议资料和成员会话；结束这些会议的未完成等待与流程，取消正在生成的纪要。原成员窗口中的工作不会被停止。恢复会议后，已结束的等待不会自动重开。</p><ul style={{paddingLeft:20,maxHeight:160,overflowY:'auto'}}>{confirmation.map(m=><li key={m.meetingId}>{m.title} <small>· {m.meetingId.slice(-6)}</small></li>)}</ul><div style={{display:'flex',flexWrap:'wrap',gap:6}}><button style={button} disabled={busy} onClick={()=>{void archive()}}>确认归档所选会议</button><button style={button} disabled={busy} onClick={()=>setConfirmation(undefined)}>取消归档</button></div></section>}
   {outcomes.length>0&&<details open={outcomes.some(r=>!r.ok)} style={{marginBottom:10,overflowWrap:'anywhere'}}><summary>本次归档结果（{outcomes.length}）</summary><ul style={{paddingLeft:20}}>{outcomes.map(r=><li key={r.meetingId}>{r.title}：{r.ok?'已归档':`未确认成功：${r.error}。可刷新核对后重试。`}</li>)}</ul></details>}
   {meetings===undefined?<p>加载中…</p>:!listed.length?<div style={{padding:10,lineHeight:1.7}}><p>{query?'没有匹配当前搜索与状态的会议。':stateType!=='all'?`当前筛选下没有${stateType==='review'?'待验收':stateType==='fault'?'需核实／故障':'执行中'}的会议。`:archived?'暂无已归档会议。讨论结束后，可在管理模式中归档整理。':'暂无会议。点击“新建会议”，填写目标并邀请成员开始讨论。'}</p>{query&&<button style={button} onClick={()=>{setQuery('');resetSelection()}}>清除搜索</button>}{stateType!=='all'&&<button style={button} onClick={()=>{setStateType('all');resetSelection()}}>查看全部状态</button>}</div>:null}
   <ul style={{listStyle:'none',margin:0,padding:0,display:'flex',flexDirection:'column',gap:8}}>
    {listed.map(m=>{const status=meetingListStatus(m);return <li key={m.meetingId} data-meeting-list-row={m.meetingId} style={{border:'1px solid var(--dsw-alias-border-l2)',borderRadius:9,minWidth:0,padding:8,display:'flex',flexDirection:'column',gap:6}}>
     <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',minWidth:0}}>
      {managing&&<input type="checkbox" data-meeting-select={m.meetingId} aria-label={`选择会议「${m.title}」`} checked={selectedVisible.includes(m.meetingId)} disabled={busy||!eligibleIds.includes(m.meetingId)} onChange={()=>{setSelected(old=>old.includes(m.meetingId)?old.filter(id=>id!==m.meetingId):[...old,m.meetingId]);setConfirmation(undefined)}}/>}
      <span data-meeting-state={m.meetingId} style={{fontSize:11,color:badgeColor(status.tone)}}>{status.label}</span>
      <button data-meeting-pin={m.meetingId} style={{...button,padding:'2px 6px',marginLeft:'auto',fontSize:11,whiteSpace:'nowrap'}} aria-label={`${m.pinnedAt?'取消置顶':'置顶'}「${m.title}」`} aria-pressed={!!m.pinnedAt} disabled={busy||!!m.deletion||m.listReadOnly} onClick={()=>{void pin(m)}}>{m.pinnedAt?'★ 已置顶':'☆ 置顶'}</button>
     </div>
     <button data-round-table-meeting={m.meetingId} type="button" disabled={busy} onClick={()=>onOpen(m.meetingId)} style={{...button,padding:0,border:0,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4,width:'100%',minWidth:0,textAlign:'left',overflowWrap:'anywhere'}}>
      <span title={m.title} style={{fontSize:13,fontWeight:500,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.title}</span>
      <span style={{fontSize:11,color:'var(--dsw-alias-label-tertiary)'}}>{m.memberSessionIds.length} 位成员 · 最近活动 <RelativeTime timestamp={m.lastActivity??m.createdAt} now={now}/></span>
      <span style={{fontSize:12}}>{m.counts?.awaitingReview!==undefined?<>{m.counts.awaitingReview} 项待验收 · {m.counts.faults??0} 项需核实／故障 · {m.counts.running??0} 项执行中</>:<>{m.counts?.pending??0} 项未结束 · {m.counts?.attention??0} 项待处理／验收</>}</span>
      {!m.deletion&&m.secretary?.status!=='ready'&&<span style={{fontSize:11,color:'var(--dsw-alias-state-error-primary)'}}>{m.secretary?.status==='initializing'?'秘书初始化中':m.secretary?'秘书需要重试':'未配置会议秘书 · 进入会议补建'}</span>}
     </button>
    </li>})}
   </ul>
  </div>
 </section>
}
