import type {MeetingAsset} from '../meeting-flow-types.ts'
import {localScopeId} from './ui-state.ts'
export const MAX_REFERENCE_BYTES=256*1024*1024,REFERENCE_CHUNK_BYTES=512*1024
type Call=(meetingId:string,action:string,body:unknown)=>Promise<any>
export async function uploadFileReference(call:Call,meetingId:string,file:File,requestId:string,cancelled:()=>boolean,progress?:(loaded:number,total:number)=>void):Promise<MeetingAsset|undefined>{
 const invalid=(message:string)=>Object.assign(Error(message),{retryable:false})
 if(!file.size||file.size>MAX_REFERENCE_BYTES)throw invalid('文件需有内容且不超过256MB；请保留原件，此限制不能通过重试改变。')
 const state=await call(meetingId,'asset-upload-begin',{requestId,name:file.name,mimeType:file.type||'application/octet-stream',totalBytes:file.size}),upload=state.upload??state
 const cancel=async()=>{await call(meetingId,'asset-upload-cancel',{uploadId:upload.uploadId})}
 if(cancelled()){await cancel();return}
 let offset=upload.offset
 if(!Number.isInteger(offset)||offset<0||offset>file.size)throw Error('文件加载进度无法核对；原请求保留，请重试原文件。')
 while(offset<file.size){
  if(cancelled()){await cancel();return}
  const bytes=new Uint8Array(await file.slice(offset,Math.min(file.size,offset+REFERENCE_CHUNK_BYTES)).arrayBuffer());if(cancelled()){await cancel();return}
  const pieces:string[]=[];for(let i=0;i<bytes.length;i+=16384)pieces.push(String.fromCharCode(...bytes.subarray(i,i+16384)))
  const result=await call(meetingId,'asset-upload-chunk',{uploadId:upload.uploadId,offset,data:btoa(pieces.join(''))}),next=result.upload??result
  if(next.uploadId!==upload.uploadId||next.offset!==offset+bytes.length)throw Error('文件块回执不匹配；原加载身份保持，不能确认已完成。')
  offset=next.offset;progress?.(offset,file.size)
 }
 if(cancelled()){await cancel();return}
 const value=await call(meetingId,'asset-upload-finish',{uploadId:upload.uploadId})
 if(cancelled()){await cancel();return}
 const asset=(value.asset??value) as MeetingAsset;if(!asset.id||asset.bytes!==file.size)throw Error('原件保存回执无法核对；请使用原加载请求重试。')
 return asset
}
export async function downloadMeetingAsset(meetingId:string,asset:MeetingAsset,scope:string|undefined,current:()=>boolean){
 if(!scope||scope!==localScopeId()||!current())throw Error('当前会议实例已变化，未下载文件')
 const response=await fetch(`/plugins/round-table/meetings/${encodeURIComponent(meetingId)}/asset-download`,{method:'POST',headers:{'content-type':'application/json','x-round-table-scope':scope},body:JSON.stringify({id:asset.id})})
 if(!response.ok){const error=await response.json();throw Error(error.error??'文件原件无法下载')}
 const blob=await response.blob();if(!current()||scope!==localScopeId())return
 if(blob.size!==asset.bytes)throw Error('文件下载长度与批准版本不同，未保存副本')
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=asset.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
