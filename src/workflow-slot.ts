import type {WorkflowRun,WorkflowActivation} from './workflow-types.ts'
/** Shared, read-only slot math for the runtime and the chat target selector. */
export function latestActivation(run:WorkflowRun,slotKey:string):WorkflowActivation|undefined {
 return run.activations.filter(a=>!a.temporary&&a.slotKey===slotKey).at(-1)
}
export function workflowSlot(run:WorkflowRun,nodeId:string,forceRound?:number){
 const loop=run.definition.loops.find(l=>l.nodeIds.includes(nodeId));let round=forceRound??(loop?(run.rounds[loop.id]??1):0)
 if(loop&&nodeId===loop.advanceId&&forceRound===undefined){
  const gate=latestActivation(run,`${loop.gateId}:${loop.id}:${round}`),chosen=run.definition.edges.find(e=>e.id===gate?.choiceEdgeId),existing=latestActivation(run,`${nodeId}:${loop.id}:${round}`)
  if(chosen?.to===nodeId||!existing)round++
 }
 return {slotKey:`${nodeId}:${loop?.id??'main'}:${round}`,round,...(loop?{loopId:loop.id}:{})}
}
export function queuedWorkflowSlot(run:WorkflowRun,nodeId:string){
 if(run.status!=='active'||run.paused||!run.definition.nodes.some(n=>n.id===nodeId&&n.kind!=='join'))return
 let slot=workflowSlot(run,nodeId)
 const loop=run.definition.loops.find(l=>l.id===slot.loopId)
 if(latestActivation(run,slot.slotKey)){
  if(!loop||slot.round>=Number.MAX_SAFE_INTEGER)return
  slot=workflowSlot(run,nodeId,slot.round+1)
 }
 return slot
}
