import type {RoundTableConnection} from './MeetingPanel.tsx'
import type {KnightSelection} from './PresetKnightPicker.tsx'

export type MemberCreationStage='create'|'rename'|'verify'|'join'|'done'
export interface MemberCreationStep {
 instanceId:string;sessionId:string;title:string;stage:MemberCreationStage;error?:string
 presetId?:string;workspaceId?:string;role?:string
}
export interface MemberCreationBatch {id:string;members:MemberCreationStep[]}
export interface MeetingCreationJournal extends MemberCreationBatch {
 title:string;description:string;workspaceId:string;meetingId?:string;uncertain?:boolean;requestSafe?:boolean
}
export class MemberCreationStopped extends Error {constructor(){super('DSH 实例已变化，旧创建进度已停止；请重新打开原实例继续')}}
export const memberCreationStageText=(step:MemberCreationStep):string=>step.stage==='done'?'已加入会议':step.stage==='create'?'等待创建／核实窗口':step.stage==='rename'?'窗口已创建，等待设置名称':step.stage==='verify'?'名称已设置，等待核验工作区':'工作区已核验，等待加入会议'
export function memberCreationBatch(existing:readonly {sessionId:string;title:string}[],knights:readonly KnightSelection[],workspaceIds:readonly string[]):MemberCreationBatch {
 return {id:crypto.randomUUID(),members:[...existing.map(x=>({instanceId:`existing-${x.sessionId}`,sessionId:x.sessionId,title:x.title,stage:'join' as const})),...knights.map((x,i)=>({instanceId:x.instanceId,sessionId:`session-round-table-${crypto.randomUUID()}`,title:x.title,presetId:x.presetId,workspaceId:workspaceIds[i],role:x.role,stage:'create' as const}))]}
}
/** Persist identity before the first remote call. Official session.create adopts that same ID after response loss. */
export async function runMemberCreation<T extends MemberCreationBatch>(batch:T,connection:RoundTableConnection,join:(step:MemberCreationStep)=>Promise<void>,save:(batch:T)=>void,isCurrent:()=>boolean=()=>true):Promise<T> {
 const next=structuredClone(batch)
 const checkpoint=()=>{if(!isCurrent())throw new MemberCreationStopped();save(structuredClone(next))}
 checkpoint()
 for(const step of next.members){
  if(step.stage==='done')continue
  delete step.error;checkpoint()
  try{
   if(step.stage==='create'){
    const result=await connection.api.sessions.create({sessionId:step.sessionId,agentPreset:step.presetId!,workspaceId:step.workspaceId})
    if(!result.result.ok)throw Error(`创建失败：${result.result.error.message}`)
    if(result.result.value.sessionId!==step.sessionId)throw Error('宿主返回的窗口身份与本次创建记录不一致；请核实，不会加入会议')
    step.stage='rename';checkpoint()
   }
   if(step.stage==='rename'){
    const result=await connection.api.sessions.rename({sessionId:step.sessionId,title:step.title})
    if(!result.result.ok)throw Error(`标题设置失败：${result.result.error.message}`)
    step.stage='verify';checkpoint()
   }
   if(step.presetId&&(step.stage==='verify'||step.stage==='join')){
    const result=await connection.api.workspace.list({})
    if(!result.result.ok||!result.result.value.items.some(x=>x.workspaceId===step.workspaceId&&x.sessionIds?.includes(step.sessionId)))throw Error('无法确认窗口归属原定工作区；未入会／未简报')
    step.stage='join';checkpoint()
   }
   if(step.stage==='join'){await join(step);step.stage='done';checkpoint()}
  }catch(error){if(error instanceof MemberCreationStopped||!isCurrent())throw new MemberCreationStopped();step.error=error instanceof Error?error.message:String(error);checkpoint()}
 }
 return next
}
