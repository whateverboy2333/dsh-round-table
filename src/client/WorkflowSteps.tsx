import {useEffect,useRef,useState} from 'react'
import type {WorkflowDefinition,WorkflowNode,WorkflowNodeView,WorkflowRun} from '../workflow-types.ts'
import type {MeetingAsset,MeetingMessage} from '../meeting-flow-types.ts'
import {appendStepsNode,addStepsParallel,isStepsDefinition,stepsUserNodes,removeStepsNode,moveStepsStage,patchStepsNode} from '../workflow-steps.ts'
import {MaterialPicker} from './MaterialPicker.tsx'
import {uiButton as button,uiInput as input} from './ui-state.ts'

export interface WorkflowStepsProps {
 definition:WorkflowDefinition
 members:{id:string;name:string}[]
 run?:WorkflowRun
 views?:WorkflowNodeView[]
 selected:string
 busy?:boolean
 readOnly?:boolean
 messages?:MeetingMessage[]
 assets?:MeetingAsset[]
 onSelect:(id:string)=>void
 onEdit:(update:(current:WorkflowDefinition)=>WorkflowDefinition)=>void
 onPrepareEmpty?:()=>void
 onShowGraph?:()=>void
 onOpenMembers?:()=>void
 renderExecution?:(nodeId:string)=>React.ReactNode
}
const statusLabels:Record<string,string>={not_started:'未开始',not_walked:'未走此路径',waiting_inputs:'等待输入',ready:'可开始',waiting_decision:'待你决定',queued:'等待投递',offline:'原窗口未连接',delivering:'正在投递',uncertain:'投递待核实',in_progress:'处理中',waiting_review:'待验收',changes_requested:'待修改',submitted:'已提交',failed:'执行失败',ended:'已结束',skipped:'已跳过',limit:'达到上限'}
const active=(run?:WorkflowRun)=>run?.status==='active'
const started=(run:WorkflowRun|undefined,nodeId:string)=>!!active(run)&&!!run?.activations.some(a=>a.nodeId===nodeId&&!a.temporary)
/** Edit the user's step IDs, never infer intent, send messages, or migrate an old graph. */
export function WorkflowSteps(props:WorkflowStepsProps):React.ReactNode {
 const {definition,members,run,views=[],selected,busy=false,readOnly=false,messages=[],assets=[],onSelect,onPrepareEmpty,onShowGraph,onOpenMembers,renderExecution}=props
 const steps=isStepsDefinition(definition),nodes=steps?stepsUserNodes(definition):definition.nodes.filter(n=>!n.stepsInternal)
 const [collapsed,setCollapsed]=useState(false),[materials,setMaterials]=useState<{nodeId:string;key:string;epoch:number}>(),[error,setError]=useState('')
 const host=useRef<HTMLElement>(null),pendingFocus=useRef<string>(),latest=useRef(props),materialOwner=useRef<typeof materials>()
 latest.current=props
 const key=JSON.stringify([definition.id,readOnly,run?.id,run?.status,steps]),owner=useRef({key,epoch:0,alive:true})
 if(owner.current.key!==key)owner.current={...owner.current,key,epoch:owner.current.epoch+1}
 const captured={key:owner.current.key,epoch:owner.current.epoch}
 const valid=()=>owner.current.alive&&owner.current.key===captured.key&&owner.current.epoch===captured.epoch
 const writable=()=>valid()&&!latest.current.busy&&!latest.current.readOnly&&isStepsDefinition(latest.current.definition)
 useEffect(()=>{owner.current.alive=true;return()=>{owner.current.alive=false;owner.current.epoch++}},[])
 const setPicker=(next:typeof materials)=>{materialOwner.current=next;setMaterials(next)}
 useEffect(()=>{setCollapsed(false);setPicker(undefined);setError('')},[selected,key])
 useEffect(()=>{
  const id=pendingFocus.current;if(!id||!nodes.some(n=>n.id===id))return
  const field=host.current?.querySelector<HTMLInputElement>(`[data-steps-title="${id}"]`)
  if(field){field.focus();pendingFocus.current=undefined}
 },[definition,selected])
 const mutate=(change:(current:WorkflowDefinition,r?:WorkflowRun)=>WorkflowDefinition,structure=false,nodeId?:string)=>{
  if(!writable()||structure&&active(latest.current.run)||nodeId&&(!latest.current.definition.nodes.some(n=>n.id===nodeId&&!n.stepsInternal)||started(latest.current.run,nodeId)))return
  setError('')
  latest.current.onEdit(current=>{
   if(!writable()||current.id!==definition.id||!isStepsDefinition(current)||structure&&active(latest.current.run)||nodeId&&(!current.nodes.some(n=>n.id===nodeId&&!n.stepsInternal)||started(latest.current.run,nodeId)))return current
   try{return change(current,latest.current.run)}catch(e){const message=e instanceof Error?e.message:String(e);void Promise.resolve().then(()=>{if(valid())setError(message)});return current}
  })
 }
 const patch=(nodeId:string,fields:Partial<WorkflowNode>)=>mutate((d,r)=>{
  if(d.nodes.find(n=>n.id===nodeId)?.cardBinding&&('instruction'in fields||'inputs'in fields))return d
  return patchStepsNode(d,nodeId,fields,r)
 },false,nodeId)
 const add=(afterStageId?:string)=>{
  if(!writable()||active(latest.current.run)||afterStageId&&!latest.current.definition.steps?.stages.some(s=>s.id===afterStageId))return
  const nodeId=crypto.randomUUID(),stageId=crypto.randomUUID()
  pendingFocus.current=nodeId;setCollapsed(false)
  mutate((d,r)=>appendStepsNode(d,nodeId,stageId,afterStageId,r),true)
  if(valid())onSelect(nodeId)
 }
 const parallel=(nodeId:string,stageId:string)=>{
  if(!writable()||active(latest.current.run)||!latest.current.definition.steps?.stages.some(s=>s.id===stageId&&s.nodeIds.includes(nodeId)))return
  const newId=crypto.randomUUID();pendingFocus.current=newId;setCollapsed(false)
  mutate((d,r)=>addStepsParallel(d,nodeId,newId,stageId,r),true)
  if(valid())onSelect(newId)
 }
 const remove=(nodeId:string)=>{
  if(!writable()||active(latest.current.run)||!latest.current.definition.steps?.stages.some(s=>s.nodeIds.includes(nodeId)))return
  mutate((d,r)=>removeStepsNode(d,nodeId,r),true,nodeId)
  if(valid()&&latest.current.selected===nodeId)onSelect('')
  if(valid()&&materialOwner.current?.nodeId===nodeId)setPicker(undefined)
 }
 const expand=(nodeId:string)=>{if(!valid())return;setCollapsed(selected===nodeId?!collapsed:false);setPicker(undefined);onSelect(nodeId)}
 const select=(nodeId:string)=>{if(!valid())return;if(selected!==nodeId)setCollapsed(false);onSelect(nodeId)}
 const lockedStructure=readOnly||busy||active(run)||!steps
 const row=(node:WorkflowNode,position:string,stageId:string)=>{
  const open=selected===node.id&&!collapsed,locked=readOnly||busy||!steps||started(run,node.id),inputLocked=locked||!!node.cardBinding,memberId=node.memberIds[0]??'',missingMember=memberId&&!members.some(m=>m.id===memberId),view=views.find(v=>v.nodeId===node.id)
  const picker=materials?.nodeId===node.id&&materials.key===key&&materials.epoch===owner.current.epoch&&open&&!inputLocked
  return <section key={node.id} className="rt-steps-card" data-workflow-step={node.id} data-selected={open?'true':'false'}>
   <div className="rt-steps-head">
    <input data-steps-title={node.id} aria-label={`环节名称 ${position}`} className="rt-steps-title" style={{...input,width:'auto',minWidth:90,padding:'5px 1px',background:'transparent',borderColor:'transparent',fontWeight:500}} placeholder="点击命名" value={node.title} disabled={locked} onFocus={()=>select(node.id)} onChange={e=>patch(node.id,{title:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();e.currentTarget.blur()}}}/>
    <span className="rt-steps-status">{statusLabels[view?.status??'not_started']??view?.status}</span>
    {steps&&<button type="button" style={button} className="rt-steps-link" data-steps-action="parallel" data-node-id={node.id} disabled={lockedStructure} onClick={()=>parallel(node.id,stageId)}>设置并行</button>}
    <button type="button" style={button} className="rt-steps-link" data-steps-action="expand" data-node-id={node.id} aria-expanded={open} onClick={()=>expand(node.id)}>{open?'收起 ▴':'展开 ▾'}</button>
    {steps&&<button type="button" style={button} className="rt-steps-link rt-steps-delete" data-steps-action="delete" data-node-id={node.id} aria-label={`删除环节 ${position}`} title={readOnly?'当前记录只读':active(run)?'本轮已开始，结束本轮后可调整环节':busy?'正在处理，请稍候':'删除此环节；保存后更新会议配置'} disabled={lockedStructure} onClick={()=>remove(node.id)}>删除</button>}
   </div>
   {node.kind==='work'?<label className="rt-steps-assignment"><span>成员Agent</span><select style={input} data-steps-assignee={node.id} aria-label={`成员Agent ${position}`} value={memberId} disabled={locked} onChange={e=>patch(node.id,{memberIds:e.target.value?[e.target.value]:[]})}><option value="">请选择成员Agent</option>{missingMember&&<option value={memberId} disabled>原成员已不可用 · {memberId}</option>}{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>:<p className="rt-steps-type">{node.kind==='minutes'?'秘书整理':node.decision?'汇合／人工选择':'汇合'}</p>}
   {!steps&&node.memberIds.length>1&&<p className="rt-steps-type">原流程指派：{node.memberIds.map(id=>members.find(m=>m.id===id)?.name??`${id}（原成员已不可用）`).join('、')}</p>}
   {steps&&<label className="rt-steps-auto"><input type="checkbox" data-steps-auto={node.id} aria-label={`自动接收上游信息并运行 ${position}`} checked={node.autoReceiveAndRun===true} disabled={locked} onChange={e=>patch(node.id,{autoReceiveAndRun:e.target.checked})}/><span>自动接收上游信息并运行</span></label>}
   {open&&<div className="rt-steps-detail">
    {locked&&<p className="rt-steps-note">{!steps?'原流程保持原有结构，切换为空白编排后可自行安排。':readOnly?'当前记录只读。':started(run,node.id)?'此环节已开始，成员、要求和输入已冻结。':'正在保存，请稍候。'}</p>}
    {node.cardBinding&&<p className="rt-steps-note">已绑定任务卡 v{node.cardBinding.version}，要求与资料来自已发布文件。解除绑定后可修改要求与资料。</p>}
    <label className="rt-steps-field"><span>本环节要求</span><textarea rows={3} style={input} data-steps-instruction={node.id} aria-label={`本环节要求 ${position}`} placeholder="填写这个环节需要完成的工作…" value={node.instruction} disabled={inputLocked} onChange={e=>patch(node.id,{instruction:e.target.value})}/></label>
    {!!node.inputs.length&&<p className="rt-steps-note">已选 {node.inputs.filter(i=>i.kind==='message').length} 条消息、{node.inputs.filter(i=>i.kind==='asset').length} 份附件{node.inputs.some(i=>i.kind==='node'||i.kind==='activation')?'；保留明确选择的节点／执行记录':''}。</p>}
    <div className="rt-steps-detail-tools">{steps&&<button type="button" style={button} data-steps-action="materials" data-node-id={node.id} disabled={inputLocked} onClick={()=>{if(writable()&&!started(latest.current.run,node.id)&&!latest.current.definition.nodes.find(n=>n.id===node.id)?.cardBinding)setPicker({nodeId:node.id,key,epoch:owner.current.epoch})}}>选择会议资料</button>}</div>
    {picker&&<MaterialPicker key={`${key}:${node.id}:${materials.epoch}`} messages={messages} assets={assets} names={Object.fromEntries(members.map(m=>[m.id,m.name]))} value={{messageIds:node.inputs.filter((i):i is {kind:'message';id:string}=>i.kind==='message').map(i=>i.id),assetIds:node.inputs.filter((i):i is {kind:'asset';id:string}=>i.kind==='asset').map(i=>i.id)}} onApply={value=>{if(!writable()||materialOwner.current!==materials||latest.current.selected!==node.id||owner.current.epoch!==materials.epoch||started(latest.current.run,node.id))return;mutate((d,r)=>{const n=d.nodes.find(n=>n.id===node.id);if(!n||n.cardBinding)return d;return patchStepsNode(d,node.id,{inputs:[...n.inputs.filter(i=>i.kind!=='message'&&i.kind!=='asset'),...value.messageIds.map(id=>({kind:'message' as const,id})),...value.assetIds.map(id=>({kind:'asset' as const,id}))]},r)},false,node.id);setPicker(undefined)}} onCancel={()=>{if(valid()&&materialOwner.current===materials&&latest.current.selected===node.id)setPicker(undefined)}}/>}
    {renderExecution?.(node.id)}
   </div>}
  </section>
 }
 const stages=steps?definition.steps!.stages:nodes.map(n=>({id:n.id,nodeIds:[n.id]}))
 return <section ref={host} className="rt-workflow-steps" aria-label="会议步骤列表">
  <style>{workflowStepsStyles}</style>
  {!steps&&<div className="rt-steps-legacy" role="status"><p>这是原有流程，按实际节点只读显示，尚未转换为空白步骤编排。</p><div className="rt-steps-actions">{onPrepareEmpty&&<button type="button" style={button} data-steps-action="prepare-empty" disabled={readOnly||busy||active(run)} onClick={()=>{if(valid()&&!latest.current.readOnly&&!latest.current.busy&&!active(latest.current.run))onPrepareEmpty()}}>新建空白步骤编排</button>}{onShowGraph&&<button type="button" style={button} data-steps-action="graph" onClick={onShowGraph}>查看原流程图</button>}</div></div>}
  <div className="rt-steps-list-head"><div><strong>会议环节</strong><small>{nodes.length}个环节{stages.some(s=>s.nodeIds.length>1)?` · ${stages.filter(s=>s.nodeIds.length>1).length}组并行`:''}</small></div>{steps&&<button type="button" style={button} data-steps-action="add" disabled={lockedStructure} onClick={()=>add()}>＋ 添加环节</button>}</div>
  {steps&&!nodes.length&&<div className="rt-steps-empty"><strong>从空白开始编排</strong><p>点击“添加环节”，自己命名并指定成员Agent。</p><p>需要并行时，在对应环节旁设置。</p></div>}
  {active(run)&&steps&&<p className="rt-steps-note">本轮已开始，环节顺序与并行结构保持冻结。尚未开始的环节可更新成员、要求和自动运行选择。</p>}
  {stages.map((stage,index)=>{const group=stage.nodeIds.length>1,stageNodes=stage.nodeIds.map(id=>nodes.find(n=>n.id===id)).filter((n):n is WorkflowNode=>!!n),assigned=stageNodes.flatMap(n=>n.memberIds),same=assigned.length!==new Set(assigned).size;return <section key={stage.id} className="rt-steps-stage" data-steps-stage={stage.id}><span className="rt-steps-index">{index+1}</span><div className="rt-steps-stage-body">{group&&<div className="rt-steps-group-head"><strong>并行组</strong><p>{stageNodes.length}项无先后依赖，全部完成后继续{same?'；同一Agent的多项工作可能按序处理':''}</p></div>}<div className={group?'rt-steps-group-items':''}>{stageNodes.map((n,i)=>row(n,group?`${index+1}.${i+1}`:String(index+1),stage.id))}</div>{steps&&<div className="rt-steps-stage-tools"><button type="button" style={button} aria-label={`上移第${index+1}阶段`} data-steps-action="up" data-stage-id={stage.id} disabled={lockedStructure||index===0} onClick={()=>mutate((d,r)=>moveStepsStage(d,stage.id,'up',r),true)}>↑</button><button type="button" style={button} aria-label={`下移第${index+1}阶段`} data-steps-action="down" data-stage-id={stage.id} disabled={lockedStructure||index===stages.length-1} onClick={()=>mutate((d,r)=>moveStepsStage(d,stage.id,'down',r),true)}>↓</button><button type="button" style={button} className="rt-steps-link" data-steps-action="insert" data-stage-id={stage.id} disabled={lockedStructure} onClick={()=>add(stage.id)}>＋ 后续环节</button></div>}</div></section>})}
  {!members.length&&steps&&<p className="rt-steps-note">本会还没有可选成员。{onOpenMembers&&<button type="button" style={button} onClick={onOpenMembers}>查看会议成员</button>}</p>}
  {error&&<p role="alert">{error}</p>}
  {steps&&<p className="rt-steps-bottom">名称直接点击修改。成员Agent在每行选择，自动运行默认关闭。</p>}
 </section>
}

export const workflowStepsStyles=`
.rt-workflow-steps{min-width:0;max-width:100%;font-size:13px;line-height:1.5;container:workflow-steps/inline-size;color:inherit}
.rt-workflow-steps *{box-sizing:border-box}.rt-workflow-steps p{margin:0}.rt-workflow-steps button,.rt-workflow-steps input,.rt-workflow-steps select,.rt-workflow-steps textarea{font:inherit;max-width:100%}.rt-workflow-steps button{min-height:30px}.rt-workflow-steps button:disabled,.rt-workflow-steps input:disabled,.rt-workflow-steps select:disabled,.rt-workflow-steps textarea:disabled{cursor:default;opacity:.6}
.rt-workflow-steps :is(button,input,select,textarea):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.rt-steps-list-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.rt-steps-list-head small{display:block;font-size:12px;color:var(--dsw-alias-label-secondary)}
.rt-steps-empty{padding:26px 12px;text-align:center;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px}.rt-steps-empty p{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:7px}.rt-steps-stage{display:grid;grid-template-columns:26px minmax(0,1fr);gap:8px;margin-top:12px}.rt-steps-index{width:26px;height:26px;margin-top:10px;display:grid;place-items:center;background:var(--dsw-alias-interactive-bg-hover);border-radius:50%;color:var(--dsw-alias-label-secondary);font-size:12px}.rt-steps-stage-body{min-width:0}.rt-steps-card{min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base)}.rt-steps-card[data-selected=true]{border-color:var(--dsw-alias-state-business-primary)}
.rt-steps-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 10px}.rt-workflow-steps input.rt-steps-title{width:auto;flex:1 1 145px;min-width:90px;padding:5px 1px;background:transparent;border-color:transparent;font-weight:500}.rt-workflow-steps input.rt-steps-title:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)!important}.rt-workflow-steps input.rt-steps-title::placeholder{color:var(--dsw-alias-label-secondary)}.rt-steps-status{font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);padding:3px 6px;border-radius:4px;white-space:nowrap}.rt-workflow-steps button.rt-steps-link{border-color:transparent!important;background:transparent!important;color:var(--dsw-alias-state-business-primary)!important;padding:4px 6px!important}
.rt-workflow-steps button.rt-steps-delete{color:var(--dsw-alias-state-error-primary,#b42318)!important}
.rt-steps-assignment{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;padding:0 11px 10px;font-size:12px}.rt-steps-assignment select{width:100%;min-width:0;max-width:360px}.rt-steps-type{padding:0 11px 10px;font-size:12px}.rt-steps-auto{display:flex;align-items:center;gap:7px;padding:0 11px 11px;font-size:12px}.rt-steps-auto input{flex:0 0 15px;width:15px;height:15px;margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.rt-steps-detail{padding:12px;border-top:1px solid var(--dsw-alias-border-l2);border-radius:0 0 8px 8px;background:var(--dsw-alias-interactive-bg-hover);display:grid;gap:9px;min-width:0}.rt-steps-field{display:grid;gap:5px;font-size:12px;min-width:0}.rt-steps-field textarea{min-width:0;min-height:85px;resize:vertical}.rt-steps-note{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.rt-steps-detail-tools,.rt-steps-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.rt-steps-detail-tools{justify-content:space-between}.rt-steps-group-head{margin:3px 0 8px}.rt-steps-group-head p{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.rt-steps-group-items{display:grid;gap:8px;padding-left:12px;border-left:2px solid var(--dsw-alias-border-l2);min-width:0}.rt-steps-stage-tools{display:flex;justify-content:flex-end;gap:4px;flex-wrap:wrap;margin-top:5px}.rt-steps-stage-tools button{padding:3px 6px;min-height:26px;font-size:12px}.rt-steps-bottom{margin-top:14px!important;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;color:var(--dsw-alias-label-secondary)}.rt-steps-legacy{padding:10px;margin-bottom:12px;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;display:grid;gap:8px;font-size:12px}
@container workflow-steps (max-width:380px){.rt-steps-stage{grid-template-columns:24px minmax(0,1fr);gap:6px}.rt-steps-index{width:24px;height:24px}.rt-steps-head{padding:7px;gap:5px}.rt-steps-assignment{padding:0 8px 9px;gap:6px}.rt-steps-auto{padding:0 8px 10px}.rt-steps-group-items{padding-left:8px}.rt-steps-detail{padding:9px}.rt-steps-list-head>button{padding:5px 8px!important}}
@media(pointer:coarse){.rt-workflow-steps button{min-height:44px}.rt-workflow-steps input,.rt-workflow-steps select,.rt-workflow-steps textarea{font-size:16px}.rt-steps-auto{min-height:44px}}
`
