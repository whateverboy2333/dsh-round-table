import {isValidElement,useEffect,useRef,type ReactNode} from 'react'
import {uiButton,uiInput} from './ui-state.ts'

export interface WorkflowToolbarOption {value:string;label:string;disabled?:boolean}
export interface WorkflowToolbarProps {
 view:'sequence'|'graph'
 onViewChange:(view:'sequence'|'graph')=>void
 historyValue:string
 historyOptions:readonly WorkflowToolbarOption[]
 onHistoryChange:(value:string)=>void
 viewingNote?:ReactNode
 historical?:boolean
 readOnly?:boolean
 configurationStatus:ReactNode
 configurationTone?:'saved'|'dirty'|'unavailable'
 configurationActions?:ReactNode
 runStatus:ReactNode
 runNote?:ReactNode
 collaborationControls?:ReactNode
 /** One native button. Its original handler/disabled state and primary marker belong to the caller. */
 primaryAction?:ReactNode
 runOperations?:ReactNode
 /** The caller must provide read-only content here when showing an archived or historical run. */
 runtimeDetails?:ReactNode
 readOnlyReturn?:ReactNode
}

/** Compact hierarchy only: the owning WorkflowPanel retains all state, business conditions and handlers. */
export function WorkflowToolbar({
 view,onViewChange,historyValue,historyOptions,onHistoryChange,viewingNote,historical=false,readOnly=false,
 configurationStatus,configurationTone='unavailable',configurationActions,runStatus,runNote,
 collaborationControls,primaryAction,runOperations,runtimeDetails,readOnlyReturn,
}:WorkflowToolbarProps):ReactNode{
 const menu=useRef<HTMLDetailsElement>(null),summary=useRef<HTMLElement>(null)
 const mutable=!historical&&!readOnly
 const primary=mutable&&isValidElement(primaryAction)&&primaryAction.type==='button'?primaryAction:null
 const closeMenu=(restoreFocus=false)=>{if(!menu.current?.open)return;menu.current.open=false;if(restoreFocus)summary.current?.focus()}
 useEffect(()=>{
  if(typeof document==='undefined')return
  const outside=(event:PointerEvent)=>{if(menu.current?.open&&!menu.current.contains(event.target as Node))closeMenu()}
  document.addEventListener('pointerdown',outside,true)
  return()=>document.removeEventListener('pointerdown',outside,true)
 },[])
 useEffect(()=>{closeMenu()},[historyValue,historical,readOnly,view])
 const segmentStyle=(selected:boolean)=>({
  ...uiButton,padding:'4px 9px',border:0,borderRadius:6,
  background:selected?'var(--dsw-alias-bg-base)':'transparent',
  boxShadow:selected?'0 0 0 1px var(--dsw-alias-border-l2)':undefined,
  fontWeight:selected?600:400,
 })
 return <section className="rt-workflow-toolbar" data-workflow-toolbar="">
  <style>{WORKFLOW_TOOLBAR_CSS}</style>
  <div className="rt-workflow-view-row">
   <div className="rt-workflow-viewing">
    <label className="rt-workflow-view-field"><span>正在查看</span><select aria-label="正在查看" style={{...uiInput,padding:'5px 8px'}} value={historyValue} onChange={e=>onHistoryChange(e.target.value)}>{historyOptions.map(option=><option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label>
    {(viewingNote||historical||readOnly)&&<div className="rt-workflow-view-note">{historical?<span className="rt-workflow-read-only">历史记录 · 只读</span>:readOnly?<span className="rt-workflow-read-only">当前会议 · 只读</span>:null}{viewingNote&&<span>{viewingNote}</span>}</div>}
   </div>
   <div className="rt-workflow-display"><span>显示方式</span><div className="rt-workflow-segments" role="group" aria-label="显示方式"><button type="button" style={segmentStyle(view==='sequence')} aria-pressed={view==='sequence'} onClick={()=>onViewChange('sequence')}>步骤列表</button><button type="button" style={segmentStyle(view==='graph')} aria-pressed={view==='graph'} onClick={()=>onViewChange('graph')}>流程图</button></div></div>
  </div>
  {mutable&&<section className="rt-workflow-configuration-band" aria-label="流程配置" data-configuration-tone={configurationTone}>
   <div className="rt-workflow-configuration-copy"><strong>流程配置</strong><span className="rt-workflow-configuration-status" role="status">{configurationStatus}</span><small>保存只记录安排</small></div>
   {configurationActions&&<div className="rt-workflow-configuration-actions">{configurationActions}</div>}
  </section>}
  <section className="rt-workflow-run-band" aria-label="本轮运行">
   <div className="rt-workflow-run-copy"><strong>{runStatus}</strong>{runNote&&<div className="rt-workflow-run-note">{runNote}</div>}</div>
   {mutable&&(collaborationControls||primary||runOperations)&&<div className="rt-workflow-run-actions">
    {collaborationControls&&<div className="rt-workflow-collaboration-controls">{collaborationControls}</div>}
    {primary&&<div className="rt-workflow-primary-slot">{primary}</div>}
    {runOperations&&<details className="rt-workflow-operation-menu" ref={menu} onKeyDown={e=>{if(e.key==='Escape'&&menu.current?.open){e.preventDefault();e.stopPropagation();closeMenu(true)}}}>
     <summary ref={summary}>运行操作<span aria-hidden="true">⌄</span></summary>
     <div className="rt-workflow-operation-items" aria-label="运行操作选项" onClick={e=>{const target=e.target as HTMLElement;if(target.closest?.('button,a[href]'))closeMenu(true)}}>{runOperations}</div>
    </details>}
   </div>}
   {!mutable&&readOnlyReturn&&<div className="rt-workflow-read-only-return">{readOnlyReturn}</div>}
  </section>
  {runtimeDetails&&<div className="rt-workflow-runtime-details">{runtimeDetails}</div>}
 </section>
}

export const WORKFLOW_TOOLBAR_CSS=`
.rt-workflow-toolbar{--rt-wf-gap:8px;--rt-wf-radius:8px;--rt-wf-secondary:var(--dsw-alias-label-secondary);display:grid;gap:var(--rt-wf-gap);min-width:0;max-width:100%;font-size:13px;line-height:1.5;container:workflow-toolbar/inline-size}
.rt-workflow-toolbar>*{min-width:0}.rt-workflow-toolbar button,.rt-workflow-toolbar select,.rt-workflow-toolbar summary{font:inherit;box-sizing:border-box;max-width:100%}
.rt-workflow-toolbar button{min-height:30px;overflow-wrap:anywhere}.rt-workflow-toolbar button:disabled{cursor:default;opacity:.55}
.rt-workflow-toolbar :is(button,select,summary):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.rt-workflow-view-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px}
.rt-workflow-view-field{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:var(--rt-wf-gap);max-width:460px}.rt-workflow-view-field>span,.rt-workflow-display>span{font-size:12px;color:var(--rt-wf-secondary);white-space:nowrap}.rt-workflow-view-field select{min-width:0;width:100%;text-overflow:ellipsis}
.rt-workflow-view-note{display:flex;gap:8px;flex-wrap:wrap;color:var(--rt-wf-secondary);font-size:12px;margin-top:3px;overflow-wrap:anywhere}.rt-workflow-read-only{font-weight:600}
.rt-workflow-display{display:flex;align-items:center;gap:var(--rt-wf-gap);min-width:0}
.rt-workflow-segments{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--rt-wf-radius);background:var(--dsw-alias-interactive-bg-hover);padding:3px;min-width:170px}.rt-workflow-segments>button{white-space:nowrap;color:inherit}
.rt-workflow-configuration-band,.rt-workflow-run-band{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:var(--rt-wf-gap);padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--rt-wf-radius);background:var(--dsw-alias-interactive-bg-hover)}
.rt-workflow-configuration-copy{display:flex;align-items:baseline;gap:var(--rt-wf-gap);flex-wrap:wrap;min-width:0}.rt-workflow-configuration-copy>strong,.rt-workflow-run-copy>strong{font-size:13px;font-weight:600}.rt-workflow-configuration-copy>small{color:var(--rt-wf-secondary);font-size:12px}
.rt-workflow-configuration-status{display:inline-flex;align-items:center;gap:5px;font-size:12px;overflow-wrap:anywhere}.rt-workflow-configuration-status::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary);flex:none}
.rt-workflow-configuration-band[data-configuration-tone=dirty] .rt-workflow-configuration-status{color:var(--dsw-alias-state-warning-primary,#a55d00)}.rt-workflow-configuration-band[data-configuration-tone=dirty] .rt-workflow-configuration-status::before{background:currentColor}
.rt-workflow-configuration-band[data-configuration-tone=saved] .rt-workflow-configuration-status{color:var(--rt-wf-secondary)}
.rt-workflow-configuration-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}.rt-workflow-configuration-actions>button{padding:4px 9px}.rt-workflow-configuration-actions>button:last-child:not(:first-child){border-color:transparent!important;background:transparent!important}
.rt-workflow-run-copy{min-width:0;overflow-wrap:anywhere}.rt-workflow-run-note{font-size:12px;color:var(--rt-wf-secondary);margin-top:3px;line-height:1.5}.rt-workflow-run-note p{margin:0}
.rt-workflow-run-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:start;justify-content:flex-end;min-width:0;max-width:100%}.rt-workflow-collaboration-controls{flex:1 1 100%;min-width:0;font-size:12px}.rt-workflow-collaboration-controls label{display:flex;align-items:center;gap:6px;min-width:0}.rt-workflow-collaboration-controls select{min-width:0;flex:1}
.rt-workflow-primary-slot{min-width:0;max-width:100%}.rt-workflow-primary-slot>button{padding:5px 10px;white-space:normal;min-height:32px}
.rt-workflow-primary-slot>[data-workflow-primary]{background:var(--dsw-alias-state-business-primary)!important;border-color:var(--dsw-alias-state-business-primary)!important;color:var(--dsw-alias-label-on-color,#fff)!important}
.rt-workflow-operation-menu{min-width:0;max-width:100%;font-size:13px}
.rt-workflow-operation-menu>summary{display:flex;align-items:center;justify-content:center;gap:5px;list-style:none;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--rt-wf-radius);padding:5px 9px;min-height:32px;background:var(--dsw-alias-bg-base);white-space:nowrap}.rt-workflow-operation-menu>summary::-webkit-details-marker{display:none}.rt-workflow-operation-menu[open]>summary>span{transform:rotate(180deg)}
.rt-workflow-operation-items{display:grid;gap:6px;max-height:min(220px,40vh);overflow:auto;overscroll-behavior:contain;padding:8px;margin-top:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--rt-wf-radius);background:var(--dsw-alias-bg-base);min-width:0}.rt-workflow-operation-items button{width:100%;text-align:left;white-space:normal;padding:5px 8px}
.rt-workflow-read-only-return{min-width:0}.rt-workflow-read-only-return>button{padding:4px 9px;background:var(--dsw-alias-bg-base)!important;color:inherit!important}
.rt-workflow-runtime-details{min-width:0;font-size:12px;color:var(--rt-wf-secondary)}.rt-workflow-runtime-details summary{cursor:pointer}
@container workflow-toolbar (max-width:560px){.rt-workflow-view-row{grid-template-columns:minmax(0,1fr);gap:8px}.rt-workflow-view-field{max-width:none}.rt-workflow-display{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px}.rt-workflow-segments{min-width:0}.rt-workflow-configuration-band,.rt-workflow-run-band{grid-template-columns:minmax(0,1fr);align-items:start}.rt-workflow-run-actions{justify-content:stretch}.rt-workflow-primary-slot{flex:1 1 140px}.rt-workflow-primary-slot>button{width:100%}.rt-workflow-read-only-return>button{width:100%}}
@container workflow-toolbar (max-width:320px){.rt-workflow-view-field{grid-template-columns:minmax(0,1fr);gap:3px}.rt-workflow-primary-slot{flex-basis:100%}.rt-workflow-operation-menu{width:100%}.rt-workflow-operation-items{max-height:min(180px,35vh)}}
`

