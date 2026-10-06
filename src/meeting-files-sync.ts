import type {Context} from '@deepseek-ai/cordis'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {mutateMeeting,stateRoot,type Meeting} from './meetings.ts'
import type {MeetingAsset,ResultSource} from './meeting-flow-types.ts'
import type {MinutesRecord} from './minutes-types.ts'
import {prepareMeetingFolder,writeMeetingDocument,attachMeetingDocument,syncMeetingFolderIndex,meetingFolderSnapshot,readMeetingDocument} from './meeting-folder.ts'
import {hashOwnedFile} from './meeting-file-io.ts'
/** All sync helpers are filesystem-only and safe inside one caller-owned meeting mutation. */
export async function syncMeetingAssetDocument(m:Meeting,asset:MeetingAsset,bytes:Uint8Array):Promise<Meeting>{
 if(!m.meetingFolder)return m
 if(bytes.length!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('材料原件SHA或长度不匹配')
 const ref=await writeMeetingDocument(m,{id:asset.id,kind:'asset',version:asset.version,name:asset.name,bytes,mimeType:asset.mimeType,metadata:{assetId:asset.id,sourceCreatedAt:asset.createdAt}})
 const next=attachMeetingDocument(m,ref);await syncMeetingFolderIndex(next);return next
}
/** Stream-only archive copy; the incoming path is service-generated under DSH_HOME, never an HTTP path. */
export async function syncMeetingAssetFile(m:Meeting,asset:MeetingAsset,path:string):Promise<Meeting>{
 if(!m.meetingFolder)return m
 const checked=await hashOwnedFile(stateRoot(),path);if(checked.size!==asset.bytes||checked.sha256!==asset.sha256)throw Error('原件SHA或长度不匹配')
 const ref=await writeMeetingDocument(m,{id:asset.id,kind:'asset',version:asset.version,name:asset.name,fromPath:path,mimeType:asset.mimeType,contentKind:asset.contentKind,referenceOnly:asset.referenceOnly,metadata:{assetId:asset.id,sourceCreatedAt:asset.createdAt}})
 const next=attachMeetingDocument(m,ref);await syncMeetingFolderIndex(next);return next
}
/** Backfill only ledger-approved assets, never discover or approve workspace files. No nested meeting lock. */
export async function syncApprovedMeetingAssets(current:Meeting):Promise<Meeting>{
 if(!current.meetingFolder)return current
 let m=current
 for(const asset of m.assets??[]){
  if(!/^asset-[a-f0-9]{64}$/.test(asset.id))throw Error('历史材料编号非法')
  const existing=m.meetingFolder!.files.find(ref=>ref.kind==='asset'&&ref.id===asset.id&&ref.version===asset.version)
  if(existing){await readApprovedMeetingAsset(m,asset.id);continue}
  m=await syncMeetingAssetFile(m,asset,join(stateRoot(),m.meetingId,'assets',asset.id))
 }
 return m
}
export interface MeetingResultDocument {taskId:string;title:string;text:string;sessionId:string;source?:ResultSource;attemptId?:string;historicalImport?:boolean}
export async function syncMeetingResultDocument(m:Meeting,result:MeetingResultDocument):Promise<Meeting>{
 if(!m.meetingFolder)return m
 const id=result.attemptId?`${result.taskId}-${result.attemptId}`:result.taskId
 const text=`# ${result.title}\n\n任务：${result.taskId}\n提交成员：${m.memberNames?.[result.sessionId]??'参会成员'}\n来源：${result.source?.kind==='manual'?'主持人从成员原回复明确选入':'成员正式提交'}${result.source?.seq===undefined?'':`\n原回复序号：${result.source.seq}`}\n\n${result.text}\n`
 const ref=await writeMeetingDocument(m,{id,kind:'result',version:1,name:result.title+'.md',text,metadata:{taskId:result.taskId,sessionId:result.sessionId,source:result.source?.kind??'agent',...(result.source?.digest?{sourceDigest:result.source.digest}:{}),...(result.attemptId?{attemptId:result.attemptId}:{}),...(result.historicalImport?{historicalImport:true}:{})}})
 const next=attachMeetingDocument(m,ref);await syncMeetingFolderIndex(next);return next
}
export async function syncMeetingMinutesDocument(m:Meeting,record:MinutesRecord):Promise<Meeting>{
 if(!m.meetingFolder)return m
 const text=`# ${m.title} · 会议纪要\n\n生成时间：${new Date(record.generatedAt).toISOString()}\n范围：${record.scope}\n来源：${record.source??'历史记录'}\n\n## 摘要\n${record.summary}\n\n## 关键决策\n${record.keyDecisions.join('\n')||'无'}\n\n## 任务进展\n${record.taskProgress.join('\n')||'无'}\n\n## 未决事项\n${record.openItems.join('\n')||'无'}\n`
 const ref=await writeMeetingDocument(m,{id:record.id,kind:'minutes',version:1,name:`纪要-${record.id}.md`,text,metadata:{minutesId:record.id,generatedAt:record.generatedAt,cutoff:record.cutoff??record.generatedAt,source:record.source??'historical'}})
 const next=attachMeetingDocument(m,ref);await syncMeetingFolderIndex(next);return next
}
/** Verified filesystem evidence injected into a tool-disabled secretary. It never grants write access. */
export async function approvedMeetingFileSources(m:Meeting,cutoff=Date.now(),selection?:{assetIds?:string[];taskIds?:string[]}){
 if(!m.meetingFolder)return undefined
 const snapshot=await meetingFolderSnapshot(m);if(snapshot.integrity!=='ok')throw Error(`会议文件目录或索引无法核验：${snapshot.errors.join('；')}`)
 const selected=snapshot.files.filter(ref=>Number(ref.metadata?.sourceCreatedAt??ref.metadata?.generatedAt??ref.createdAt)<=cutoff&&ref.kind!=='minutes'&&(!selection||(ref.kind==='asset'?(!selection.assetIds||selection.assetIds.includes(String(ref.metadata?.assetId??ref.id))):!selection.taskIds||selection.taskIds.includes(String(ref.metadata?.taskId??ref.id)))))
 const invalid=selected.find(f=>f.status!=='ok');if(invalid)throw Error(`已批准文件 ${invalid.name} ${invalid.error??invalid.status}；未调用秘书模型`)
 const approved=selected.filter((ref):ref is Extract<typeof ref,{status:'ok'}>=>ref.status==='ok')
 return {path:snapshot.path,instructionsPath:snapshot.instructionsPath,instructionsText:snapshot.instructionsText,readRule:'插件已读取并核验以下精确批准版本，只读注入；秘书禁工具，不宣称自行读取路径或仅凭文件名识图',files:approved.map(({fileId,id,kind,version,name,relativePath,sha256,mimeType,metadata,text,referenceOnly,contentKind})=>({fileId,id,kind,version,name,relativePath,sha256,mimeType,metadata,referenceOnly,contentKind,...(text!==undefined&&!referenceOnly?{text}:{evidence:referenceOnly||contentKind==='file'?'完整原件引用已核验；内容未解析，不自动解压，不把二进制或base64注入模型，不能从名称或路径推断内容。':'原件已核验；当前秘书输入没有图片像素或解码内容，不可从名称或路径推断图片事实'})}))}
}
/** Explicit old-meeting adoption; filesystem copies preserve existing history and never publish/execute. */
export async function connectExistingMeetingFiles(ctx:Context,meetingId:string,confirmed:boolean):Promise<Meeting>{
 if(confirmed!==true)throw Error('已有会议接入工作目录必须明确确认；不会执行旧任务')
 return mutateMeeting(stateRoot(),meetingId,async current=>{
  if(current.meetingFolder){const synced=await syncApprovedMeetingAssets(current);await approvedMeetingFileSources(synced);return synced}
  let m:Meeting={...current,meetingFolder:await prepareMeetingFolder(ctx,current)}
  m=await syncApprovedMeetingAssets(m)
  for(const r of m.releases??[]){if(r.status==='draft')continue;const title=r.title??'历史任务';const ref=await writeMeetingDocument(m,{id:r.id,kind:'task',version:r.version,name:title+'.md',text:`# ${title}\n\n此为历史已发布要求的只读接入，不新授权、不重投。\n\n${r.instruction}\n`,metadata:{releaseId:r.id,historicalImport:true}});m=attachMeetingDocument(m,ref);await syncMeetingFolderIndex(m);for(const t of r.tasks)if(t.status==='completed'&&t.result!==undefined)m=await syncMeetingResultDocument(m,{taskId:t.taskId,title,text:t.result,sessionId:t.toSessionId,source:t.resultSource,historicalImport:true})}
  for(const event of m.events)if(event.kind==='task'&&event.status==='completed'&&event.result!==undefined)m=await syncMeetingResultDocument(m,{taskId:event.taskId,title:event.title,text:event.result,sessionId:event.toSessionId,historicalImport:true})
  for(const record of m.minutes??[])m=await syncMeetingMinutesDocument(m,record)
  return m
 })
}
/** Calling UI/CLI must have obtained explicit confirmation before invoking this adapter. */
export const connectMeetingFolder=(ctx:Context,meetingId:string)=>connectExistingMeetingFiles(ctx,meetingId,true)
/** Precise existing reference read, used by routing or generation input without arbitrary paths. */
export async function readApprovedMeetingAsset(m:Meeting,assetId:string){const asset=m.assets?.find(a=>a.id===assetId),ref=m.meetingFolder?.files.find(f=>f.kind==='asset'&&f.id===assetId&&f.version===asset?.version);if(!asset||!ref)throw Error('材料未接入本会已批准文件');const doc=await readMeetingDocument(m,ref.fileId);if(doc.ref.sha256!==asset.sha256||doc.ref.size!==asset.bytes)throw Error('材料与批准文件版本不匹配');return doc}
