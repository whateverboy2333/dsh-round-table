import {constants} from 'node:fs'
import {open,lstat,realpath,mkdir,link,unlink} from 'node:fs/promises'
import type {FileHandle} from 'node:fs/promises'
import {resolve,relative,isAbsolute,sep,dirname,join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
export const FILE_IO_BLOCK_BYTES=512*1024
const same=(a:string,b:string)=>process.platform==='win32'?resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b)
export async function guardOwnedFilePath(base:string,path:string,exists=true){
 const root=resolve(base),target=resolve(path),r=relative(root,target);if(!isAbsolute(base)||!isAbsolute(path)||r==='..'||r.startsWith('..'+sep)||isAbsolute(r))throw Error('文件路径越界，拒绝访问')
 const parts=r.split(sep).filter(Boolean);for(let i=-1,p=root;i<parts.length;i++){if(i>=0)p=join(p,parts[i]!);let stat;try{stat=await lstat(p)}catch(e){if(!exists&&(e as NodeJS.ErrnoException).code==='ENOENT')return;throw e}if(stat.isSymbolicLink()||!same(await realpath(p),p))throw Error('文件路径包含链接或重解析越界，拒绝访问')}
}
export async function ensureOwnedDirectory(base:string,path:string){await guardOwnedFilePath(base,dirname(path));try{await mkdir(path)}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}await guardOwnedFilePath(base,path);if(!(await lstat(path)).isDirectory())throw Error('上传目录被普通文件占用')}
export async function openOwnedFile(base:string,path:string,write=false):Promise<FileHandle>{
 await guardOwnedFilePath(base,path);const before=await lstat(path);if(!before.isFile()||before.nlink!==1)throw Error('原件文件不是独立普通文件，拒绝读取或写入')
 const fd=await open(path,(write?constants.O_RDWR:constants.O_RDONLY)|(constants.O_NOFOLLOW??0));const after=await fd.stat();if(before.ino!==after.ino||before.dev!==after.dev||after.nlink!==1){await fd.close();throw Error('原件文件身份变化，拒绝访问')}return fd
}
export async function hashFileHandle(fd:FileHandle){
 const before=await fd.stat(),hash=createHash('sha256'),buffer=Buffer.alloc(FILE_IO_BLOCK_BYTES);let size=0
 while(true){const result=await fd.read(buffer,0,buffer.length,size);if(!result.bytesRead)break;hash.update(buffer.subarray(0,result.bytesRead));size+=result.bytesRead}
 const after=await fd.stat();if(size!==before.size||after.size!==before.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('原件在核验期间发生改动');return{size,sha256:hash.digest('hex')}
}
export async function hashOwnedFile(base:string,path:string){const fd=await openOwnedFile(base,path);try{const value=await hashFileHandle(fd);await guardOwnedFilePath(base,path);return value}finally{await fd.close()}}
export async function copyOwnedFile(sourceBase:string,source:string,targetBase:string,target:string,expected:{size:number;sha256:string}){
 await guardOwnedFilePath(targetBase,dirname(target));const tmp=join(dirname(target),`.原件写入-${randomUUID()}.tmp`),input=await openOwnedFile(sourceBase,source),hash=createHash('sha256'),buffer=Buffer.alloc(FILE_IO_BLOCK_BYTES);let size=0,output:FileHandle|undefined
 try{output=await open(tmp,'wx',0o600);while(true){const r=await input.read(buffer,0,buffer.length,size);if(!r.bytesRead)break;const part=buffer.subarray(0,r.bytesRead);hash.update(part);await output.writeFile(part);size+=r.bytesRead}if(size!==expected.size||hash.digest('hex')!==expected.sha256)throw Error('原件SHA或长度校验失败：内容改动或损坏');await output.sync()}catch(e){await output?.close();output=undefined;await unlink(tmp).catch(()=>{});throw e}finally{await input.close();await output?.close()}
 try{await guardOwnedFilePath(targetBase,dirname(target));try{await link(tmp,target)}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}await unlink(tmp);const verified=await hashOwnedFile(targetBase,target);if(verified.size!==expected.size||verified.sha256!==expected.sha256)throw Error('已存在原件内容不同或已改动，不覆盖')}finally{await unlink(tmp).catch(()=>{})}
}
