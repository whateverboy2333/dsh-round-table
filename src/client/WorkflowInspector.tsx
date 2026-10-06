import {useEffect,useRef,useState} from 'react'
import {MaterialPicker} from './MaterialPicker.tsx'
import type {WorkflowDefinition,WorkflowNode,WorkflowInput,WorkflowRun} from '../workflow-types.ts'
import type {MeetingMessage,MeetingAsset} from '../meeting-flow-types.ts'
import {uiButton as button,uiInput as input} from './ui-state.ts'
export function WorkflowInspector({definition,node,members,messages,assets,run,readOnly=false,view='graph',onChange,onRemove}:{definition:WorkflowDefinition;node:WorkflowNode;members:{id:string;name:string}[];messages:MeetingMessage[];assets:MeetingAsset[];run?:WorkflowRun;readOnly?:boolean;view?:'sequence'|'graph';onChange:(n:WorkflowNode)=>void;onRemove:()=>void}):React.ReactNode{
 const [materials,setMaterials]=useState<{key:string;epoch:number}>()
 const locked=readOnly||run?.status==='active'&&run.activations.some(a=>a.nodeId===node.id&&!a.temporary)
 const contextKey=JSON.stringify([definition.id,node.id,run?.id,!!locked,view,definition.executionPolicy]),owner=useRef({key:contextKey,epoch:0,present:true,alive:true})
 if(owner.current.key!==contextKey)owner.current={...owner.current,key:contextKey,epoch:owner.current.epoch+1}
 owner.current.present=definition.nodes.some(n=>n.id===node.id)
 useEffect(()=>{owner.current.alive=true;return()=>{owner.current.alive=false;owner.current.epoch++}},[])
 useEffect(()=>{setMaterials(undefined)},[contextKey])
 const current=owner.current,valid=(captured:{key:string;epoch:number})=>owner.current.alive&&owner.current.present&&!locked&&owner.current.key===captured.key&&owner.current.epoch===captured.epoch
 const change=(p:Partial<WorkflowNode>)=>{if(valid(current))onChange({...node,...p})}
 const has=(b:WorkflowInput)=>node.inputs.some(x=>JSON.stringify(x)===JSON.stringify(b))
 const toggle=(b:WorkflowInput)=>change({inputs:has(b)?node.inputs.filter(x=>JSON.stringify(x)!==JSON.stringify(b)):[...node.inputs,b]})
 return <aside aria-label="节点设置" className="rt-workflow-inspector" style={{minWidth:0,border:'1px solid var(--dsw-alias-border-l2)',borderRadius:12,padding:12,display:'flex',flexDirection:'column',gap:10,maxHeight:640,overflowY:'auto'}}>
  <strong>环节设置</strong>{locked&&<p role="status">此环节已开始，要求和输入已冻结。可查看记录，或通过返工建立新一轮。</p>}
  <fieldset disabled={locked} style={{border:0,padding:0,margin:0,minWidth:0,display:'flex',flexDirection:'column',gap:10}}>
   <label>环节名称<input aria-label="环节名称" style={input} value={node.title} onChange={e=>change({title:e.target.value})}/></label>
   <label>环节类型<select aria-label="环节类型" style={input} value={node.kind} onChange={e=>change({kind:e.target.value as WorkflowNode['kind'],memberIds:[],decision:false})}><option value="work">成员处理</option><option value="join">汇合／人工选择</option><option value="minutes">秘书整理</option></select></label>
   {node.kind==='work'&&<fieldset style={{minWidth:0}}><legend>由谁处理</legend>{members.map(m=><label key={m.id} style={{display:'block',padding:4}}><input type="checkbox" checked={node.memberIds.includes(m.id)} onChange={()=>change({memberIds:node.memberIds.includes(m.id)?node.memberIds.filter(id=>id!==m.id):[...node.memberIds,m.id]})}/>{m.name}</label>)}{!members.length&&<p>请先在成员页加入原窗口。</p>}</fieldset>}
   {node.kind==='join'&&<label><input type="checkbox" checked={!!node.decision} onChange={e=>change({decision:e.target.checked})}/>汇合后由我选择路线</label>}
   <label>{node.kind==='join'?'主持备注':'本环节要求'}<textarea aria-label="环节要求" rows={3} style={input} value={node.instruction} onChange={e=>change({instruction:e.target.value})}/></label>
   {view==='sequence'&&node.requireReview===true&&<small>此配置保留成果验收要求；正式提交后仍需在结果处验收，记录不会自动改为通过。</small>}
   {view==='graph'&&node.kind==='work'&&<label><input type="checkbox" checked={node.requireReview===true} onChange={e=>change({requireReview:e.target.checked})}/>结果经主持人验收通过后，才可用于下游（未勾选仍会拦截明确退回的结果）</label>}
   {view==='graph'&&<label><input type="checkbox" checked={node.includeIncoming} onChange={e=>change({includeIncoming:e.target.checked,...(definition.executionPolicy==='per-node-v1'&&!e.target.checked?{autoReceiveAndRun:false}:{})})}/>接收所走上游环节的正式结果</label>}
   <button style={button} onClick={()=>{if(valid(current)){owner.current.epoch++;setMaterials({key:current.key,epoch:current.epoch})}}}>选择消息、附件与正式结果</button>{materials&&valid(materials)&&<MaterialPicker key={`${materials.key}:${materials.epoch}`} messages={messages} assets={assets} value={{messageIds:node.inputs.filter((x):x is {kind:'message';id:string}=>x.kind==='message').map(x=>x.id),assetIds:node.inputs.filter((x):x is {kind:'asset';id:string}=>x.kind==='asset').map(x=>x.id)}} names={Object.fromEntries(members.map(m=>[m.id,m.name]))} onApply={v=>{if(!valid(materials))return;change({inputs:[...node.inputs.filter(x=>x.kind!=='message'&&x.kind!=='asset'),...v.messageIds.map(id=>({kind:'message' as const,id})),...v.assetIds.map(id=>({kind:'asset' as const,id}))]});owner.current.epoch++;setMaterials(undefined)}} onCancel={()=>{if(valid(materials)){owner.current.epoch++;setMaterials(undefined)}}}/>}
   <details><summary>指定节点／旧轮结果</summary><p>仅使用正式提交。明确选择上一轮时，没有旧轮会提示缺失。</p>{definition.nodes.filter(n=>n.id!==node.id).map(n=><div key={n.id}><strong>{n.title}</strong>{(['current','previous'] as const).map(round=><label key={round} style={{display:'block'}}><input type="checkbox" checked={has({kind:'node',nodeId:n.id,round})} onChange={()=>toggle({kind:'node',nodeId:n.id,round})}/>{round==='current'?'本轮':'上一轮'}</label>)}</div>)}</details>
   {run&&<details><summary>明确沿用历史执行</summary>{run.activations.filter(a=>!a.skipped&&a.nodeId!==node.id&&(a.releaseId||a.minutesId)).map(a=><label key={a.id} style={{display:'block'}}><input type="checkbox" checked={has({kind:'activation',activationId:a.id})} onChange={()=>toggle({kind:'activation',activationId:a.id})}/>{a.node.title} · 第{a.round||1}轮／尝试{a.attempt} · 定义v{a.definitionRevision}</label>)}</details>}
   <button style={button} onClick={onRemove}>删除此环节及其连线</button>
  </fieldset>
 </aside>
}
