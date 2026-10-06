/** Pure GUI draft edits. Final saving still uses the host's full graph validator. */
import type {WorkflowDefinition,WorkflowEdge,WorkflowRun} from './workflow-types.ts'
import {validateWorkflowGraph} from './workflow-graph.ts'

type Running=Pick<WorkflowRun,'status'|'activations'>
function mutable(ids:string[],run?:Running){if(run?.status==='active'&&run.activations.some(a=>!a.temporary&&ids.includes(a.nodeId)))throw Error('已开始的环节及其连线已冻结；请结束本次流程后修改。')}
export function editWorkflowEdge(d:WorkflowDefinition,edge:WorkflowEdge,replaceId?:string,run?:Running):WorkflowDefinition{
 const old=d.edges.find(e=>e.id===replaceId);mutable([edge.from,edge.to,...(old?[old.from,old.to]:[])],run)
 if(replaceId&&!old)throw Error('所选连线已不存在')
 if(edge.from===edge.to)throw Error('不能把环节连接到自己；返工请连接到评审环节。')
 if(d.edges.some(e=>e.id!==replaceId&&e.from===edge.from&&e.to===edge.to&&e.kind===edge.kind))throw Error('这两个环节之间已有同类型连线，不能重复添加。')
 const from=d.nodes.find(n=>n.id===edge.from),to=d.nodes.find(n=>n.id===edge.to)
 if(!from||!to)throw Error('连线起点或终点不存在')
 if(edge.kind==='choice'&&(!from.decision||from.kind!=='join'||!edge.label?.trim()))throw Error('人工选择出口需要从“汇合／人工选择”环节引出，并填写出口名称。')
 if(edge.kind==='choice'&&d.edges.some(e=>e.id!==replaceId&&e.from===edge.from&&e.kind==='choice'&&e.label?.trim()===edge.label?.trim()))throw Error('同一人工选择的出口名称不能重复。')
 if(edge.kind==='flow'&&from.decision)throw Error('人工决策环节的出口必须使用“由我选择”，不能直接顺序连接。')
 const next=structuredClone(d),clean:WorkflowEdge={id:replaceId??edge.id,from:edge.from,to:edge.to,kind:edge.kind,...(edge.kind==='choice'?{label:edge.label!.trim()}:{}),...(edge.kind==='loop'?{loopId:edge.loopId}:{})}
 next.edges=replaceId?next.edges.map(e=>e.id===replaceId?clean:e):[...next.edges,clean]
 if(clean.kind!=='loop'){
  const visited=new Set<string>(),reachesSource=(id:string):boolean=>{if(id===clean.from)return true;if(visited.has(id))return false;visited.add(id);return next.edges.some(e=>e.kind!=='loop'&&e.from===id&&reachesSource(e.to))}
  if(reachesSource(clean.to))throw Error('除声明的回路返回边外，流程不能有环')
 }
 if(old?.kind==='loop'&&(clean.kind!=='loop'||old.loopId!==clean.loopId||old.to!==clean.to))next.loops=next.loops.map(l=>l.id===old.loopId?{...l,entryIds:l.entryIds.filter(id=>id!==old.to||next.edges.some(e=>e.kind==='loop'&&e.loopId===l.id&&e.to===id))}:l)
 if(clean.kind==='loop'){
  const loop=next.loops.find(l=>l.id===clean.loopId)
  if(!loop||loop.advanceId!==clean.from||!loop.nodeIds.includes(clean.to)||clean.to===loop.advanceId||clean.to===loop.gateId)throw Error('返回线必须从本回路的修改环节连到评审入口；请先配置返工范围。')
  if(!loop.entryIds.includes(clean.to))loop.entryIds.push(clean.to)
 }
 const signature=(x:{code:string;nodeId?:string;edgeId?:string})=>`${x.code}/${x.nodeId??''}/${x.edgeId??''}`
 const before=new Set(validateWorkflowGraph(d).map(signature))
 const hard=new Set(['edge-id','dangling','self-cycle','edge-kind','duplicate-edge','cycle','loop-edge','loop-entry','loop-exit','loop-region','loop-advance','nested-loop','group-overlap'])
 const introduced=validateWorkflowGraph(next).find(x=>hard.has(x.code)&&!before.has(signature(x)))
 if(introduced)throw Error(introduced.message)
 return next
}
export function removeWorkflowEdge(d:WorkflowDefinition,id:string,run?:Running):WorkflowDefinition{
 const edge=d.edges.find(e=>e.id===id);if(!edge)throw Error('连线不存在');mutable([edge.from,edge.to],run)
 const next=structuredClone(d);next.edges=next.edges.filter(e=>e.id!==id)
 if(edge.kind==='loop')next.loops=next.loops.map(l=>l.id===edge.loopId?{...l,entryIds:l.entryIds.filter(x=>x!==edge.to||next.edges.some(e=>e.kind==='loop'&&e.loopId===l.id&&e.to===x))}:l)
 return next
}
export function removeWorkflowNode(d:WorkflowDefinition,id:string,run?:Running):WorkflowDefinition{
 mutable([id,...d.edges.filter(e=>e.from===id||e.to===id).flatMap(e=>[e.from,e.to])],run)
 if(run?.status==='active'&&(d.entryId===id||d.loops.some(l=>l.nodeIds.includes(id))||d.parallelGroups.some(g=>g.sourceId===id||g.joinId===id||g.branchIds.includes(id))))throw Error('运行中的入口、返工范围和并行分组不能删除；请先结束流程。')
 const next=structuredClone(d),removedLoops=new Set(next.loops.filter(l=>l.gateId===id||l.advanceId===id).map(l=>l.id))
 next.nodes=next.nodes.filter(n=>n.id!==id).map(n=>({...n,inputs:n.inputs.filter(b=>b.kind!=='node'||b.nodeId!==id)}))
 next.edges=next.edges.filter(e=>e.from!==id&&e.to!==id&&(!e.loopId||!removedLoops.has(e.loopId)))
 next.loops=next.loops.filter(l=>!removedLoops.has(l.id)).map(l=>({...l,nodeIds:l.nodeIds.filter(x=>x!==id),entryIds:l.entryIds.filter(x=>x!==id)}))
 next.parallelGroups=next.parallelGroups.filter(g=>g.sourceId!==id&&g.joinId!==id).map(g=>({...g,branchIds:g.branchIds.filter(x=>x!==id)})).filter(g=>g.branchIds.length>=2)
 delete next.positions[id]
 if(next.entryId===id)next.entryId=next.nodes.find(n=>!next.edges.some(e=>e.to===n.id&&e.kind!=='loop'))?.id??''
 return next
}
