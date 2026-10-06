/** Host storage seams for the desktop runtime; reads never resume an Agent. */
import type {Context} from '@deepseek-ai/cordis'
import type {Session,SessionEvent} from '@deepseek-ai/dsh-session'

interface StoredHeader {id:string;cwd?:string;createdAt?:number;[key:string]:unknown}
export interface StoredInspection {meta:StoredHeader;events:readonly SessionEvent[];inheritedEventCount?:number}
interface ReadHandle {
 id:string;header:StoredHeader;inheritedEventCount?:number
 read(offset?:number,length?:number,options?:{signal?:AbortSignal}):Promise<{events:readonly SessionEvent[]}>
 close():Promise<void>
}
interface Persistence {
 list(options?:{signal?:AbortSignal}):Promise<readonly unknown[]>
 open?(id:string,access:'read',options?:{signal?:AbortSignal}):Promise<ReadHandle>
 inspect?(id:string,signal?:AbortSignal):Promise<StoredInspection>
 readRaw?(id:string):Promise<StoredInspection|undefined>
 flush?():Promise<void>
 locate?(meta:unknown):{path:string;kind:string}|undefined
}
function persistence(ctx:Context):Persistence {
 const service=ctx.get('sessionPersistence') as Persistence|undefined
 if(!service)throw new Error('宿主会话持久化服务不可用')
 return service
}
function header(value:unknown):StoredHeader {
 if(!value||typeof value!=='object'||typeof (value as StoredHeader).id!=='string')throw new Error('宿主会话日志身份格式非法')
 return value as StoredHeader
}
function events(value:unknown):readonly SessionEvent[] {
 if(!Array.isArray(value))throw new Error('宿主会话历史格式非法')
 for(const event of value)if(!event||typeof event.seq!=='number'||typeof event.time!=='number'||typeof event.type!=='string'||!('data' in event))throw new Error('宿主会话历史事件格式非法')
 return value as readonly SessionEvent[]
}
/** Retain complete seq/time/data/source envelopes; unsupported seams fail loudly. */
export function sessionHistory(session:Session):readonly SessionEvent[] {
 const source=session as Session&{events?:readonly SessionEvent[]}
 return events(typeof source.snapshotEvents==='function'?source.snapshotEvents():source.events)
}
/** Pending next-step input also blocks an independently queued meeting turn. */
export function inboxHasPending(inbox:unknown):boolean {
 if(!inbox||typeof inbox!=='object')throw new Error('宿主成员邮箱不可用')
 const source=inbox as {nextTurn?:unknown;nextStep?:unknown;hasPending?:unknown}
 if(Array.isArray(source.nextTurn)&&Array.isArray(source.nextStep))return source.nextTurn.length>0||source.nextStep.length>0
 if(typeof source.hasPending==='boolean')return source.hasPending
 throw new Error('宿主成员邮箱格式不受支持')
}
/** rc.2 lists snapshots, while rc.6 lists headers directly. */
export async function listStoredSessions(ctx:Context,signal?:AbortSignal):Promise<StoredHeader[]> {
 signal?.throwIfAborted()
 const rows=await persistence(ctx).list(signal?{signal}:undefined)
 if(!Array.isArray(rows))throw new Error('宿主会话列表格式非法')
 return rows.map(row=>header(row&&typeof row==='object'&&'header' in row?(row as {header:unknown}).header:row))
}
/** Durable history, independent of the attached Agent's own in-memory snapshot. */
export async function readStoredSession(ctx:Context,id:string,signal?:AbortSignal):Promise<StoredInspection> {
 signal?.throwIfAborted()
 const store=persistence(ctx)
 if(store.open){
  const handle=await store.open(id,'read',signal?{signal}:undefined)
  try {
   const meta=header(handle.header)
   if(handle.id!==id||meta.id!==id)throw new Error('宿主会话日志身份校验失败')
   const read=await handle.read(0,Number.MAX_SAFE_INTEGER,signal?{signal}:undefined)
   signal?.throwIfAborted()
   return {meta,events:events(read.events),inheritedEventCount:handle.inheritedEventCount}
  }finally{await handle.close()}
 }
 if(!store.inspect)throw new Error('宿主缺少只读会话日志接口')
 const result=await store.inspect(id,signal)
 if(header(result.meta).id!==id)throw new Error('宿主会话日志身份校验失败')
 return {...result,events:events(result.events)}
}
/** Live or loaded snapshots preserve buffered input; cold reads use a read handle. */
export async function readSessionHistory(ctx:Context,id:string,signal?:AbortSignal):Promise<readonly SessionEvent[]> {
 signal?.throwIfAborted()
 const registry=ctx.agents
 const store=ctx.get('sessions') as {get?(id:string):Session|undefined}|undefined
 const live=registry?.get(id as never)?.session??store?.get?.(id)
 return live?sessionHistory(live):(await readStoredSession(ctx,id,signal)).events
}
/** Caller must await its Agent handle's disposal first; this adds the durability barrier. */
export async function settleStoredSession(ctx:Context,id:string):Promise<StoredInspection> {
 const store=persistence(ctx)
 if(store.open){
  if(!store.flush)throw new Error('宿主缺少秘书日志持久化屏障')
  await store.flush()
 }
 return readStoredSession(ctx,id)
}
export function locateStoredSession(ctx:Context,meta:unknown):{path:string;kind:string}|undefined {
 const store=persistence(ctx)
 if(!store.locate)throw new Error('宿主缺少可验证的秘书日志定位接口')
 return store.locate(header(meta))
}
