import {useEffect,useRef,useState} from 'react'
import type {ReleaseTask} from '../meeting-flow-types.ts'
import {scopedLocal,localScopeId,meetingCall,readLocal,writeLocal,useLocalPersistence,uiButton as button,uiInput as input} from './ui-state.ts'
interface RevisionPreview {fingerprint:string;ready:boolean;missing:string[];instruction:string;originalResult:string;recipientId:string;messageIds:string[];assetIds:string[]}
/** Shared by discussion, task and workflow. Opening/editing/previewing never sends. */
export function RevisionPanel({meetingId,task,memberName,onChanged,onClose}:{meetingId:string;task:ReleaseTask;memberName:string;onChanged:()=>Promise<void>;onClose:()=>void}):React.ReactNode{
 const {readLocal,writeLocal,meetingCall}=scopedLocal(useRef(localScopeId()).current)
 const key=`revision.${meetingId}.${task.taskId}`
 const persistence=useLocalPersistence()
 const [note,setNote]=useState(()=>readLocal(key,task.reviewNote??'')),[preview,setPreview]=useState<RevisionPreview>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [pending,setPending]=useState<{taskId:string;note:string;fingerprint:string;requestId:string;confirmed:true}|undefined>(()=>readLocal(key+'.pending',undefined));const guard=useRef(false)
 useEffect(()=>{writeLocal(key,note)},[note,key]);useEffect(()=>{writeLocal(key+'.pending',pending??null)},[pending,key])
 const action=async(fn:()=>Promise<void>)=>{if(guard.current)return;guard.current=true;setBusy(true);setError('');try{await fn()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{guard.current=false;setBusy(false)}}
 const save=async()=>{await meetingCall(meetingId,'review-task',{taskId:task.taskId,review:'changes_requested',note});await onChanged()}
 const finish=async(request:NonNullable<typeof pending>)=>{
  setPending(request);writeLocal(key+'.pending',request)
  try{await meetingCall(meetingId,'revision-start',request)}catch(error){
   const rejection=error as {status?:number;requestState?:string;message?:string}
   // Legacy servers returned this exact pre-commit fingerprint rejection as 400.
   // Other 400/5xx/connection errors must not be mistaken for proof of non-delivery.
   if(rejection.requestState==='rejected'&&[400,409,422].includes(rejection.status??0)||rejection.status===400&&rejection.message==='任务或输入已变化，请重新预览'){
    setPending(undefined);writeLocal(key+'.pending',null);setPreview(undefined);setNotice('本次发送已被明确拒绝，未创建修改任务。意见已保留，请重新预览。')
   }
   throw error
  }
  setPending(undefined);writeLocal(key+'.pending',null);writeLocal(key,'');await onChanged();onClose()
 }
 return <section role="region" aria-label="修改意见与预览" style={{border:'2px solid var(--dsw-alias-border-l2)',padding:12,borderRadius:10,display:'flex',flexDirection:'column',gap:9,minWidth:0}}>
  {!persistence.available&&<p role="alert">{persistence.reason}。未保存到会议的意见与发送请求仅本次窗口有效；关闭前请复制意见并核对原请求。</p>}
  <strong>要求修改 · {memberName}</strong><p style={{margin:0}}>原结果保留。填写意见后预览，只有“确认发送修改任务”才通知这位成员；不会自动唤醒其他人。</p>
  <details><summary>核对原结果</summary><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{task.result}</p></details>
  <textarea aria-label="修改意见" style={input} rows={4} value={note} disabled={busy||!!pending} placeholder="指出需要改哪里、保留什么，以及完成标准" onChange={e=>{setNote(e.target.value);setPreview(undefined);setNotice('')}}/>
  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={button} disabled={busy||!!pending||!note.trim()} onClick={()=>{void action(async()=>{await save();setNotice('修改意见已保存，尚未发送。')})}}>保存修改意见</button><button style={button} disabled={busy||!!pending||!note.trim()} onClick={()=>{void action(async()=>{await save();const v=await meetingCall(meetingId,'revision-preview',{taskId:task.taskId,note});setPreview(v.plan)})}}>预览修改任务</button><button style={button} disabled={busy} onClick={onClose}>稍后处理（保留草稿）</button></div>
  {preview&&<div role="region" aria-label="修改任务发送确认"><b>将仅发送给 {memberName}</b><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.instruction}</p><p>附带 {preview.messageIds.length} 条已选消息／原结果、{preview.assetIds.length} 份附件；原任务关联保留。</p>{!preview.ready&&<ul>{preview.missing.map(x=><li key={x}>{x}</li>)}</ul>}<button style={button} disabled={busy||!preview.ready||!!pending} onClick={()=>{void action(()=>finish({taskId:task.taskId,note,fingerprint:preview.fingerprint,requestId:crypto.randomUUID(),confirmed:true}))}}>确认发送修改任务</button><button style={button} disabled={busy} onClick={()=>setPreview(undefined)}>取消修改预览</button></div>}
  {pending&&!busy&&<p role="alert">发送结果待核实，先核对任务记录。<button style={button} onClick={()=>{void action(()=>finish(pending))}}>重试同一次修改发送</button></p>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>
}
