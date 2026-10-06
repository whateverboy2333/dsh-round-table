import type {Context} from '@deepseek-ai/cordis'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {createHash,randomUUID} from 'node:crypto'
import {constants} from 'node:fs'
import {open,lstat,mkdir,realpath,link,unlink,rename,readdir} from 'node:fs/promises'
import {basename,dirname,isAbsolute,join,relative,resolve,sep} from 'node:path'
import {readMeeting,mutateMeeting,stateRoot,type Meeting} from './meetings.ts'
import {authenticateMeetingToolActor} from './meeting-tool-auth.ts'
import {hashOwnedFile,copyOwnedFile,openOwnedFile,hashFileHandle} from './meeting-file-io.ts'
import {isMeetingFolder,isMeetingFileRef,type MeetingFolder,type MeetingFileRef,type MeetingFileKind} from './meeting-folder-types.ts'
export type {MeetingFolder,MeetingFileRef,MeetingFileKind} from './meeting-folder-types.ts'
type FolderMeeting=Meeting&{meetingFolder?:MeetingFolder}
export interface MeetingDocumentInput {id:string;kind:MeetingFileKind;version:number;name:string;text?:string;bytes?:Uint8Array;fromPath?:string;mimeType?:string;metadata?:Record<string,string|number|boolean|null>;contentKind?:'file';referenceOnly?:boolean}
const directories={asset:'材料',task:'任务卡',result:'成果',minutes:'纪要'} as const
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
const samePath=(a:string,b:string)=>process.platform==='win32'?resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b)
const safeName=(name:string)=>name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'').slice(0,64)||'未命名'
function within(base:string,path:string){const r=relative(base,path);if(r==='..'||r.startsWith('..'+sep)||isAbsolute(r))throw Error('会议目录路径越界')}
/** Reject directory junctions/symlinks, including an ancestor exchanged after initial creation. */
async function guard(base:string,path:string,mustExist=true){
 if(!isAbsolute(base)||!isAbsolute(path))throw Error('会议目录必须保存绝对路径')
 within(base,path);const root=resolve(base),parts=relative(root,path).split(sep).filter(Boolean)
 for(let cursor=root,i=-1;i<parts.length;i++){
  if(i>=0)cursor=join(cursor,parts[i]!)
  let stat;try{stat=await lstat(cursor)}catch(error){if(!mustExist&&(error as NodeJS.ErrnoException).code==='ENOENT')return;throw error}
  if(stat.isSymbolicLink())throw Error('会议目录含符号链接或重解析链接，拒绝访问')
  const canonical=await realpath(cursor);if(!samePath(canonical,cursor))throw Error('会议目录规范路径改变，拒绝访问')
  if(cursor!==root)within(root,canonical)
 }
}
async function directory(base:string,path:string){await guard(base,dirname(path));try{await mkdir(path)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}await guard(base,path);if(!(await lstat(path)).isDirectory())throw Error('会议目录被文件占用')}
async function readSafe(folder:MeetingFolder,path:string){
 await guard(folder.workspacePath,path);const stat=await lstat(path);if(!stat.isFile()||stat.nlink>1)throw Error('会议文件不是独立普通文件，拒绝读取')
 const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const opened=await fd.stat();if(opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error('会议文件身份在读取时改变');const bytes=await fd.readFile();await guard(folder.workspacePath,path);return bytes}finally{await fd.close()}
}
/** Exclusive immutable commit. A same-name file is verified, never silently replaced. */
async function immutableWrite(folder:MeetingFolder,path:string,bytes:Uint8Array){
 await guard(folder.workspacePath,dirname(path));const tmp=join(dirname(path),`.写入-${randomUUID()}.tmp`),fd=await open(tmp,'wx',0o600)
 try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()}
 try{await guard(folder.workspacePath,dirname(path));try{await link(tmp,path)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}await unlink(tmp);const existing=await readSafe(folder,path);if(hash(existing)!==hash(bytes))throw Error('已批准版本文件内容不同或已外部改动，不覆盖');await syncDirectory(dirname(path))}finally{await unlink(tmp).catch(()=>{})}
}
async function syncDirectory(path:string){let fd;try{fd=await open(path,'r');await fd.sync()}catch(error){if(process.platform!=='win32'||!['EPERM','EACCES','EINVAL','EISDIR'].includes((error as NodeJS.ErrnoException).code??''))throw error}finally{await fd?.close()}}
function getFolder(m:FolderMeeting){if(!m.meetingFolder||!isMeetingFolder(m.meetingFolder)||m.meetingFolder.meetingId!==m.meetingId)throw Error('本会尚未明确接入工作目录或目录记录损坏');return m.meetingFolder}
const identityBytes=(f:MeetingFolder)=>Buffer.from(JSON.stringify({schemaVersion:1,meetingId:f.meetingId,workspaceId:f.workspaceId,workspacePath:f.workspacePath})+'\n')
async function verifyFolder(f:MeetingFolder){
 await guard(f.workspacePath,f.path);within(join(f.workspacePath,'圆桌会议'),f.path)
 if(!basename(f.path).endsWith('-'+hash(f.meetingId).slice(0,16)))throw Error('会议目录稳定身份路径不匹配')
 const identity=await readSafe(f,join(f.path,'.会议身份.json'));if(!identity.equals(identityBytes(f)))throw Error('会议目录身份校验失败')
 if(hash(await readSafe(f,join(f.path,'会议说明.md')))!==(f.initialInstructionsSha256??f.instructionsSha256))throw Error('初建会议说明已外部改动或损坏')
 if(hash(await readSafe(f,instructionsFile(f)))!==f.instructionsSha256)throw Error('当前会议说明已外部改动或损坏')
 for(const version of f.instructionsHistory??[])if(hash(await readSafe(f,join(f.path,...version.relativePath.split('/'))))!==version.sha256)throw Error(`历史会议说明 v${version.version} 已外部改动或损坏`)
}
const instructionsFile=(f:MeetingFolder)=>join(f.path,...(f.instructionsRelativePath??'会议说明.md').split('/'))
const instructionsIndex=(f:MeetingFolder)=>({relativePath:f.instructionsRelativePath??'会议说明.md',version:f.instructionsVersion??1,sha256:f.instructionsSha256,history:f.instructionsHistory??[]})
async function indexFiles(f:MeetingFolder){
 const bytes=await readSafe(f,join(f.path,'文件索引.json'));let value:unknown;try{value=JSON.parse(bytes.toString('utf8'))}catch{throw Error('文件索引损坏')}
 const v=value as {schemaVersion?:unknown;meetingId?:unknown;files?:unknown};if(!v||v.schemaVersion!==1||v.meetingId!==f.meetingId||!Array.isArray(v.files)||!v.files.every(isMeetingFileRef)||new Set(v.files.map(x=>x.fileId)).size!==v.files.length)throw Error('文件索引身份或内容损坏')
 const files=v.files as MeetingFileRef[]
 if(files.some(ref=>ref.fileId!==documentFileId(ref)||ref.relativePath!==documentRelativePath(ref)))throw Error('文件索引编号或路径不符合批准版本规范')
 return files
}
const prefix=(small:MeetingFileRef[],big:MeetingFileRef[])=>small.length<=big.length&&small.every((v,i)=>JSON.stringify(v)===JSON.stringify(big[i]))
const preparationPath=(f:MeetingFolder,fileId:string)=>join(f.path,`.文件准备-${fileId}.json`)
async function preparedRef(f:MeetingFolder,fileId:string):Promise<MeetingFileRef|undefined>{try{const value:unknown=JSON.parse((await readSafe(f,preparationPath(f,fileId))).toString('utf8'));if(!isMeetingFileRef(value)||value.fileId!==fileId||value.fileId!==documentFileId(value)||value.relativePath!==documentRelativePath(value))throw Error('文件准备记录损坏');return value}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error}}
async function verifyPending(f:MeetingFolder,refs:MeetingFileRef[]){for(const ref of refs){const recorded=await preparedRef(f,ref.fileId);if(!recorded||JSON.stringify(recorded)!==JSON.stringify(ref))throw Error('文件索引含非本次持久准备的内容，可能已外部改动');const info=await hashOwnedFile(f.workspacePath,join(f.path,...ref.relativePath.split('/')));if(info.sha256!==ref.sha256||info.size!==ref.size)throw Error('未批准文件准备内容已改动或损坏')}}
async function verifyIndex(f:MeetingFolder){
 const files=await indexFiles(f)
 if(files.length===f.files.length&&prefix(f.files,files))return files
 // The ledger alone authorizes reads. An interrupted preparation may leave the derived index
 // ahead; receipts prove these entries are pending, and never confer approval by themselves.
 if(prefix(f.files,files)){await verifyPending(f,files.slice(f.files.length));return f.files}
 // A durable ledger commit can precede a failed index update. Only append the exact ledger suffix.
 if(prefix(files,f.files))return f.files
 throw Error('文件索引与会议批准账本不同；可能外部改动')
}
async function meeting(value:FolderMeeting|string):Promise<FolderMeeting>{if(typeof value!=='string')return value;const m=await readMeeting(stateRoot(),value);if(!m)throw Error('会议不存在或已删除');return m}
const instruction=(m:FolderMeeting,f:MeetingFolder)=>`# 会议说明\n\n会议：${m.title}\n\n目标：${m.description??''}\n\n会议标识：${m.meetingId}\n工作目录：${f.path}\n\n## 使用规则\n\n此目录为本场会议共享工作材料，成员原会话身份、上下文和原工作区保持。材料、任务卡、成果、纪要分别保存在同名子目录。请通过 meeting_file_index 获取账本批准的文件标识与版本，再使用 meeting_read_file(meetingId,fileId) 读取指定版本；禁止编辑或替换已批准文件及索引。任务卡发布写盘并批准之后才通知执行，生成草稿和普通讨论不等于正式执行；成果以会议提交工具回传，插件保存成果文件并维护状态，成员不直接修改账本。秘书使用插件核验后注入的只读文件快照，不假称无工具秘书能自行读取。缺失、损坏或内容外改时停止并报告，不猜测旧内容。改名不迁移目录；归档和删除均保留工作文件。目录接入不自动重放旧任务或授予新执行权限。\n\n目录初建时的会议名称仅为说明，当前名称和成员名单以会议账本为准。\n`
function currentInstructions(m:FolderMeeting,f:MeetingFolder){const roles=m.memberSessionIds.map((id,index)=>`- ${m.memberNames?.[id]??`参会成员 ${index+1}`}：${m.memberRoles?.[id]??'按明确投递给自己的任务卡执行，普通讨论不代替成果提交'}`).join('\n');return Buffer.from(instruction(m,f)+`\n## 本版成员职责\n\n${roles||'尚无成员；后加入成员以会议账本为准。'}\n\n秘书：整理已核验的会议事实与纪要，不替成员执行或验收。\n\n说明批准版本：${f.instructionsVersion??1}。最新已批准说明路径由文件索引及 meeting_file_index 返回，旧版说明保留，不作为新授权执行依据。\n`)}
const documentFileId=(input:Pick<MeetingDocumentInput,'kind'|'id'|'version'>)=>`${input.kind}-${hash(input.id).slice(0,20)}-v${input.version}`
function documentRelativePath(input:Pick<MeetingDocumentInput,'kind'|'id'|'version'|'name'|'mimeType'>){const extension=basename(input.name).match(/\.[a-z0-9]{1,12}$/i)?.[0]??(input.kind!=='asset'||input.mimeType?.startsWith('text/')?'.md':'.bin');return `${directories[input.kind]}/${safeName(input.name.replace(/\.[a-z0-9]{1,12}$/i,''))}-${hash(input.id).slice(0,20)}-v${input.version}${extension}`}
/** Filesystem only. Safe to call inside the caller's existing meeting mutation; no nested lock. */
export async function prepareMeetingFolder(ctx:Context,m:FolderMeeting):Promise<MeetingFolder>{
 if(m.deletion||m.archivedAt)throw Error('删除或归档会议不能建立新目录')
 if(m.meetingFolder){const f=getFolder(m);await verifyFolder(f);return f}
 if(!m.defaultWorkspaceId)throw Error('请先明确选择本会工作区')
 const registry=ctx.get('workspaceRegistry') as {get(id:string):{id:string;path:string;status():Promise<string>}|undefined}|undefined,w=registry?.get(m.defaultWorkspaceId)
 if(!w||await w.status()!=='ok')throw Error('会议选定工作区不可用')
 if(!isAbsolute(w.path))throw Error('会议工作区路径不是绝对路径')
 const workspacePath=await realpath(w.path);if(!samePath(workspacePath,w.path))throw Error('会议工作区包含链接或规范路径变化，拒绝建立目录')
 await guard(workspacePath,workspacePath)
 const parent=join(workspacePath,'圆桌会议');await directory(workspacePath,parent)
 const path=join(parent,`${safeName(m.title)}-${hash(m.meetingId).slice(0,16)}`);await directory(workspacePath,path)
 const contents=await readdir(path);if(contents.length&&!contents.includes('.会议身份.json'))throw Error('目标目录包含用户文件，拒绝接管或覆盖')
 const f:MeetingFolder={schemaVersion:1,meetingId:m.meetingId,workspaceId:w.id,workspacePath,path,createdAt:Date.now(),instructionsSha256:'',instructionsVersion:1,instructionsRelativePath:'说明版本/会议说明-v1.md',files:[]}
 const instructions=currentInstructions(m,f);f.instructionsSha256=hash(instructions);f.initialInstructionsSha256=f.instructionsSha256;f.instructionsHistory=[{version:1,relativePath:f.instructionsRelativePath!,sha256:f.instructionsSha256}]
 // Identity is checked before touching a reused directory, including a crashed initial creation.
 await immutableWrite(f,join(path,'.会议身份.json'),identityBytes(f))
 for(const name of Object.values(directories))await directory(workspacePath,join(path,name))
 // Existing instructions are immutable; a recovery retry doesn't rewrite user edits.
 await immutableWrite(f,join(path,'会议说明.md'),instructions)
 await directory(workspacePath,join(path,'说明版本'));await immutableWrite(f,instructionsFile(f),instructions)
 const indexPath=join(path,'文件索引.json')
 let existingIndex:Buffer|undefined
 try{existingIndex=await readSafe(f,indexPath)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 if(existingIndex){
  // A failed folder/ledger commit may have already prepared some approved assets.
  // Keep those receipts for the same retry, but leave files unapproved until the caller attaches them.
  const files=await indexFiles(f);await verifyPending(f,files)
  const expected=Buffer.from(JSON.stringify({schemaVersion:1,meetingId:m.meetingId,instructions:instructionsIndex(f),files},null,2)+'\n')
  if(!existingIndex.equals(expected))throw Error('恢复目录的文件索引内容不同或已外部改动，不覆盖')
 }else await immutableWrite(f,indexPath,Buffer.from(JSON.stringify({schemaVersion:1,meetingId:m.meetingId,instructions:instructionsIndex(f),files:[]},null,2)+'\n'))
 return f
}
/** Explicit management changes create a new immutable instruction version; no nested meeting lock. */
export async function syncMeetingFolderInstructions(m:FolderMeeting):Promise<FolderMeeting>{
 if(!m.meetingFolder)return m
 const f=getFolder(m);await verifyFolder(f);await verifyIndex(f)
 if(hash(currentInstructions(m,f))===f.instructionsSha256)return m
 if(m.deletion||m.archivedAt)throw Error('会议删除或归档后不能更新说明')
 const version=(f.instructionsVersion??1)+1,nextFolder:MeetingFolder={...f,instructionsVersion:version,instructionsRelativePath:`说明版本/会议说明-v${version}.md`,initialInstructionsSha256:f.initialInstructionsSha256??f.instructionsSha256}
 const bytes=currentInstructions(m,nextFolder);nextFolder.instructionsSha256=hash(bytes)
 nextFolder.instructionsHistory=[...(f.instructionsHistory??[]),{version,relativePath:nextFolder.instructionsRelativePath!,sha256:nextFolder.instructionsSha256}]
 await directory(f.workspacePath,join(f.path,'说明版本'));await immutableWrite(f,instructionsFile(nextFolder),bytes)
 const next={...m,meetingFolder:nextFolder};await syncMeetingFolderIndex(next);return next
}
/** Call outside a mutation. Existing meetings must explicitly opt in; this never executes/imports history. */
export async function ensureMeetingFolder(ctx:Context,meetingId:string){
 const m=await mutateMeeting(stateRoot(),meetingId,async old=>{
  if(!old.meetingFolder&&!old.creationRequest&&old.assets?.length)throw Error('已有会议资料尚未接入工作目录，请明确确认接入；不会自动迁移旧会')
  const next={...old,meetingFolder:await prepareMeetingFolder(ctx,old)}
  // Filesystem-only synchronization stays within this mutation. Import lazily because
  // the shared sync module also consumes the folder's immutable write primitives.
  const {syncApprovedMeetingAssets}=await import('./meeting-files-sync.ts')
  return syncApprovedMeetingAssets(next)
 });return getFolder(m)
}
export function attachMeetingDocument(m:FolderMeeting,ref:MeetingFileRef):FolderMeeting {
 const f=getFolder(m),existing=f.files.find(x=>x.fileId===ref.fileId)
 if(existing&&JSON.stringify(existing)!==JSON.stringify(ref))throw Error('文件批准记录不同，不覆写')
 return {...m,meetingFolder:{...f,files:existing?f.files:[...f.files,ref]}}
}
/** A presentation index is regenerated from the ledger; it is never an authority to approve files. */
export async function syncMeetingFolderIndex(m:FolderMeeting){
 const f=getFolder(m);await verifyFolder(f);const old=await indexFiles(f)
 if(!prefix(old,f.files)&&!prefix(f.files,old)){
  const current=await readMeeting(stateRoot(),m.meetingId),approved=current?.meetingFolder?.files??[]
  if(!prefix(approved,old)||!prefix(approved,f.files))throw Error('文件索引已外部改动或包含其他未批准文件，拒绝覆盖')
  await verifyPending(f,old.slice(approved.length))
 }
 if(old.length>f.files.length&&prefix(f.files,old)){await verifyPending(f,old.slice(f.files.length));return}
 await replaceIndex(f,f.files)
}
async function replaceIndex(f:MeetingFolder,files:MeetingFileRef[]){
 const path=join(f.path,'文件索引.json'),bytes=Buffer.from(JSON.stringify({schemaVersion:1,meetingId:f.meetingId,instructions:instructionsIndex(f),files},null,2)+'\n')
 await guard(f.workspacePath,path,false)
 try{const st=await lstat(path);if(!st.isFile()||st.nlink>1)throw Error('文件索引不是独立普通文件')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 const tmp=join(f.path,`.索引-${randomUUID()}.tmp`),fd=await open(tmp,'wx',0o600);try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()}
 try{await guard(f.workspacePath,f.path);await rename(tmp,path);await guard(f.workspacePath,path);await syncDirectory(f.path)}finally{await unlink(tmp).catch(()=>{})}
}
async function pureWrite(m:FolderMeeting,input:MeetingDocumentInput):Promise<MeetingFileRef>{
 if(m.deletion||m.archivedAt)throw Error('会议删除或归档后禁止发布新文件')
 const f=getFolder(m);await verifyFolder(f)
 if(typeof input.id!=='string'||!input.id||!directories[input.kind]||!Number.isInteger(input.version)||input.version<1||typeof input.name!=='string'||!input.name||[input.text,input.bytes,input.fromPath].filter(v=>v!==undefined).length!==1||input.text!==undefined&&typeof input.text!=='string'||input.bytes!==undefined&&(!ArrayBuffer.isView(input.bytes)||input.bytes.BYTES_PER_ELEMENT!==1)||input.fromPath!==undefined&&typeof input.fromPath!=='string')throw Error('文件编号、类型、版本或正文非法')
 const bytes=input.fromPath!==undefined?undefined:input.bytes===undefined?Buffer.from(input.text!):Buffer.from(input.bytes),source=input.fromPath!==undefined?await hashOwnedFile(stateRoot(),input.fromPath):{size:bytes!.length,sha256:hash(bytes!)},digest=source.sha256,fileId=documentFileId(input),mimeType=input.mimeType??(input.text!==undefined?'text/plain':undefined),idx=await indexFiles(f)
 if(!prefix(f.files,idx))throw Error('文件索引已外部改动，不覆盖')
 if(idx.length>f.files.length)await verifyPending(f,idx.slice(f.files.length))
 const existing=f.files.find(x=>x.fileId===fileId)??await preparedRef(f,fileId)
 if(existing){if(existing.id!==input.id||existing.sha256!==digest||existing.name!==input.name||existing.mimeType!==mimeType||existing.referenceOnly!==input.referenceOnly||existing.contentKind!==input.contentKind||JSON.stringify(existing.metadata??{})!==JSON.stringify(input.metadata??{}))throw Error('同一批准版本内容或来源不同，拒绝覆盖');const stored=await hashOwnedFile(f.workspacePath,join(f.path,...existing.relativePath.split('/')));if(stored.sha256!==digest||stored.size!==existing.size)throw Error('文件校验失败：已外部改动或损坏');return existing}
 const relativePath=documentRelativePath({...input,mimeType})
 const ref:MeetingFileRef={fileId,id:input.id,kind:input.kind,version:input.version,name:input.name,relativePath,sha256:digest,size:source.size,createdAt:Date.now(),...(mimeType?{mimeType}:{}),...(input.metadata?{metadata:{...input.metadata}}:{}),...(input.referenceOnly!==undefined?{referenceOnly:input.referenceOnly}:{}),...(input.contentKind?{contentKind:input.contentKind}:{})}
 if(!isMeetingFileRef(ref))throw Error('文件元数据非法')
 if(input.fromPath!==undefined)await copyOwnedFile(stateRoot(),input.fromPath,f.workspacePath,join(f.path,...relativePath.split('/')),source);else await immutableWrite(f,join(f.path,...relativePath.split('/')),bytes!);await immutableWrite(f,preparationPath(f,fileId),Buffer.from(JSON.stringify(ref)+'\n'));return ref
}
/** Meeting argument: filesystem-only; caller must attach the returned ref in its existing lock.
 * ID argument: outside-lock convenience, commits approval ledger after the file is durably written.
 */
export async function writeMeetingDocument(value:FolderMeeting|string,input:MeetingDocumentInput){
 if(typeof value!=='string')return pureWrite(value,input)
 let ref:MeetingFileRef|undefined;await mutateMeeting(stateRoot(),value,async m=>{ref=await pureWrite(m,input);const next=attachMeetingDocument(m,ref);await syncMeetingFolderIndex(next);return next});return ref!
}
export async function readMeetingDocument(value:FolderMeeting|string,fileId:string,options:{metadataOnly?:boolean}={}){
 const m=await meeting(value),f=getFolder(m),ref=f.files.find(x=>x.fileId===fileId);if(!ref)throw Error('文件未由本会账本批准，请使用文件标识而非任意路径')
 await verifyFolder(f);await verifyIndex(f)
 if(options.metadataOnly||ref.referenceOnly||ref.contentKind==='file'||ref.size>3*1024*1024){let info;try{info=await hashOwnedFile(f.workspacePath,join(f.path,...ref.relativePath.split('/')))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw Error('已批准会议文件缺失');throw e}if(info.sha256!==ref.sha256||info.size!==ref.size)throw Error('已批准会议文件校验失败：外部改动或损坏');return{ref,referenceOnly:true as const,bytes:undefined,text:undefined}}
 let bytes:Buffer;try{bytes=await readSafe(f,join(f.path,...ref.relativePath.split('/')))}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw Error('已批准会议文件缺失');throw error}
 if(bytes.length!==ref.size||hash(bytes)!==ref.sha256)throw Error('已批准会议文件校验失败：外部改动或损坏')
 const text=ref.mimeType?.startsWith('text/')||ref.relativePath.endsWith('.md')||ref.relativePath.endsWith('.txt')||ref.relativePath.endsWith('.json')?bytes.toString('utf8'):undefined
 return {ref,referenceOnly:false as const,bytes,...(text!==undefined?{text}:{})}
}
/** Host-only download uses an already-open verified fd; no arbitrary model path is accepted. */
export async function openMeetingDocumentDownload(value:FolderMeeting|string,fileId:string){const m=await meeting(value),f=getFolder(m),doc=await readMeetingDocument(m,fileId,{metadataOnly:true}),fd=await openOwnedFile(f.workspacePath,join(f.path,...doc.ref.relativePath.split('/')));try{const checked=await hashFileHandle(fd);if(checked.size!==doc.ref.size||checked.sha256!==doc.ref.sha256)throw Error('会议原件下载校验失败');return{ref:doc.ref,stream:fd.createReadStream({start:0,autoClose:true})}}catch(e){await fd.close();throw e}}
export async function readMeetingInstructions(value:FolderMeeting|string){const m=await meeting(value),f=getFolder(m);await verifyFolder(f);const bytes=await readSafe(f,instructionsFile(f));if(hash(bytes)!==f.instructionsSha256)throw Error('会议说明已外部改动或损坏');return{path:instructionsFile(f),version:f.instructionsVersion??1,sha256:f.instructionsSha256,text:bytes.toString('utf8')}}
export async function meetingFolderSnapshot(value:FolderMeeting|string){
 const m=await meeting(value),f=getFolder(m),files=[],errors:string[]=[];let instructionsText:string|undefined
 try{await verifyFolder(f)}catch(error){errors.push(String((error as Error).message))}
 if(!errors.length&&hash(currentInstructions(m,f))!==f.instructionsSha256)errors.push('当前批准说明与会议名称、目标或成员职责不同，等待管理操作重试同步')
 if(!errors.length)try{instructionsText=(await readMeetingInstructions(m)).text}catch(error){errors.push(String((error as Error).message))}
 try{await verifyIndex(f)}catch(error){errors.push(String((error as Error).message))}
 try{const raw=JSON.parse((await readSafe(f,join(f.path,'文件索引.json'))).toString('utf8')) as {instructions?:unknown};if(f.instructionsRelativePath&&JSON.stringify(raw.instructions)!==JSON.stringify(instructionsIndex(f)))errors.push('说明索引与当前批准版本不同，等待管理操作重试核实')}catch(error){errors.push(String((error as Error).message))}
 for(const ref of f.files){try{const doc=await readMeetingDocument(m,ref.fileId);files.push({...ref,status:'ok' as const,...(doc.text!==undefined?{text:doc.text}:{})})}catch(error){const reason=String((error as Error).message);errors.push(`${ref.name}：${reason}`);files.push({...ref,status:reason.includes('缺失')?'missing' as const:'invalid' as const,error:reason})}}
 return {meetingId:m.meetingId,title:m.title,path:f.path,instructionsPath:instructionsFile(f),instructionsVersion:f.instructionsVersion??1,instructionsText,indexPath:join(f.path,'文件索引.json'),members:m.memberSessionIds.map((id,index)=>({sessionId:id,name:m.memberNames?.[id]??`参会成员 ${index+1}`,role:m.memberRoles?.[id]??''})),integrity:errors.length?'invalid' as const:'ok' as const,errors,files}
}
export async function markMeetingFolderDeleted(m:FolderMeeting){if(!m.meetingFolder)return;const f=getFolder(m);await verifyFolder(f);await immutableWrite(f,join(f.path,'会议已删除说明.md'),Buffer.from(`# 会议已删除\n\n会议标识：${m.meetingId}\n\n插件会议已删除，此目录及所有工作文件保留，不再授权新执行。文件可供用户归档，插件不会删除用户文件。\n`))}
export function registerMeetingFolderTools(ctx:Context){
 const authorize=async(id:string,value:unknown)=>{const actor=await authenticateMeetingToolActor(ctx,value),m=await meeting(id);if(m.deletion)throw Error('会议已删除');if(!m.memberSessionIds.includes(actor.sessionId)&&m.secretary?.sessionId!==actor.sessionId)throw Error('仅本会参会成员或秘书可读取批准文件');return m}
 ctx.tools.register(defineTool({name:'meeting_file_index',description:'只读获取当前会议已批准的文件标识、版本与完整性状态。保留原会话工作区，不授予目录写权限。',parameters:{meetingId:{type:'string',required:true}},output:{schema:{type:'object',additionalProperties:false,properties:{snapshot:{type:'string',required:true}}},render:(_a,v)=>[{type:'text',text:v.snapshot}]},async execute(args,exec){const id=String(args.meetingId),snapshot=await meetingFolderSnapshot(await authorize(id,exec.agent));await authorize(id,exec.agent);return{snapshot:JSON.stringify(snapshot)}}}))
 ctx.tools.register(defineTool({name:'meeting_read_file',description:'只读读取本会批准fileId的精确版本，不接受任意路径。完整文件引用/大文件只返回核验元信息与保存位置，内容未解析，不解压、不把二进制或base64塞模型；既有小文本/图片协议保持。',parameters:{meetingId:{type:'string',required:true},fileId:{type:'string',required:true}},output:{schema:{type:'object',additionalProperties:false,properties:{fileId:{type:'string',required:true},name:{type:'string',required:true},sha256:{type:'string',required:true},mimeType:{type:'string',required:true},encoding:{type:'string',required:true},text:{type:'string',required:true}}},render:(_a,v)=>[{type:'text',text:v.text}]},async execute(args,exec){const id=String(args.meetingId),m=await authorize(id,exec.agent),doc=await readMeetingDocument(m,String(args.fileId));await authorize(id,exec.agent);return{fileId:doc.ref.fileId,name:doc.ref.name,sha256:doc.ref.sha256,mimeType:doc.ref.mimeType??(doc.text!==undefined?'text/markdown':'application/octet-stream'),encoding:doc.referenceOnly?'reference':doc.text!==undefined?'utf8':'base64',text:doc.referenceOnly?JSON.stringify({name:doc.ref.name,version:doc.ref.version,bytes:doc.ref.size,sha256:doc.ref.sha256,relativePath:doc.ref.relativePath,approvedPath:join(m.meetingFolder!.path,...doc.ref.relativePath.split('/')),referenceOnly:true,note:'完整原件引用，内容未解析；不自动解压，不把二进制或base64注入模型，不能凭名称或路径宣称理解。'}):doc.text??doc.bytes.toString('base64')}}}))
}
