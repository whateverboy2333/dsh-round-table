import {useEffect,useState} from 'react'
let localScope:string|undefined
const failures=new Map<string,string>(),listeners=new Set<()=>void>()
export type LocalPersistence={available:boolean;reason?:string}
let persistence:LocalPersistence={available:false,reason:'尚未识别当前 DSH 实例'}
const publishPersistence=()=>{const reason=!localScope?'尚未识别当前 DSH 实例':failures.values().next().value;const next={available:!reason,...(reason?{reason}:{})};if(JSON.stringify(next)!==JSON.stringify(persistence)){persistence=next;listeners.forEach(fn=>fn())}}
/** Opaque stable home/profile ID supplied by this plugin's authenticated host route. */
export function configureLocalScope(scope:string|undefined):void{const next=scope&&/^[a-zA-Z0-9._-]{1,160}$/.test(scope)?scope:undefined;if(localScope!==next){localScope=next;failures.clear();publishPersistence()}}
export const localScopeId=()=>localScope
export const localPersistenceSnapshot=():LocalPersistence=>persistence
export function useLocalPersistence():LocalPersistence{const [value,setValue]=useState(localPersistenceSnapshot);useEffect(()=>{const update=()=>setValue(localPersistenceSnapshot());listeners.add(update);update();return()=>{listeners.delete(update)}},[]);return value}
export function readLocal<T>(key:string,fallback:T,expectedScope=localScope):T{
 if(!expectedScope||expectedScope!==localScope)return fallback
 try{
  const storageKey=`round-table.${expectedScope}.${key}`,value=localStorage.getItem(storageKey)
  // Older builds passed JS undefined to setItem, which Web Storage serialized as this literal.
  if(value==='undefined'){localStorage.removeItem(storageKey);failures.delete(key);publishPersistence();return fallback}
  return value===null?fallback:JSON.parse(value) as T
 }catch{failures.set(key,'本地存储不可读取或草稿格式损坏');publishPersistence();return fallback}
}
export function writeLocal(key:string,value:unknown,expectedScope=localScope):boolean{
 if(!expectedScope||expectedScope!==localScope)return false
 try{const storageKey=`round-table.${expectedScope}.${key}`;if(value===undefined)localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,JSON.stringify(value));failures.delete(key);publishPersistence();return true}
 catch{failures.set(key,'本地存储已满或不可用');publishPersistence();return false}
}
export async function meetingCall(meetingId:string,action:string,body:unknown={},expectedScope=localScope){if(expectedScope&&expectedScope!==localScope)throw Object.assign(Error('DSH 实例已变化，请重新打开圆桌'),{status:409,requestState:'rejected',retryable:false});const response=await fetch(`/plugins/round-table/meetings/${encodeURIComponent(meetingId)}/${action}`,{method:'POST',headers:{'content-type':'application/json',...(expectedScope?{'x-round-table-scope':expectedScope}:{})},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error??`HTTP ${response.status}`),{status:response.status,...(value.requestState==='rejected'?{requestState:'rejected'}:{}),...(typeof value.retryable==='boolean'?{retryable:value.retryable}:{}),...(typeof value.code==='string'?{code:value.code}:{})});return value}
/** Late completions belong to their mounting instance and must never write a newer one. */
export function scopedLocal(scope:string|undefined){return {readLocal:<T,>(key:string,fallback:T)=>scope?readLocal(key,fallback,scope):fallback,writeLocal:(key:string,value:unknown)=>!!scope&&writeLocal(key,value,scope),meetingCall:(id:string,action:string,body:unknown={})=>{if(!scope)return Promise.reject(Object.assign(Error('DSH 实例身份未知'),{status:409,requestState:'rejected',retryable:false}));return meetingCall(id,action,body,scope)}}}
export function downloadText(name:string,text:string,type='text/markdown;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export const uiButton:React.CSSProperties={font:'inherit',padding:'6px 10px',border:'1px solid var(--dsw-alias-border-l2)',borderRadius:8,background:'var(--dsw-alias-bg-base)',color:'inherit',cursor:'pointer'}
export const uiInput:React.CSSProperties={...uiButton,width:'100%',boxSizing:'border-box',minWidth:0,cursor:'text'}
