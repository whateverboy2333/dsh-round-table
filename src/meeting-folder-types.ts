/** Approved shared files are bound to the meeting ledger, never inferred from filenames. */
export type MeetingFileKind='asset'|'task'|'result'|'minutes'
export interface MeetingFileRef {
 fileId:string;id:string;kind:MeetingFileKind;version:number;name:string;relativePath:string;sha256:string;size:number;createdAt:number
 mimeType?:string;metadata?:Record<string,string|number|boolean|null>
 contentKind?:'file';referenceOnly?:boolean
}
export interface MeetingFolder {
 schemaVersion:1;meetingId:string;workspaceId:string;workspacePath:string;path:string;createdAt:number;instructionsSha256:string;files:MeetingFileRef[]
 instructionsVersion?:number;instructionsRelativePath?:string;initialInstructionsSha256?:string
 instructionsHistory?:{version:number;relativePath:string;sha256:string}[]
}
const plain=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
/** Browser-safe shape guard. The server separately enforces native realpath and link identity. */
const absolutePath=(value:string)=>/^(?:[a-zA-Z]:[\\/]|\/|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/.test(value)&&!value.split(/[\\/]/).some(p=>p==='.'||p==='..')&&!/[\x00-\x1f]/.test(value)
const normalizedPath=(value:string)=>{const p=value.replace(/\\/g,'/').replace(/\/+$/,'');return /^(?:[a-zA-Z]:|\/\/)/.test(p)?p.toLowerCase():p}
export function isMeetingFileRef(x:unknown):x is MeetingFileRef {
 if(!plain(x))return false
 if(x.referenceOnly!==undefined&&typeof x.referenceOnly!=='boolean'||x.contentKind!==undefined&&x.contentKind!=='file')return false
 return ['fileId','id','name','relativePath'].every(k=>typeof x[k]==='string'&&!!x[k])&&['asset','task','result','minutes'].includes(String(x.kind))&&Number.isInteger(x.version)&&Number(x.version)>0&&Number.isInteger(x.size)&&Number(x.size)>=0&&Number.isFinite(x.createdAt)&&Number(x.createdAt)>0&&typeof x.sha256==='string'&&/^[a-f0-9]{64}$/.test(x.sha256)&&!String(x.relativePath).includes('\\')&&!String(x.relativePath).startsWith('/')&&!String(x.relativePath).split('/').some(p=>p==='..'||p==='.'||!p)&& (x.mimeType===undefined||typeof x.mimeType==='string')&&(x.metadata===undefined||(plain(x.metadata)&&Object.values(x.metadata).every(v=>v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))))
}
export function isMeetingFolder(x:unknown):x is MeetingFolder {
 if(!plain(x))return false
 if(!(x.schemaVersion===1&&['meetingId','workspaceId','workspacePath','path'].every(k=>typeof x[k]==='string'&&!!x[k])&&typeof x.instructionsSha256==='string'&&/^[a-f0-9]{64}$/.test(x.instructionsSha256)&&Number.isFinite(x.createdAt)&&Number(x.createdAt)>0&&Array.isArray(x.files)&&x.files.every(isMeetingFileRef)&&new Set(x.files.map(f=>f.fileId)).size===x.files.length))return false
 if(!absolutePath(String(x.workspacePath))||!absolutePath(String(x.path)))return false
 if(x.instructionsVersion!==undefined&&(!Number.isInteger(x.instructionsVersion)||Number(x.instructionsVersion)<1))return false
 if(x.instructionsRelativePath!==undefined&&x.instructionsRelativePath!==`说明版本/会议说明-v${x.instructionsVersion}.md`)return false
 if(x.initialInstructionsSha256!==undefined&&(typeof x.initialInstructionsSha256!=='string'||!/^[a-f0-9]{64}$/.test(x.initialInstructionsSha256)))return false
 if(x.instructionsHistory!==undefined&&(!Array.isArray(x.instructionsHistory)||!x.instructionsHistory.every(v=>plain(v)&&Number.isInteger(v.version)&&Number(v.version)>0&&v.relativePath===`说明版本/会议说明-v${v.version}.md`&&typeof v.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.sha256))||new Set(x.instructionsHistory.map(v=>v.version)).size!==x.instructionsHistory.length))return false
 const base=normalizedPath(String(x.workspacePath)),path=normalizedPath(String(x.path));return path!==base&&path.startsWith(base+'/')
}
