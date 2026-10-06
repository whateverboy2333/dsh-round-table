import {workflowSchemaSupported} from './workflow-types.ts'
import {inboxHasPending,sessionHistory} from './host-runtime.ts'
import {revisionChild} from './task-review.ts'
import {meetingTaskCounts} from './meeting-counts.ts'
/** Deterministic user operations, projections and owned meeting resources. */
import {createHash,randomUUID} from 'node:crypto'
import {mkdir,readFile,open,lstat} from 'node:fs/promises'
import {syncMeetingAssetDocument,readApprovedMeetingAsset} from './meeting-files-sync.ts'
import {projectFileAssetLocation,reserveMeetingAssetVersion} from './meeting-file-upload.ts'
import {hashOwnedFile} from './meeting-file-io.ts'
import {syncMeetingFolderInstructions} from './meeting-folder.ts'
import {join} from 'node:path'
import type {Context} from '@deepseek-ai/cordis'
import {SessionId,type Session} from '@deepseek-ai/dsh-session'
import {createUserMessage} from '@deepseek-ai/dsh-llm/message'
import {mutateMeeting,requireActiveMeeting,stateRoot,listMeetings,type Meeting} from './meetings.ts'
import {withMeetingActivity} from './meeting-activity.ts'
import {checkedMeetingDirectory} from './meeting-management.ts'
import {meetingMessageStream,findReleaseTask} from './meeting-flow.ts'
import type {MeetingAsset} from './meeting-flow-types.ts'
import {cancelMinutes} from './minutes.ts'
import {workflowBudget} from './workflow-budget.ts'
import {inspectMember} from './member-session.ts'

export const unfinished=(status:string)=>!['completed','failed','cancelled'].includes(status)
export function activityTime(m:Meeting):number{return Math.max(m.createdAt,...m.events.map(e=>e.time),...(m.releases??[]).flatMap(r=>[r.createdAt,...r.tasks.map(t=>t.updatedAt)]))}
export function taskCounts(m:Meeting){return meetingTaskCounts(m)}
export function liveStatus(ctx:Context,m:Meeting,all:Meeting[]){return Object.fromEntries(m.memberSessionIds.map(id=>{
  const agent=ctx.agents.get(SessionId(id))
  const blockers=all.filter(x=>!x.deletion&&!x.archivedAt&&x.memberSessionIds.includes(id)).flatMap(x=>(x.releases??[]).flatMap(r=>r.tasks.filter(t=>t.toSessionId===id&&['delivering','delivered','in_progress','uncertain'].includes(t.status)).map(t=>({meetingId:x.meetingId,title:x.title,taskId:t.taskId,instruction:r.title??r.instruction.slice(0,60)}))))
  return [id,{connected:!!agent,running:agent?.status==='running',pending:(agent?inboxHasPending(agent.inbox):false),blockers}]
}))}
/** Async authority enriches the legacy live projection without restoring or waking any member. */
export async function liveStatusAsync(ctx:Context,m:Meeting,all:Meeting[]){
 const current=liveStatus(ctx,m,all)
 return Object.fromEntries(await Promise.all(m.memberSessionIds.map(async id=>[id,{...current[id],availability:await inspectMember(ctx,id)}])))
}
export async function manageMeeting(meetingId:string,action:string,body:Record<string,unknown>):Promise<Meeting>{
  const updated=await mutateMeeting(stateRoot(),meetingId,async m=>{
    if(m.archivedAt&&!['archive','pin'].includes(action))throw new Error('会议已归档，请先恢复')
    if(action==='pin'){
      if(typeof body.pinned!=='boolean')throw new Error('请明确设置或取消置顶')
      return {...m,pinnedAt:body.pinned?(m.pinnedAt??Date.now()):undefined}
    }
    if(action==='close-task'){
      if(body.confirmed!==true)throw new Error('请确认结束等待；不会停止原窗口')
      const found=findReleaseTask(m,String(body.taskId));if(!found)throw new Error('任务不存在')
      if(['completed','cancelled'].includes(found.task.status))return m
      return {...m,releases:m.releases!.map(r=>({...r,tasks:r.tasks.map(t=>t.taskId===body.taskId?{...t,status:'cancelled',closedAt:Date.now(),updatedAt:Date.now(),closedReason:String(body.reason??'主持人结束等待；未停止原窗口')}:t)}))}
    }
    if(action==='review-task'){
      if(body.review!=='accepted'&&body.review!=='changes_requested')throw new Error('请选择验收结果')
      const found=findReleaseTask(m,String(body.taskId));if(found?.task.status!=='completed')throw new Error('只有已提交结果的任务可验收')
      if(revisionChild(m,found.task))throw new Error('已有修改任务，请验收最新修改结果；原结果保留为历史')
      const review=body.review as 'accepted'|'changes_requested',note=String(body.note??'');if(found.task.review===review&&(found.task.reviewNote??'')===note)return m
      const time=Date.now(),entry={id:randomUUID(),time,review,note}
      return {...m,releases:m.releases!.map(r=>({...r,tasks:r.tasks.map(t=>t.taskId===body.taskId?{...t,review,reviewNote:note,reviewHistory:[...(t.reviewHistory??[]),entry],updatedAt:time}:t)}))}
    }
    if(action==='archive'){
      if(typeof body.archived!=='boolean')throw new Error('请明确归档或恢复状态')
      if(body.archived===true&&body.confirmed!==true)throw new Error('归档会结束未完成的会议等待，请确认；原窗口继续保留')
      if(body.archived===true&&m.archivedAt)return m
      if(body.archived===true)for(const r of m.workflow?.runs??[])if(r.status==='active'){
        r.status='stopped';r.paused=true;r.events.push({id:randomUUID(),time:Date.now(),action:'archive',details:'会议归档，结束本流程等待；原成员会话保留'})
        for(const a of r.activations)if(a.minutesStatus==='reserved'||a.minutesStatus==='running')a.minutesStatus='cancelled'
      }
      return {...m,archivedAt:body.archived===true?Date.now():undefined,releasePaused:true,discussions:body.archived===true?m.discussions?.map(d=>({...d,deliveries:d.deliveries.map(v=>v.status!=='cancelled'?{...v,status:'cancelled',updatedAt:Date.now(),error:'会议已归档；结束本会等待，不停止原窗口'}:v)})):m.discussions,releases:body.archived===true?m.releases?.map(r=>({...r,tasks:r.tasks.map(t=>unfinished(t.status)?{...t,status:'cancelled',closedAt:Date.now(),updatedAt:Date.now(),error:'会议已归档；未停止原窗口'}:t)})):m.releases}
    }
    if(action==='review-minutes'){
      if(body.confirmed!==true)throw Error('请明确确认已经核对原始任务与纪要内容')
      const record=m.minutes?.find(n=>n.id===body.minutesId);if(!record)throw Error('纪要不存在')
      if(record.integrity?.warnings.length&&body.acknowledgeConflicts!==true)throw Error('纪要仍有数量或状态冲突；请明确确认已知冲突，分享时将附带冲突说明')
      if(record.integrity)record.integrity={...record.integrity,reviewedAt:Date.now(),acknowledgedConflicts:body.acknowledgeConflicts===true};return m
    }
    if(action==='minutes-source'){
      if(body.source!=='formal'&&body.source!=='session')throw new Error('纪要来源非法')
      if(body.source==='session'&&body.confirmed!==true)throw new Error('原会话可能包含参会期间私聊，请确认读取范围')
      return {...m,minutesSource:body.source}
    }
    if(action==='delete-draft'){
      const draft=m.releases?.find(r=>r.id===body.id);if(draft?.status!=='draft')throw new Error('只可删除尚未放行的资料包')
      return {...m,releases:m.releases!.filter(r=>r.id!==body.id)}
    }
    if(action==='save-template'){
      const draft=m.releases?.find(r=>r.id===body.id);if(!draft)throw new Error('资料包不存在')
      const title=String(body.title??draft.title??draft.instruction.slice(0,30)).trim();if(!title)throw new Error('模板名称不能为空')
      const id=String(body.templateId??randomUUID())
      return {...m,templates:[...(m.templates??[]).filter(t=>t.id!==id),{id,title,instruction:draft.instruction,recipientIds:draft.recipientIds}]}
    }
    if(action==='delete-template')return {...m,templates:m.templates?.filter(t=>t.id!==body.id)}
    if(action==='member-names'){
      const incoming=body.names as Record<string,unknown>|undefined
      const names={...m.memberNames};let changed=false;for(const id of m.memberSessionIds)if(typeof incoming?.[id]==='string'){const name=String(incoming[id]).slice(0,160);if(names[id]!==name){names[id]=name;changed=true}}
      return changed?syncMeetingFolderInstructions({...m,memberNames:names}):m
    }
    throw new Error('未知会议操作')
  })
  if(action==='archive'&&body.archived===true)await cancelMinutes(meetingId)
  return updated
}
export async function addMeetingAsset(ctx:Context,meetingId:string,body:Record<string,unknown>):Promise<MeetingAsset>{
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>160||typeof body.data!=='string'||body.data.length>2800000)throw new Error('附件需有名称且不超过2MB')
  const bytes=Buffer.from(body.data,'base64');if(!bytes.length||bytes.length>2*1024*1024||bytes.toString('base64')!==body.data)throw new Error('附件编码或大小非法')
  const name=body.name.replace(/[\\/]/g,'_'),mime=String(body.mimeType??'text/plain')
  const isImage=['image/png','image/jpeg','image/webp'].includes(mime)
  const extension=name.split('.').at(-1)?.toLowerCase()??''
  if(!isImage&&!['txt','md','json','csv','ts','tsx','js','jsx','py','diff','patch','yaml','yml','log','html','css','xml','sql'].includes(extension))throw new Error('支持文本/代码/补丁和PNG、JPEG、WebP；其他格式请先导出文本')
  const text=isImage?undefined:new TextDecoder('utf-8',{fatal:true}).decode(bytes)
  if(text!==undefined&&text.length>100000)throw new Error('文本附件不超过10万字符，请分段')
  return withMeetingActivity(stateRoot(),meetingId,async()=>{
    const current=await requireActiveMeeting(stateRoot(),meetingId)
    const dir=await checkedMeetingDirectory(stateRoot(),meetingId);if(!dir)throw new Error('会议不存在')
    const hash=createHash('sha256').update(bytes).digest('hex'),legacyId=`asset-${hash}`
    // A content hash identifies bytes, not the user's named document. Keep old
    // identities for exact legacy retries without swallowing another name/type.
    const legacy=current.assets?.find(a=>a.id===legacyId&&a.name===name&&a.mimeType===mime)
    if(legacy&&(legacy.sha256!==hash||legacy.bytes!==bytes.length))throw Error('历史材料编号与原件内容不同，未覆盖')
    const id=legacy?.id??`asset-${createHash('sha256').update(JSON.stringify(['named-asset',name,mime,hash])).digest('hex')}`
    const image=isImage?await (ctx.get('attachments') as {saveImage(v:unknown):Promise<unknown>}|undefined)?.saveImage({data:bytes,mediaType:mime,name}):undefined
    if(isImage&&!image)throw new Error('宿主图片附件服务不可用，未保存附件')
    await mkdir(join(dir,'assets'),{recursive:true});const originalPath=join(dir,'assets',id)
    let handle;try{handle=await open(originalPath,'wx',0o600);await handle.writeFile(bytes);await handle.sync()}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;const stat=await lstat(originalPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1)throw Error('材料原件文件身份非法');const original=await readFile(originalPath);if(createHash('sha256').update(original).digest('hex')!==hash)throw Error('材料原件已改动，不覆盖')}finally{await handle?.close()}
    let asset!:MeetingAsset
    const reserved=await reserveMeetingAssetVersion(meetingId,{id,name,mimeType:mime,bytes:bytes.length,sha256:hash})
    await mutateMeeting(stateRoot(),meetingId,async m=>{
      const old=m.assets?.find(a=>a.id===id);if(old){if(old.name!==name||old.mimeType!==mime||old.sha256!==hash||old.bytes!==bytes.length)throw Error('材料编号已有不同名称、类型或原件，不覆盖');asset=old;return syncMeetingAssetDocument(m,old,bytes)}
      asset={...reserved,...(text!==undefined?{text}:{}),...(image?{image}:{})}
      const synced=await syncMeetingAssetDocument(m,asset,bytes)
      return {...synced,assets:[...(synced.assets??[]),asset],events:body.record===false?synced.events:[...synced.events,{id:`message-${id}`,kind:'message',time:asset.createdAt,by:'user',text:`附件：${name} · v${asset.version} · SHA256 ${hash}`,assetIds:[id]}]}
    });return asset
  })
}
export async function readMeetingAsset(meetingId:string,id:string){
  const m=await requireActiveMeeting(stateRoot(),meetingId),a=m.assets?.find(a=>a.id===id);if(!a)throw new Error('附件不存在')
  if(m.meetingFolder){const doc=await readApprovedMeetingAsset(m,id);return doc.bytes?{...a,data:doc.bytes.toString('base64')}:{...projectFileAssetLocation(m,a),referenceOnly:true,contentNote:'完整原件已核验，内容未解析；不自动解压或将二进制注入模型。'}}
  const dir=await checkedMeetingDirectory(stateRoot(),meetingId);if(!dir||!/^asset-[a-f0-9]{64}$/.test(id))throw new Error('附件路径非法')
  if(a.referenceOnly||a.contentKind==='file'||a.bytes>3*1024*1024){const checked=await hashOwnedFile(stateRoot(),join(dir,'assets',id));if(checked.sha256!==a.sha256||checked.size!==a.bytes)throw Error('原件校验失败：内容改动或损坏');return {...projectFileAssetLocation(m,a),referenceOnly:true,contentNote:'仅保存在本会内部资料档案的完整原件，内容未解析；尚未接入会议工作区目录。'}}
  const data=await readFile(join(dir,'assets',id));if(createHash('sha256').update(data).digest('hex')!==a.sha256)throw new Error('附件校验失败')
  return {...a,data:data.toString('base64')}
}
/** Narrow recovery for an unsupported image submitted by this plugin; preserves immutable audit history. */
export async function repairUnsupportedImage(ctx:Context,meetingId:string,taskId:string,confirmed:boolean){
  if(!confirmed)throw new Error('需要确认移除本任务失败的图片输入；不会删除原会话记录')
  return withMeetingActivity(stateRoot(),meetingId,async()=>{
    const m=await requireActiveMeeting(stateRoot(),meetingId),found=findReleaseTask(m,taskId)
    if(!found?.task.hostMessageId)throw new Error('没有可定位的本会投递记录')
    const agent=ctx.agents.get(SessionId(found.task.toSessionId));if(!agent||agent.status==='running'||inboxHasPending(agent.inbox))throw new Error('请先打开原窗口，并等待其空闲')
    const events=sessionHistory(agent.session),lastEnd=[...events].reverse().find(e=>e.type==='turn/end')
    if(lastEnd?.type!=='turn/end'||lastEnd.data.reason.kind!=='error'||lastEnd.data.reason.error.code!=='UNSUPPORTED_CONTENT')throw new Error('只支持修复已证实的图片输入不兼容失败')
    const receipt=found.task.hostMessageId
    const original=events.find(e=>e.type==='user/message'&&(String(e.data.id)===receipt||('rpcId' in e.data.source&&e.data.source.rpcId===receipt)))
    if(!original||original.type!=='user/message'||!agent.session.surface.nodes.includes(original.seq)||!original.data.content.some(b=>b.type==='image'))throw new Error('原图片输入已不在当前上下文，或不属于该任务')
    if(events.some(e=>e.seq>original.seq&&e.type==='user/message'&&e.data.source.kind==='user'))throw new Error('之后已有新的用户输入，请在原窗口人工处理')
    const replacement=createUserMessage({content:[...original.data.content.filter(b=>b.type!=='image'),{type:'text',text:'本轮会议图片因模型不支持而未处理；主持人已移除本任务的图片输入，保留文字和原始审计记录。'}],source:{kind:'round-table',plugin:'dsh-round-table'}})
    agent.session.append('user/message',replacement,{surfaceOp:{op:'replace',startSeq:original.seq,endSeq:original.seq},sourceEventSeqs:[original.seq]})
    const sessions=ctx.get('sessions') as {flush(session:Session):Promise<boolean>};await sessions.flush(agent.session)
    await manageMeeting(meetingId,'close-task',{taskId,confirmed:true,reason:'图片适配器不兼容；已移除本任务图片输入，保留原窗口和审计记录'})
    return {replacedSeq:original.seq,replacementSeq:agent.session.seq-1}
  })
}
export function exportMeeting(m:Meeting):string{
  const who=(id:string)=>m.memberNames?.[id]??(id==='user'?'主持人':id==='secretary'?'秘书':id)
  const body=`# ${m.title}\n\n${m.description??''}\n\n## 会议消息\n\n`+meetingMessageStream(m).map((x,i)=>`### #${i+1} ${who(x.sender)} · ${new Date(x.time).toISOString()}\n\n${x.text}\n\n来源：${x.source?.kind??x.kind}${x.source?.seq!==undefined?` · 原回复#${x.source.seq}`:''}\n消息ID：${x.id}\n`).join('\n')+'\n## 任务与验收\n\n'+(m.releases??[]).flatMap(r=>r.tasks.map(t=>`- ${r.title??r.instruction} / ${who(t.toSessionId)}：${t.status}；验收：${t.review??'尚未验收'}\n  ${t.result??t.error??''}\n  任务ID：${t.taskId}`)).join('\n')
  if(!m.workflow)return body
  if(!workflowSchemaSupported(m.workflow.schemaVersion))return body+`\n\n## 流程记录\n\n流程数据版本 ${m.workflow.schemaVersion}，当前插件无法解释。请使用兼容版本导出详情。\n`
  return body+'\n\n## 流程记录\n\n'+m.workflow.runs.map(r=>{
    const budget=workflowBudget(r),initial=r.definition.limits,grants=r.budgetGrants??[]
    return `### ${r.definition.title} · ${r.id}\n\n状态：${r.status}；定义v${r.definition.revision}；普通投递预留 ${r.workReserved}/${budget.workAttempts}；秘书发起 ${r.minutesStarted}/${budget.minutesStarts}\n\n初始额度：普通投递 ${initial.workAttempts}；秘书生成 ${initial.minutesStarts}\n追加额度：普通投递 ${budget.workAttempts-initial.workAttempts}；秘书生成 ${budget.minutesStarts-initial.minutesStarts}\n累计额度：普通投递 ${budget.workAttempts}；秘书生成 ${budget.minutesStarts}\n\n额度追加记录：\n${grants.length?grants.map(g=>`- ${new Date(g.createdAt).toISOString()} · 请求 ${g.requestId}：普通投递 +${g.work}；秘书生成 +${g.minutes}`).join('\n'):'无追加'}\n\n`+r.activations.map(a=>`- ${a.node.title} · 第${a.round||1}轮／尝试${a.attempt}${a.temporary?' · 临时回应（不推进主流程）':''}${a.skipped?` · 跳过：${a.skipReason??''}`:''}\n  激活：${a.id}；定义v${a.definitionRevision}\n  输入：${a.messageIds.join('、')||'无'}；附件：${a.assetIds.join('、')||'无'}\n  上游执行：${a.sourceActivationIds.join('、')||'无'}\n  ${a.releaseId?`资料包：${a.releaseId}`:a.minutesJobId?`秘书任务：${a.minutesJobId}；纪要：${a.minutesId??'尚未生成'}`:'脚本汇合'}${a.choiceEdgeId?`\n  主持人选择：${r.definition.edges.find(e=>e.id===a.choiceEdgeId)?.label??a.choiceEdgeId}；理由：${a.choiceReason??'未填写'}`:''}`).join('\n')+'\n\n操作记录：\n'+r.events.map(e=>`- ${new Date(e.time).toISOString()} · ${e.action}：${e.details}`).join('\n')
  }).join('\n\n')
}
