import {useState} from 'react'
import type {MeetingAsset,MeetingMessage} from '../meeting-flow-types.ts'
import {uiButton as button,uiInput as input} from './ui-state.ts'
export interface MaterialSelection {messageIds:string[];assetIds:string[]}
export const materialAssetIds=(messages:MeetingMessage[],value:MaterialSelection)=>[...new Set([...value.assetIds,...messages.filter(m=>value.messageIds.includes(m.id)).flatMap(m=>m.assetIds??[])])]
/** Transactional selection: only Confirm changes the caller's draft. No delivery or private history reads. */
export function MaterialPicker({messages,assets,value,names={},onApply,onCancel}:{messages:MeetingMessage[];assets:MeetingAsset[];value:MaterialSelection;names?:Record<string,string>;onApply:(v:MaterialSelection)=>void;onCancel:()=>void}):React.ReactNode{
 const [selected,setSelected]=useState<MaterialSelection>(()=>({messageIds:[...new Set(value.messageIds)],assetIds:[...new Set(value.assetIds)]})),[category,setCategory]=useState('all'),[query,setQuery]=useState('')
 const publicMessages=messages.filter(m=>!m.previewOnly),q=query.trim().toLowerCase(),files=materialAssetIds(publicMessages,selected)
 const list=publicMessages.filter(m=>(category==='all'||category==='result'?category==='all'||m.kind==='result':category==='message'&&m.kind!=='result')&&(!q||`${names[m.sender]??m.sender} ${m.text}`.toLowerCase().includes(q)))
 const toggle=(key:'messageIds'|'assetIds',id:string)=>setSelected(s=>({...s,[key]:s[key].includes(id)?s[key].filter(v=>v!==id):[...s[key],id]}))
 return <section role="region" aria-label="选择任务资料" style={{padding:12,border:'1px solid var(--dsw-alias-border-l2)',borderRadius:10,display:'flex',flexDirection:'column',gap:9,minWidth:0}}>
  <strong>选择本次实际输入</strong><p style={{margin:0}}>只使用正式会议消息、明确的文件版本和已发布结果。确认选择只更新草稿，不投递。</p>
  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><select aria-label="资料类型" style={button} value={category} onChange={e=>setCategory(e.target.value)}><option value="all">全部资料</option><option value="message">会议消息</option><option value="asset">文件版本</option><option value="result">历史结果</option></select><input aria-label="搜索会议资料" style={{...input,flex:1,minWidth:140}} placeholder="搜索内容、成员或文件名" value={query} onChange={e=>setQuery(e.target.value)}/></div>
  <div style={{maxHeight:340,overflow:'auto',overflowWrap:'anywhere'}}>
   {list.map(m=><div key={m.id} style={{padding:'6px 0',borderBottom:'1px solid var(--dsw-alias-border-l2)'}}><label><input type="checkbox" data-material-message={m.id} checked={selected.messageIds.includes(m.id)} onChange={()=>toggle('messageIds',m.id)}/>{m.kind==='result'?'结果':'消息'} · {names[m.sender]??(m.sender==='user'?'主持人':m.sender)}：{m.text.slice(0,80)}</label><details><summary>预览原文</summary><p style={{whiteSpace:'pre-wrap'}}>{m.text}</p>{m.assetIds?.map(id=><small key={id}>{assets.find(a=>a.id===id)?.name??'缺失附件'} · v{assets.find(a=>a.id===id)?.version} </small>)}</details></div>)}
   {(category==='all'||category==='asset')&&assets.filter(a=>!q||`${a.name} ${a.text??''}`.toLowerCase().includes(q)).map(a=>{const inherited=publicMessages.some(m=>selected.messageIds.includes(m.id)&&m.assetIds?.includes(a.id));return <div key={a.id} style={{padding:'6px 0'}}><label><input type="checkbox" data-material-asset={a.id} checked={files.includes(a.id)} disabled={inherited&&!selected.assetIds.includes(a.id)} onChange={()=>toggle('assetIds',a.id)}/>{a.name} · v{a.version}{inherited?'（随所选消息；取消该消息后可移除）':''}</label><details><summary>预览此版本</summary><p style={{whiteSpace:'pre-wrap'}}>{a.text??'图片原件；投递前会核对成员模型能力。'}</p><small>SHA256 {a.sha256}</small></details></div>})}
   {!list.length&&(category!=='asset'&&category!=='all'||!assets.some(a=>!q||a.name.toLowerCase().includes(q)))&&<p>没有匹配的资料。</p>}
  </div><p style={{margin:0}}>本次已选 {selected.messageIds.length} 条消息／结果、{files.length} 份附件；不会自动使用其他版本。</p>
  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={button} onClick={()=>onApply({messageIds:[...new Set(selected.messageIds)],assetIds:[...new Set(selected.assetIds)]})}>确认选择资料</button><button style={button} onClick={onCancel}>取消选资料</button></div>
 </section>
}
