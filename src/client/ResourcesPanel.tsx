import {useState,useRef} from 'react'
import type {MeetingAsset} from '../meeting-flow-types.ts'
import {uiButton as button,localScopeId} from './ui-state.ts'
import {useScopedOperations} from './use-scoped-operations.ts'
import {MeetingFolderPanel} from './MeetingFolderPanel.tsx'
import {downloadMeetingAsset} from './asset-upload-client.ts'
import type {MeetingFolder} from '../meeting-folder-types.ts'
export function ResourcesPanel({meetingId,assets=[],templates=[],folder,folderError,archived=false,onChanged}:{meetingId:string;assets?:MeetingAsset[];templates?:{id:string;title:string}[];folder?:MeetingFolder;folderError?:string;archived?:boolean;onChanged:()=>Promise<void>}):React.ReactNode{
  const {meetingCall,isCurrent}=useScopedOperations(),scope=useRef(localScopeId()).current
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[image,setImage]=useState<string>()
  const run=async(fn:()=>Promise<void>)=>{if(busy||!isCurrent())return;setBusy(true);setError('');try{await fn()}catch(e){if(isCurrent())setError(String(e instanceof Error?e.message:e))}finally{if(isCurrent())setBusy(false)}}
  const refreshAccepted=async()=>{if(!isCurrent())return;try{await onChanged()}catch(e){if(isCurrent())setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`)}}
  const read=(a:MeetingAsset,preview:boolean)=>run(async()=>{if(a.referenceOnly||a.contentKind==='file'){await downloadMeetingAsset(meetingId,a,scope,isCurrent);return}const value=(await meetingCall(meetingId,'asset-read',{id:a.id})).asset;if(!isCurrent())return;if(preview&&a.image){setImage(`data:${a.mimeType};base64,${value.data}`);return}const data=Uint8Array.from(atob(value.data),(c)=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([data],{type:a.mimeType})),link=document.createElement('a');link.href=url;link.download=a.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})
  return <section style={{display:'flex',flexDirection:'column',gap:10,fontSize:13}}>
    <MeetingFolderPanel key={meetingId} meetingId={meetingId} folder={folder} folderError={folderError} archived={archived} onChanged={onChanged}/>
    <b>会议资料与版本</b><p>将图片或文档拖入讨论区加载，这里归档已保存版本。加载不自动唤醒成员。在讨论中明确选择资料可发送给成员，也可用于生成任务卡。支持文本、代码、diff/patch，以及 PNG、JPEG、WebP；直接读取的图片和小文本每份最大2MB，文本最多10万字符；普通文件可保留完整原件引用，最大256MB，未自动解压或解析。</p>
    {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在处理资料…</p>}
    {image&&<div><img alt="会议图片预览" src={image} style={{maxWidth:'100%',maxHeight:360,objectFit:'contain'}}/><button style={button} onClick={()=>setImage(undefined)}>关闭图片</button></div>}
    {!assets.length&&<p>暂无附件。项目文档可上传 Markdown 或文本，代码改动可上传 diff/patch。</p>}
    {assets.map(a=><article key={a.id} style={{border:'1px solid var(--dsw-alias-border-l2)',padding:10,borderRadius:8,overflowWrap:'anywhere'}}><b>{a.name} · v{a.version}</b><p>{(a.bytes/1024).toFixed(1)}KB · {new Date(a.createdAt).toLocaleString()}</p><button style={button} disabled={busy} onClick={()=>{void read(a,false)}}>下载此版本</button>{!!a.image&&!a.referenceOnly&&<button style={button} onClick={()=>{void read(a,true)}}>预览图片</button>}<details><summary>内容与校验</summary><small>SHA256 {a.sha256}</small>{a.referenceOnly&&<p>完整原件引用，内容未解析；下载保留此版本完整文件，不自动解压。</p>}{!a.referenceOnly&&a.text&&<pre style={{whiteSpace:'pre-wrap'}}>{a.text}</pre>}</details></article>)}
    {templates.length>0&&<details><summary>历史模板名称（只读）</summary>{templates.map(t=><p key={t.id}>{t.title}</p>)}</details>}
  </section>
}
