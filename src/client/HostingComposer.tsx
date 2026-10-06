import {ComposerAttachments} from './ComposerAttachments.tsx'
import {PANEL_FILE_DROP,PANEL_FILE_DRAG} from './panel-file-drop.ts'
import {ChatAssetPreview} from './ChatAssetPreview.tsx'
import {assetStyles} from './asset-style.ts'
import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import type {WorkflowRun} from '../workflow-types.ts'
import type {MeetingAsset,MeetingMessage} from '../meeting-flow-types.ts'
import type {ChatInput,ChatPlan,ChatReceipt} from '../chat-types.ts'
import {emptyChatDraft,restoreChatDraft,mentionAt,type ChatDraft} from './chat-draft.ts'
import {scopedLocal,localScopeId,meetingCall,readLocal,writeLocal,useLocalPersistence,uiButton as button,uiInput as input} from './ui-state.ts'
type Pending={input:ChatInput;fingerprint:string;requestId:string}
type Member={id:string;name:string}
interface Props {
 meetingId:string;run?:WorkflowRun;members:Member[];messages:MeetingMessage[];assets:MeetingAsset[]
 paused?:boolean;archived?:boolean;prepared?:{messageIds:string[];nonce:number;contextTaskId?:string;recipientIds?:string[];purpose?:'task-card'};onPrepared?:()=>void;onCreateTask?:(draft:ChatDraft)=>void
 onChanged:()=>Promise<void>;onNavigate?:(page:string)=>void;memberStatus?:Record<string,{connected:boolean;running:boolean;availability?:{state:string}}>;draftRunIds?:string[]
}
export function HostingComposer({meetingId,run,members,messages,assets,paused,archived,prepared,onPrepared,onChanged,onNavigate,onCreateTask,memberStatus={},draftRunIds=[]}:Props):React.ReactNode {
 const ownerScope=useRef(localScopeId()).current,{readLocal,writeLocal,meetingCall}=scopedLocal(ownerScope)
 const persistence=useLocalPersistence()
 const storageKey=`hosting.${meetingId}.${run?.id??'plain'}`
 const [draft,setDraft]=useState<ChatDraft>(()=>restoreChatDraft(readLocal(storageKey,emptyChatDraft())))
 const [pending,setPending]=useState<Pending|undefined>(()=>readLocal<Pending|undefined>(`${storageKey}.pending`,undefined))
 const [picker,setPicker]=useState<{query:string;start?:number;end?:number}>(),[option,setOption]=useState(0),[pickerPosition,setPickerPosition]=useState<React.CSSProperties>({maxHeight:280})
 const [plan,setPlan]=useState<{key:string;value:ChatPlan}>(),[checking,setChecking]=useState(false),[previewRevision,setPreviewRevision]=useState(0)
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[rosterChanged,setRosterChanged]=useState(false)
 const guard=useRef(false),textarea=useRef<HTMLTextAreaElement>(null),composer=useRef<HTMLElement>(null),composing=useRef(false),pasted=useRef(false),liveDraft=useRef(draft),alive=useRef(true)
 const [removeAsset,setRemoveAsset]=useState<{id:string;sourceIds:string[]}>()
 const [uploadedAssets,setUploadedAssets]=useState<MeetingAsset[]>([]),[attachmentsBlocked,setAttachmentsBlocked]=useState(false),[dragging,setDragging]=useState(false),uploadReceiver=useRef<(files:File[])=>void>(()=>{})
 const pickerSearch=useRef<HTMLInputElement>(null),pickerMenu=useRef<HTMLDivElement>(null),pickerAnchor=useRef<HTMLElement|null>(null)
 const [pickerLayer,setPickerLayer]=useState<HTMLElement|null>(null)
 const rosterKey=JSON.stringify(members),lastRoster=useRef(rosterKey)
 liveDraft.current=draft
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{writeLocal(storageKey,draft)},[draft,storageKey])
 useEffect(()=>{writeLocal(`${storageKey}.pending`,pending??null)},[pending,storageKey])
 useEffect(()=>{if(lastRoster.current!==rosterKey&&draft.recipientIds.length)setRosterChanged(true);lastRoster.current=rosterKey},[rosterKey])
 useEffect(()=>{if(prepared){setDraft(d=>({...d,messageIds:[...new Set([...d.messageIds,...prepared.messageIds])],...(prepared.contextTaskId?{contextTaskId:prepared.contextTaskId}:{}),...(prepared.recipientIds?{recipientIds:[...new Set([...d.recipientIds,...prepared.recipientIds])],intent:'response' as const}:{})}));setNotice(prepared.purpose==='task-card'?'已引用到任务卡生成草稿；选择 @成员后点击任务卡生成，引用本身没有发给任何人。':prepared.contextTaskId?'已关联原工作，只发送澄清或补充，不另建任务。':'已引用，选择 @成员后发送。');textarea.current?.focus();onPrepared?.()}},[prepared?.nonce])
 useEffect(()=>{const area=textarea.current;if(area){area.style.height='auto';area.style.height=Math.min(150,Math.max(64,area.scrollHeight))+'px'}},[draft.instruction])
 useEffect(()=>{
  if(!picker||!composer.current)return
  const box=composer.current,chat=box.closest<HTMLElement>('.rt-chat'),layer=chat?.querySelector<HTMLElement>('[data-rt-chat-floating-layer]')
  if(!chat||!layer)return
  setPickerLayer(layer)
  let frame=0
  const fit=()=>{
   const boundary=chat.getBoundingClientRect(),origin=layer.getBoundingClientRect(),anchor=(pickerAnchor.current??box).getBoundingClientRect()
   // Keep the panel in this chat pane, including when the host clips or resizes it.
   const left=Math.max(boundary.left,0)+8,right=Math.min(boundary.right,window.innerWidth)-8,top=Math.max(boundary.top,0)+8,bottom=Math.min(boundary.bottom,window.innerHeight)-8
   const width=Math.max(1,Math.min(310,right-left)),above=Math.max(0,Math.min(anchor.top-8,bottom)-top),below=Math.max(0,bottom-Math.max(anchor.bottom+8,top)),up=above>=Math.min(320,bottom-top)||above>=below
   const maxHeight=Math.max(1,Math.min(320,up?above:below))
   setPickerPosition({left:Math.max(left,Math.min(anchor.left,right-width))-origin.left,right:'auto',width,maxHeight,visibility:'visible',...(up?{top:'auto',bottom:origin.bottom-Math.min(anchor.top-8,bottom)}:{top:Math.max(anchor.bottom+8,top)-origin.top,bottom:'auto'})})
  }
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(fit)}
  fit();schedule()
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):undefined
  for(const node of [chat,box,layer,pickerAnchor.current])if(node)observer?.observe(node)
  // Capture scroll from local textarea/material regions and host ancestor panes.
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true)
  return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true)}
 },[!!picker,pickerLayer])
 useEffect(()=>{if(picker)pickerSearch.current?.focus()},[!!picker,pickerLayer])
 useEffect(()=>{if(picker)pickerMenu.current?.querySelector<HTMLElement>('.rt-chat-options .active')?.scrollIntoView({block:'nearest'})},[option,picker?.query,pickerLayer])
 const closePicker=()=>{setPicker(undefined);pickerAnchor.current?.focus()}
 const change=(patch:Partial<ChatDraft>)=>{const next={...liveDraft.current,...patch};if(JSON.stringify(next)===JSON.stringify(liveDraft.current))return;liveDraft.current=next;setDraft(next);setPlan(undefined);setError('');setNotice('')}
 const requestRemoveAsset=(id:string)=>{if(guard.current||pending||busy||archived||ownerScope!==localScopeId())return;const sourceIds=messages.filter(m=>liveDraft.current.messageIds.includes(m.id)&&m.assetIds?.includes(id)).map(m=>m.id);if(sourceIds.length)setRemoveAsset({id,sourceIds});else{change({assetIds:liveDraft.current.assetIds.filter(a=>a!==id)});textarea.current?.focus()}}
 const confirmRemoveAsset=()=>{if(!removeAsset||pending||busy)return;const current=messages.filter(m=>liveDraft.current.messageIds.includes(m.id)&&m.assetIds?.includes(removeAsset.id)).map(m=>m.id);if(JSON.stringify(current)!==JSON.stringify(removeAsset.sourceIds)){setRemoveAsset({id:removeAsset.id,sourceIds:current});setError('资料引用已变化，请重新核对影响后确认移除。');return}change({assetIds:liveDraft.current.assetIds.filter(a=>a!==removeAsset.id),messageIds:liveDraft.current.messageIds.filter(id=>!removeAsset.sourceIds.includes(id))});setRemoveAsset(undefined);textarea.current?.focus()}
 const normalMode=draft.recipientIds.length&&draft.intent!=='record'?'send':'record'
 const payload:ChatInput={mode:normalMode,kind:'message',instruction:draft.instruction,messageIds:draft.messageIds,assetIds:draft.assetIds,recipientIds:normalMode==='record'?[]:draft.recipientIds,runId:run?.id??null,...(draft.contextTaskId?{contextTaskId:draft.contextTaskId}:{})}
 const selected=messages.filter(m=>draft.messageIds.includes(m.id)),selectedAssetIds=[...new Set([...draft.assetIds,...selected.flatMap(m=>m.assetIds??[])])]
 const contextKey=JSON.stringify({payload,members,selected,assets:assets.filter(a=>selectedAssetIds.includes(a.id)),paused,archived,attachmentsBlocked,run:run?{id:run.id,status:run.status,paused:run.paused,workReserved:run.workReserved,budgetGrants:run.budgetGrants}:null})
 useEffect(()=>{
  let current=true;setPlan(undefined);setError('')
  if(!payload.instruction.trim()&&!payload.assetIds.length&&!payload.messageIds.length||archived||pending||attachmentsBlocked){setChecking(false);return}
  setChecking(true)
  const timer=setTimeout(()=>{void meetingCall(meetingId,'chat-preview',{input:payload}).then(v=>{if(current){setPlan({key:contextKey,value:v.plan});setChecking(false)}}).catch(e=>{if(current){setError(String(e instanceof Error?e.message:e));setChecking(false)}})},160)
  return()=>{current=false;clearTimeout(timer)}
 },[contextKey,!!pending,previewRevision])
 const currentPlan=plan?.key===contextKey?plan.value:undefined
 const visibleAssets=[...assets,...uploadedAssets.filter(a=>!assets.some(existing=>existing.id===a.id))]
 const imageBlocked=payload.mode==='send'&&selectedAssetIds.some(id=>visibleAssets.some(a=>a.id===id&&a.image))&&(!currentPlan?.imageCapabilities||!draft.recipientIds.every(id=>currentPlan.imageCapabilities!.some(c=>c.sessionId===id&&c.state==='supported')))
 const acceptUploaded=(asset:MeetingAsset)=>{const old=alive.current&&ownerScope===localScopeId()?liveDraft.current:restoreChatDraft(readLocal(storageKey,liveDraft.current)),next={...old,assetIds:[...new Set([...old.assetIds,asset.id])]};writeLocal(storageKey,next);if(alive.current&&ownerScope===localScopeId()){liveDraft.current=next;setDraft(next);setUploadedAssets(previous=>[...previous.filter(a=>a.id!==asset.id),asset]);setPlan(undefined);void onChanged().catch(e=>{if(alive.current)setNotice('资料已保存，但列表刷新失败；当前附件引用已保留，请稍后刷新。')})}}
 const receiveFiles=(files:File[])=>{if(disabled){setNotice('当前发送结果待核实或会议不可编辑，请先处理原请求；新文件未上传。');return}setNotice('');uploadReceiver.current(files)}
 const disabled=busy||!!archived||!!pending
 const currentReceive=useRef(receiveFiles);currentReceive.current=receiveFiles
 useEffect(()=>{const node=composer.current;if(!node)return;const drop=(event:Event)=>{const detail=(event as CustomEvent<{files?:File[];error?:string}>).detail;if(detail?.error)setNotice(detail.error);else if(detail?.files)currentReceive.current(detail.files)},drag=(event:Event)=>setDragging((event as CustomEvent<{active:boolean}>).detail?.active===true);node.addEventListener(PANEL_FILE_DROP,drop);node.addEventListener(PANEL_FILE_DRAG,drag);return()=>{node.removeEventListener(PANEL_FILE_DROP,drop);node.removeEventListener(PANEL_FILE_DRAG,drag)}},[meetingId,storageKey])
 const hasDraft=(d:ChatDraft)=>!!d.instruction.trim()||!!d.messageIds.length||!!d.assetIds.length||!!d.recipientIds.length
 const otherDrafts=['plain',...draftRunIds].filter(scope=>scope!==(run?.id??'plain')).flatMap(scope=>{const key=`hosting.${meetingId}.${scope}`,saved=restoreChatDraft(readLocal(key,undefined)),waiting=readLocal<Pending|undefined>(`${key}.pending`,undefined);return hasDraft(saved)||waiting?[{scope,saved,waiting}]:[]})
 const name=(id:string)=>{const m=members.find(m=>m.id===id);return m?`${m.name}${members.filter(x=>x.name===m.name).length>1?' · '+id.slice(-6):''}`:`已离会 · ${id.slice(-6)}`}
 const options=[...members.filter(m=>`${m.name} ${m.id}`.toLowerCase().includes((picker?.query??'').toLowerCase())).map(m=>({id:m.id,label:m.name})),...(!(picker?.query)||'全体成员'.includes(picker.query)?[{id:'__all',label:'全体成员'}]:[]),...(!(picker?.query)||'秘书整理纪要'.includes(picker.query)?[{id:'__secretary',label:'秘书 · 整理纪要'}]:[])]
 const pick=(id:string)=>{
  if(id==='__secretary'){if(picker?.start!==undefined&&picker.end!==undefined&&draft.instruction.slice(picker.start,picker.end)===('@'+picker.query))change({instruction:draft.instruction.slice(0,picker.start)+draft.instruction.slice(picker.end)});closePicker();onNavigate?.('minutes');return}
  const ids=id==='__all'?members.map(m=>m.id):[id]
  let text=draft.instruction
  if(picker?.start!==undefined&&picker.end!==undefined&&text.slice(picker.start,picker.end)===`@${picker.query}`)text=text.slice(0,picker.start)+text.slice(picker.end)
  change({instruction:text,recipientIds:[...new Set([...draft.recipientIds,...ids])],intent:'response'})
  setPicker(undefined);setRosterChanged(false);textarea.current?.focus()
 }
 const finish=async(request:Pending)=>{
  if(guard.current)return;guard.current=true;setBusy(true);setError('')
  setPending(request);writeLocal(`${storageKey}.pending`,request)
  const snapshot=JSON.stringify(liveDraft.current)
  try{
   const {receipt}=await meetingCall(meetingId,'chat-send',request) as {receipt:ChatReceipt}
   const sameDraft=JSON.stringify(liveDraft.current)===snapshot
   const saved=writeLocal(storageKey,sameDraft?emptyChatDraft():liveDraft.current)
   const cleaned=saved&&writeLocal(`${storageKey}.pending`,null)===true
   if(alive.current){setPending(cleaned?undefined:request);setPlan(undefined);if(sameDraft)setDraft(emptyChatDraft());setNotice(request.input.mode==='record'?'已记录，没有唤醒成员。':request.input.mode==='queue'?`已加入第${receipt.round||1}轮，尚未投递；到进程页查看。`:request.input.kind==='message'?'普通消息已接受，接收状态见上方；没有创建工作任务。':request.input.runId?'已授权临时回应，计入额度，不推进主流程。':'已授权，接收状态见上方消息。')}
   try{await onChanged()}catch{if(alive.current)setError('发送已接受，刷新失败；请刷新查看接收状态，不必重发。')}
  }catch(e){
   if(alive.current)setError(e instanceof Error?e.message:String(e))
   if(e instanceof Error&&'requestState' in e&&e.requestState==='rejected'){const cleared=writeLocal(`${storageKey}.pending`,null)===true;if(alive.current){setPending(cleared?undefined:request);setPlan(undefined);setPreviewRevision(v=>v+1);setNotice(cleared?`未发送：${e.message}。请核对后重新发送。`:'请求明确被拒绝，但本地恢复记录未能清理；请留在本页重试原请求，当前内容保持冻结。')}}
  }finally{guard.current=false;if(alive.current)setBusy(false)}
 }
 const send=()=>{if(disabled||rosterChanged||!currentPlan||attachmentsBlocked||imageBlocked)return;void finish({input:payload,fingerprint:currentPlan.fingerprint,requestId:crypto.randomUUID()})}
 const onKey=(e:React.KeyboardEvent<HTMLTextAreaElement|HTMLInputElement>)=>{
  if(composing.current||e.nativeEvent?.isComposing||e.keyCode===229)return
  if(!picker&&e.currentTarget===textarea.current&&e.key==='Backspace'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.currentTarget.selectionStart===0&&e.currentTarget.selectionEnd===0&&selectedAssetIds.length&&!disabled){e.preventDefault();requestRemoveAsset([...selectedAssetIds].reverse().find(id=>!visibleAssets.find(a=>a.id===id)?.image)??selectedAssetIds.at(-1)!);return}
  // Modified Enter edits the body before the member menu can consume the key.
  // setRangeText replaces precisely the selection and keeps the native caret;
  // updating the controlled draft to that same value preserves it on rerender.
  if(e.currentTarget===textarea.current&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){
   e.preventDefault();if(disabled||guard.current)return
   const area=textarea.current!;area.setRangeText('\n',area.selectionStart,area.selectionEnd,'end')
   change({instruction:area.value});setPicker(undefined);return
  }
  if(picker){if(e.key==='Escape'){e.preventDefault();closePicker();return}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOption(i=>(i+(e.key==='ArrowDown'?1:-1)+options.length)%Math.max(options.length,1));return}if(e.key==='Enter'&&(!e.shiftKey||e.currentTarget!==textarea.current)){e.preventDefault();if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&options.length)pick(options[Math.min(option,options.length-1)]!.id);return}}
  if(e.currentTarget===textarea.current&&e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();send()}
 }
 const sendLabel=normalMode==='record'?'记录到会议':draft.recipientIds.length===1?`发送给 @${name(draft.recipientIds[0]!)}`:`发送给 @${name(draft.recipientIds[0]!)} 等 ${draft.recipientIds.length} 人`
 const actionVerb=payload.mode==='record'?'记录':'发送'
 const actionTitle=payload.mode==='record'?'保存到会议，不唤醒成员':`发送给 ${draft.recipientIds.map(id=>'@'+name(id)).join('、')}`
 const pickerPanel=picker&&<div ref={pickerMenu} className="rt-chat-picker" style={pickerPosition} role="dialog" aria-label="@选择成员"><div><b>@ 选择成员</b><button style={button} aria-label="关闭选人" onClick={closePicker}>×</button></div><input ref={pickerSearch} aria-label="搜索点名成员" placeholder="搜索成员" style={input} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}} onKeyDown={onKey} value={picker.query} onChange={e=>{setPicker({...picker,query:e.target.value,start:undefined,end:undefined});setOption(0)}}/><div role="listbox" aria-label="会议成员" className="rt-chat-options">{options.map((m,i)=><button key={m.id} role="option" aria-selected={draft.recipientIds.includes(m.id)} className={i===option?'active':''} onClick={()=>pick(m.id)}><span>{m.label}</span><small>{m.id==='__all'?`${members.length}人（不含秘书）`:m.id==='__secretary'?'选择范围后生成':`${members.filter(x=>x.name===m.label).length>1?m.id.slice(-6)+' · ':''}${draft.recipientIds.includes(m.id)?'已选':memberStatus[m.id]?.running?'忙碌':memberStatus[m.id]?.availability?.state==='archived'?'已归档':memberStatus[m.id]?.availability?.state==='deleted'?'已删除':memberStatus[m.id]?.availability?.state==='unknown'?'状态待核对':memberStatus[m.id]?.connected?'就绪':'执行时恢复'}`}</small></button>)}</div>{!options.length&&<p>没有匹配的成员</p>}</div>
 return <section ref={composer} aria-label="主持输入" data-hosting-composer="" className="rt-chat-composer" data-attachment-drop={dragging?'active':'idle'} data-file-drop-enabled={disabled?'false':'true'}>
  <style>{`[data-attachment-drop=active]{outline:2px dashed #2876dc;outline-offset:-3px}.rt-compose-uploads{display:flex;gap:5px;flex-wrap:wrap;min-width:0}[data-round-table-panel][data-file-drag=active] .rt-chat{outline:2px dashed #2876dc;outline-offset:-2px}.rt-compose-uploads article{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px;max-width:100%;font-size:12px}.rt-compose-uploads p{width:100%}`}</style>
  <style>{assetStyles}</style>
  <div className="rt-chat-compose-content">
  {draft.contextTaskId&&<p role="status">正在补充原工作；不改变已经冻结的任务要求。<button style={button} disabled={disabled} onClick={()=>change({contextTaskId:undefined})}>取消工作关联</button></p>}
  {!persistence.available&&<p role="alert">{persistence.reason}。草稿及原发送请求仅本次窗口有效，关闭前请保留内容并核对接收状态。</p>}
  {draft.messageIds.length>0&&<div className="rt-chat-quotes">{draft.messageIds.map(id=>{const m=messages.find(x=>x.id===id);return <div key={id}><span>引用 {m?(m.sender==='user'?'你':name(m.sender)):''} · {m?.text.slice(0,100)??'来源已失效，请移除或重新选择'}</span><button style={button} aria-label={`移除引用 ${id}`} disabled={disabled} onClick={()=>change({messageIds:draft.messageIds.filter(x=>x!==id)})}>×</button></div>})}</div>}
  <div className="rt-chat-chips">{draft.recipientIds.map(id=><button key={id} className="rt-chat-mention" disabled={disabled} aria-label={`移除接收人 ${name(id)}`} onClick={()=>change({recipientIds:draft.recipientIds.filter(x=>x!==id),...(draft.recipientIds.length===1?{intent:'record'}:{})})}>@{name(id)} ×</button>)}</div>
  {draft.intent==='record'&&draft.recipientIds.length>0&&<p role="status">已恢复旧草稿的记录模式。<button style={button} disabled={disabled} onClick={()=>change({intent:'response'})}>改为发送给所选成员</button></p>}
  <div className="rt-native-draft" aria-label="讨论草稿输入区">
  <ComposerAttachments meetingId={meetingId} disabled={disabled} onUploaded={acceptUploaded} onBlockingChange={setAttachmentsBlocked} register={receive=>{uploadReceiver.current=receive}}/>
  {!!selectedAssetIds.length&&<ChatAssetPreview meetingId={meetingId} assets={visibleAssets} assetIds={selectedAssetIds} compact disabled={disabled} onRemove={requestRemoveAsset}/>}
  <textarea ref={textarea} aria-label="主持内容" placeholder="记录想法，或将图片、文档拖入此讨论区…" rows={3} style={input} value={draft.instruction} disabled={disabled} onPaste={e=>{pasted.current=true;const files=Array.from(e.clipboardData.files??[]);if(files.length){e.preventDefault();pasted.current=false;receiveFiles(files);const text=e.clipboardData.getData('text/plain');if(text&&!disabled){const start=e.currentTarget.selectionStart??draft.instruction.length,end=e.currentTarget.selectionEnd??start;change({instruction:draft.instruction.slice(0,start)+text+draft.instruction.slice(end)})}}}} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}} onKeyDown={onKey} onChange={e=>{change({instruction:e.target.value});if(pasted.current){pasted.current=false;setPicker(undefined);return}if(!composing.current){const at=mentionAt(e.target.value,e.target.selectionStart??e.target.value.length);if(at){pickerAnchor.current=e.currentTarget??textarea.current;if(!picker)setPickerPosition({visibility:'hidden'})}setPicker(at);setOption(0)}}}/>
  </div>
  {/@\S*/.test(draft.instruction)&&!picker&&<small className="rt-chat-muted">正文中的 @文字不会自动选人；实际接收人以蓝色标签为准。</small>}
  {rosterChanged&&<div role="alert">成员名单或名称已变化，请核对上方收件人。<button style={button} onClick={()=>setRosterChanged(false)}>已核对当前成员</button></div>}


  {removeAsset&&<section role="alertdialog" aria-label="确认移除资料引用" className="rt-chat-target"><b>移除 {visibleAssets.find(a=>a.id===removeAsset.id)?.name??'这份附件'} 的来源引用？</b><p>附件由以下消息引用带入；确认会一并移除这些来源及由它们带入的其他附件。当前正文、其他独立选择的附件与会议归档原件保留。</p>{removeAsset.sourceIds.map(id=><p key={id}>{messages.find(m=>m.id===id)?.text.slice(0,120)??'历史引用'}</p>)}<button style={button} disabled={disabled} onClick={confirmRemoveAsset}>确认移除资料引用</button><button style={button} onClick={()=>{setRemoveAsset(undefined);textarea.current?.focus()}}>取消移除</button></section>}
  {imageBlocked&&!currentPlan?.imageCapabilities?.length&&<p role="status">正在核对每位接收成员的图片能力；核实前保留整条正文与原图，尚未发送。</p>}
  {currentPlan?.imageCapabilities?.map(cap=><p key={cap.sessionId} role={cap.state==='supported'?'status':'alert'}>{name(cap.sessionId)} · {cap.reason}</p>)}
  {otherDrafts.length>0&&<details><summary>找回其他运行草稿（{otherDrafts.length}）</summary>{hasDraft(draft)&&<p>当前草稿已保存，请先处理当前内容再恢复其他草稿。</p>}{otherDrafts.map(d=><div key={d.scope}><p>{d.scope==='plain'?'流程外草稿':`第${draftRunIds.indexOf(d.scope)+1}次运行草稿`}：{d.saved.instruction.slice(0,100)||'已选资料'}{d.waiting?' · 发送待核实':''}</p><button style={button} disabled={disabled||hasDraft(draft)} onClick={()=>{setDraft(d.saved);if(d.waiting)setPending(d.waiting);setNotice(d.waiting?'已恢复原请求；请核实，不会自动重发。':'已恢复为当前草稿，原草稿备份仍保留；核对接收人与执行范围后再发送。');setPlan(undefined)}}>{d.waiting?'恢复待核实请求':'恢复此草稿'}</button></div>)}</details>}
  </div>
  <div className="rt-chat-compose-bar"><div className="rt-chat-tools"><small>正文 + {draft.messageIds.length} 条引用 + {selectedAssetIds.length} 份附件</small></div>
   <div className="rt-chat-send-actions"><button style={button} disabled={disabled||attachmentsBlocked||imageBlocked} onClick={()=>onCreateTask?.(structuredClone(draft))}>任务卡生成</button><button className="rt-chat-send" data-chat-action={payload.mode} title={actionTitle} disabled={disabled||rosterChanged||!currentPlan||attachmentsBlocked||imageBlocked} onClick={send}>{busy?`正在${actionVerb}…`:checking?'检查内容…':sendLabel}</button></div>
  </div>
  <small className="rt-chat-muted">{normalMode==='record'?'仅记录，不唤醒成员。':'普通讨论消息，不创建工作任务；仅所选成员收到。'} 可将图片或文档直接拖入此讨论区，也可粘贴截图；正文与附件同条提交。Enter {actionVerb} · Ctrl/⌘+Enter 换行（Shift+Enter 也可换行）</small>
  {pickerPanel&&(pickerLayer?createPortal(pickerPanel,pickerLayer):!composer.current?pickerPanel:null)}
  {pending&&!busy&&<div role="alert">上次{pending.input.mode==='queue'?'环节资料暂存':'发送'}结果待核实。{pending.input.mode==='queue'&&'这是旧版已经确认的原暂存请求，只可核对或重试原身份；新的资料补充入口在进程环节内。'}<button style={button} onClick={()=>{void finish(pending)}}>重试原请求（不会重复创建任务）</button></div>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
}


