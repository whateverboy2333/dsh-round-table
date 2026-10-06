import type {Context} from '@deepseek-ai/cordis'
import {SessionId} from '@deepseek-ai/dsh-session'
import type {Meeting} from './meetings.ts'
import type {ImageRecipientCapability} from './chat-types.ts'
/** Read model projections only. Checking an image never wakes an Agent or sends text. */
export async function imageRecipientCapabilities(ctx:Context,m:Meeting,ids:string[],assetIds:string[]):Promise<ImageRecipientCapability[]>{
 if(!assetIds.some(id=>m.assets?.find(a=>a.id===id)?.image))return []
 return Promise.all(ids.map(async sessionId=>{
  try{
   const controller=ctx.get('sessionController');if(!controller)throw Error('模型状态接口不可用')
   const value=await controller.projections({sessionId:SessionId(sessionId)},new AbortController().signal),selection=value?.values.modelSelection?.next??value?.values.modelSelection?.lastUsed
   if(!selection)throw Error('尚未提供当前接收模型')
   const llm=ctx.get('llm') as {resolveModelInfo(provider:string,model:string):Promise<{inputModalities?:readonly string[]}>}|undefined
   if(!llm)throw Error('模型能力接口不可用')
   const info=await llm.resolveModelInfo(selection.provider,selection.model),supported=info.inputModalities?.includes('image')===true
   return {sessionId,state:supported?'supported' as const:'unsupported' as const,reason:supported?'可接收真实图文':'当前模型未声明支持图片，请调整接收成员或移除图片；原稿与附件保留'}
  }catch(error){return {sessionId,state:'unknown' as const,reason:`无法核实图片能力：${error instanceof Error?error.message:String(error)}；尚未发送，原稿与附件保留`}}
 }))
}
export async function assertImageRecipients(ctx:Context,m:Meeting,ids:string[],assetIds:string[]){
 const capabilities=await imageRecipientCapabilities(ctx,m,ids,assetIds),blocked=capabilities.filter(v=>v.state!=='supported')
 if(blocked.length)throw Error(blocked.map(v=>`${m.memberNames?.[v.sessionId]??'接收成员'}：${v.reason}`).join('；'))
 return capabilities
}
