import {useEffect,useRef,useState} from 'react'
import type {ReleaseDraft} from '../meeting-flow-types.ts'
import type {DiscussionRecord} from '../discussion-types.ts'
import {RevisionPanel} from './RevisionPanel.tsx'
import {PublishPanel} from './PublishPanel.tsx'
import {useScopedOperations} from './use-scoped-operations.ts'
import {revisionChild,reviewState} from '../task-review.ts'
import {uiButton as button} from './ui-state.ts'
/** Execution controls belong to the selected member's meeting work log. */
export function MemberTaskActions({meetingId,memberId,memberName,releases,discussions=[],onChanged,focusTaskId}:{meetingId:string;memberId:string;memberName:string;releases:ReleaseDraft[];discussions?:DiscussionRecord[];onChanged:()=>Promise<void>;focusTaskId?:string}):React.ReactNode{
 const {meetingCall,isCurrent}=useScopedOperations(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState<string>(),[supplement,setSupplement]=useState<string>(),[confirm,setConfirm]=useState<{id:string;owner:string;kind:'task'|'discussion';action:string;body:object;description:string}>()
 const owner=JSON.stringify([meetingId,memberId]),ownerRef=useRef(owner),pending=useRef<{owner:string}|undefined>(undefined);ownerRef.current=owner
 useEffect(()=>{setBusy(false);setError('');setRevision(undefined);setSupplement(undefined);setConfirm(undefined)},[owner])
 const current=()=>isCurrent()&&ownerRef.current===owner
 const tasks=releases.flatMap(r=>r.tasks.filter(t=>t.toSessionId===memberId).map(t=>({r,t}))),ordinary=discussions.flatMap(d=>d.deliveries.filter(delivery=>delivery.toSessionId===memberId).map(delivery=>({d,delivery})))
 const changed=async()=>{if(!current())return;try{await onChanged()}catch{if(current())setError('操作已接受，日志刷新失败，请刷新查看，不要重复执行。')}}
 const action=async(name:string,body:object)=>{if(pending.current?.owner===owner||!current())return false;const operation={owner};pending.current=operation;setBusy(true);setError('');try{await meetingCall(meetingId,name,body);await changed();return true}catch(e){if(current())setError(e instanceof Error?e.message:String(e));return false}finally{if(pending.current===operation)pending.current=undefined;if(current())setBusy(false)}}
 const confirmAction=async()=>{const selected=confirm;if(!selected||selected.owner!==owner||!current())return;if(await action(selected.action,selected.body)&&current())setConfirm(undefined)}
 const target=tasks.find(x=>x.t.taskId===revision)?.t
 return <section aria-label="成员任务操作" style={{display:'flex',flexDirection:'column',gap:8,fontSize:12}}>
  {error&&<p role="alert">{error}</p>}
  {!!ordinary.length&&<section aria-label="普通讨论投递操作" style={{display:'flex',flexDirection:'column',gap:8}}><p>普通讨论只记录本会投递与回复，不创建工作任务，也不需要成果验收。</p>
   {ordinary.slice().reverse().map(({d,delivery})=><details key={d.id} data-member-discussion={d.id} style={{border:'1px solid var(--dsw-alias-border-l2)',borderRadius:8,padding:8}}><summary>{d.instruction.slice(0,35)} · {delivery.status==='queued'?'等待投递':delivery.status==='offline'?'原成员需恢复':delivery.status==='delivering'?'正在投递':delivery.status==='delivered'?'已送达':delivery.status==='uncertain'?'送达待核实':delivery.status==='failed'?'投递失败':'本会等待已结束'}</summary>
    <p style={{whiteSpace:'pre-wrap'}}>{d.instruction}</p>{d.contextTaskId&&<p>关联工作任务的澄清或补充；不会创建新任务或提交正式成果。</p>}<p>本会已收到 {d.replies.filter(reply=>reply.sessionId===memberId).length} 条普通回复。</p>{delivery.error&&<p role="alert">{delivery.error}</p>}
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
     {['offline','failed','uncertain'].includes(delivery.status)&&<button style={button} disabled={busy} onClick={()=>delivery.status==='uncertain'?setConfirm({id:d.id,owner,kind:'discussion',action:'discussion-retry',body:{discussionId:d.id,sessionId:memberId},description:'送达结果尚不明确，请先核对原窗口。重复发送可能产生重复回复；本操作只核实原消息的送达证据，无法核实时保留待核实状态，不盲目重投。'}):void action('discussion-retry',{discussionId:d.id,sessionId:memberId})}>{delivery.status==='uncertain'?'核实原讨论投递':'在会议内重试讨论投递'}</button>}
     {delivery.status!=='cancelled'&&<button style={button} disabled={busy} onClick={()=>setConfirm({id:d.id,owner,kind:'discussion',action:'discussion-close',body:{discussionId:d.id,sessionId:memberId,confirmed:true},description:'仅结束这条普通讨论在本会对该成员的等待，保留已有消息与回复，不取消或停止原窗口工作。其他成员的投递继续，不会把工作任务或环节标为已完成。'})}>结束这条讨论等待</button>}
    </div>
   </details>)}
  </section>}
  {!tasks.length&&<p>这位成员尚无工作任务。普通讨论回复会出现在上方发言记录，不需要任务验收。</p>}
  {tasks.slice().reverse().map(({r,t})=><details key={t.taskId} open={t.taskId===focusTaskId} data-member-task={t.taskId} style={{border:'1px solid var(--dsw-alias-border-l2)',borderRadius:8,padding:8}}><summary>{r.title??r.instruction.slice(0,35)} · {t.status==='completed'?reviewState({releases},t):t.status==='offline'?'恢复或投递需处理':t.status==='queued'?'等待执行':t.status==='in_progress'?'执行中':t.status==='delivered'?'等待成果':t.status==='cancelled'?'已结束':t.status==='failed'?'执行失败':'投递需核实'}</summary>
    <p style={{whiteSpace:'pre-wrap'}}>{r.instruction}</p><p>引用 {r.messageIds.length} 条会议消息，{r.assetIds?.length??0} 份附件；投递 {t.attempts} 次。</p>{t.result&&<p style={{whiteSpace:'pre-wrap'}}>正式成果：{t.result}</p>}{t.error&&<p role="alert">{t.error}</p>}
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
     {t.status==='completed'&&<><button style={button} disabled={busy||t.review==='accepted'||!!revisionChild({releases},t)} onClick={()=>{void action('review-task',{taskId:t.taskId,review:'accepted'})}}>验收通过</button><button style={button} disabled={busy||!!revisionChild({releases},t)} onClick={()=>setRevision(t.taskId)}>要求修改</button></>}
     {['delivered','in_progress','uncertain','failed'].includes(t.status)&&t.attempts>0&&<button style={button} disabled={busy} onClick={()=>setSupplement(t.taskId)}>从原窗口补交成果</button>}
     {['offline','uncertain'].includes(t.status)&&<button style={button} disabled={busy} onClick={()=>t.status==='uncertain'?setConfirm({id:t.taskId,owner,kind:'task',action:'retry-release',body:{taskId:t.taskId,allowDuplicate:true},description:'这次送达结果尚不明确。请先核对原窗口，确认重试可能重复执行。'}):void action('retry-release',{taskId:t.taskId})}>在会议内重试恢复与投递</button>}
     {!['completed','cancelled'].includes(t.status)&&<button style={button} disabled={busy} onClick={()=>setConfirm({id:t.taskId,owner,kind:'task',action:'close-task',body:{taskId:t.taskId,confirmed:true},description:'仅结束本会等待，保留原工作及历史结果；不会把环节标为已完成。'})}>结束本会等待</button>}
    </div>
   </details>)}
  {target&&<RevisionPanel key={target.taskId} meetingId={meetingId} task={target} memberName={memberName} onChanged={changed} onClose={()=>setRevision(undefined)}/>}
  {supplement&&<PublishPanel open={true} onClose={()=>setSupplement(undefined)} meetingId={meetingId} members={[{id:memberId,name:memberName}]} releases={releases} initialTarget={{taskId:supplement,sessionId:memberId}} onChanged={async()=>{await changed();setSupplement(undefined)}}/>}
  {confirm?.owner===owner&&<div role="alertdialog" aria-label={confirm.kind==='discussion'?'确认普通讨论操作':'确认成员任务操作'}><p>{confirm.description}</p><button style={button} disabled={busy} onClick={()=>{void confirmAction()}}>确认</button><button style={button} disabled={busy} onClick={()=>setConfirm(undefined)}>取消</button></div>}
 </section>
}
