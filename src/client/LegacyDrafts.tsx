import {useEffect,useRef,useState} from 'react'
import {localScopeId,scopedLocal,uiButton as button} from './ui-state.ts'
import {collectLegacyDrafts,recoveryContent,type RecoveryEntry,type RecoveryMeeting} from './legacy-draft-model.ts'
export function LegacyDrafts({onImported,meetings:provided=[],requestOpen=0}:{home:string;profile:string;onImported:(entry?:RecoveryEntry)=>void;meetings?:RecoveryMeeting[];requestOpen?:number}):React.ReactNode{
 const owner=useRef(localScopeId()).current,{readLocal,writeLocal}=scopedLocal(owner)
 const [dismissed,setDismissed]=useState(()=>readLocal('legacy-recovery-dismissed',false)),[open,setOpen]=useState(false),[meetings,setMeetings]=useState(provided)
 const [selected,setSelected]=useState<string>(),[ownership,setOwnership]=useState(false),[notice,setNotice]=useState('')
 const [handled,setHandled]=useState<Record<string,string>>(()=>readLocal('legacy-recovery-handled',{}))
 const focus=useRef<HTMLElement>(),dialog=useRef<HTMLElement>(null)
 useEffect(()=>{if(provided.length)setMeetings(provided)},[provided])
 useEffect(()=>{if(provided.length||!open)return;let alive=true;void fetch('/plugins/round-table/meetings?view=summary').then(r=>{if(!r.ok)throw Error('无法读取会议名称');return r.json()}).then(v=>{if(alive&&owner===localScopeId())setMeetings(v.meetings??[])}).catch(()=>{if(alive)setNotice('暂时无法确认所属会议，可以先预览或复制正文。')});return()=>{alive=false}},[open])
 useEffect(()=>{if(requestOpen){setOpen(true);setNotice('')}},[requestOpen])
 useEffect(()=>{if(open)dialog.current?.focus()},[open])
 let entries:RecoveryEntry[]=[];try{entries=collectLegacyDrafts(localStorage,meetings)}catch{/* Parent persistence notice covers storage access errors. */}
 const fingerprint=(entry:RecoveryEntry)=>JSON.stringify(entry.values)
 const unhandled=entries.filter(e=>handled?.[e.id]!==fingerprint(e))
 const entry=entries.find(e=>e.id===selected)
 const close=()=>{setOpen(false);setSelected(undefined);setOwnership(false);focus.current?.focus()}
 const restore=()=>{
  if(!entry||!owner||owner!==localScopeId()||!ownership||!entry.knownMeeting||entry.recoveryBlocked)return
  try{if(entry.values.some(v=>{const raw=localStorage.getItem(`round-table.${owner}.${v.key}`),current=raw===null?undefined:JSON.parse(raw);return !!recoveryContent(current)||(v.key.endsWith('.pending')||v.key.startsWith('editor-save.'))&&!!current})){setNotice('当前已有编辑内容或待核实请求，已保留原稿。请先处理当前草稿，或复制这份旧内容。');return}}catch{setNotice('当前草稿无法读取或格式损坏，暂不覆盖。原记录仍在，可以先复制正文。');return}
  const ordered=[...entry.values].sort((a,b)=>Number(b.key.endsWith('.pending')||b.key.startsWith('editor-save.'))-Number(a.key.endsWith('.pending')||a.key.startsWith('editor-save.')))
  let restoredRequest=false
  for(const value of ordered){if(!writeLocal(value.key,value.value)){setNotice('未能完整保存恢复内容。原记录仍在；请保留此窗口并复制正文，勿另起发送。');if(restoredRequest)onImported(entry);return}if(value.key.endsWith('.pending')||value.key.startsWith('editor-save.'))restoredRequest=true}
  // A copied uncertain request is still unresolved. Only confirmed ordinary or known-outcome recovery closes its reminder.
  if(!entry.pending||entry.outcome==='completed'||entry.outcome==='rejected'){
   const next={...handled,[entry.id]:fingerprint(entry)};setHandled(next);writeLocal('legacy-recovery-handled',next)
  }
  setNotice(entry.pending?entry.outcome==='completed'?'已恢复成功凭据，原会议只需完成本地草稿清理，不会再次提交。':entry.outcome==='rejected'?'已恢复拒绝凭据，原会议只需完成本地草稿恢复，不会再次提交。':'已恢复原请求，请在原会议核实接收状态；没有自动发送。':`已恢复到「${entry.meetingTitle}」的${entry.label}，仍未发送。`);onImported(entry)
 }
 return <>
  {!dismissed&&unhandled.length>0&&<div data-legacy-recovery-notice="" style={{flex:'none',fontSize:12,display:'flex',gap:6,alignItems:'center',marginBottom:4}}><span>{unhandled.every(e=>e.pending)?'仍有原发送结果需要核实':'发现之前写过的内容'}</span><button style={button} onClick={e=>{focus.current=e.currentTarget;setOpen(true);setNotice('')}}>找回旧草稿</button><button style={{...button,border:0}} onClick={()=>{writeLocal('legacy-recovery-dismissed',true);setDismissed(true)}}>稍后提醒</button></div>}
  {open&&<div style={{position:'fixed',inset:0,zIndex:90,display:'grid',placeItems:'center',background:'rgba(0,0,0,.25)',padding:16}}>
   <section ref={dialog} role="dialog" aria-modal="true" aria-label="找回旧草稿" tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const list=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(list?.length){const first=list[0]!,last=list[list.length-1]!;if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first.focus()}}}}} style={{background:'var(--dsw-alias-bg-base)',border:'1px solid var(--dsw-alias-border-l2)',borderRadius:12,padding:16,maxWidth:700,width:'100%',maxHeight:'82vh',overflow:'auto',boxSizing:'border-box'}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b>找回之前写的内容</b><button style={button} onClick={close}>关闭草稿恢复</button></header>
    <p>这里是旧版本中尚未处理的文字和编辑内容。查看、复制或稍后处理都不会发送给成员；原内容保留。</p>
    {!entries.length&&<p>没有可恢复的旧草稿。空草稿和页面显示偏好不需要恢复。</p>}
    {entries.map(e=><article key={e.id} data-recovery-entry={e.kind} style={{borderTop:'1px solid var(--dsw-alias-border-l2)',padding:'10px 0'}}><b>{e.meetingTitle} · {e.label}</b><p style={{margin:'5px 0',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{e.text.slice(0,130)}{e.text.length>130?'…':''}</p>{e.recipientNames.length>0&&<small>原接收人：{e.recipientNames.join('、')}</small>}{e.pending&&<p role="status">{e.outcome==='completed'?'操作已明确成功，仅本地草稿清理未完成；原成功凭据与正文成组保留。':e.outcome==='rejected'?'操作已明确拒绝，仅本地草稿恢复未完成；原拒绝凭据与正文成组保留。':'曾尝试发送，结果未确认。这不是一份普通的未发送草稿；正文与原请求已关联。'}</p>}<button style={button} onClick={()=>{setSelected(e.id);setOwnership(false);setNotice('')}}>预览这份内容</button></article>)}
    {entry&&<section aria-label="旧草稿内容预览" style={{border:'1px solid var(--dsw-alias-border-l2)',padding:12,borderRadius:8}}><b>{entry.meetingTitle} · {entry.label}</b><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:220,overflow:'auto'}}>{entry.text}</p><button style={button} onClick={()=>{void(async()=>{try{await navigator.clipboard.writeText(entry.text);setNotice('正文已复制，可以自行保留或继续编辑；没有发送。')}catch{setNotice('复制失败，请选中预览正文手动复制。')}})()}}>复制正文</button>
     {!entry.knownMeeting?<p>所属会议尚未确认；现在只提供预览或复制，不会把原请求恢复到其他会议。</p>:entry.recoveryBlocked?<p>{entry.recoveryBlocked}</p>:<><label style={{display:'block',marginTop:8}}><input type="checkbox" checked={ownership} onChange={e=>setOwnership(e.target.checked)}/>我确认这份内容属于当前会议库中的「{entry.meetingTitle}」</label>{entry.pending&&<p>{entry.outcome==='completed'||entry.outcome==='rejected'?'恢复保留已明确的结果凭据，仅处理本地草稿，不再次提交。':'恢复仅保留原发送身份，仍须核实送达；不会新建或自动重发。'}</p>}<button style={button} disabled={!ownership} onClick={restore}>{entry.pending?entry.outcome==='completed'||entry.outcome==='rejected'?'恢复本地清理记录':'恢复原请求供核实':'恢复继续编辑'}</button></>}
    </section>}
    {notice&&<p role="status">{notice}</p>}
    <footer><button style={button} onClick={()=>{writeLocal('legacy-recovery-dismissed',true);setDismissed(true);close()}}>稍后处理</button><small>以后可在会议设置中打开“找回旧草稿”。</small></footer>
   </section>
  </div>}
 </>
}
