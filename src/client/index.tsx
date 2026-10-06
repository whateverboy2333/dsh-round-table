/** dsh-round-table 浏览器入口：侧边栏底部「圆桌」按钮 + 右侧抽屉面板（R3 聊天室核心）。 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { desktopConnection } from './desktop-connection.ts'
import {configureLocalScope,useLocalPersistence} from './ui-state.ts'
import {createPortal} from 'react-dom'
// 声明合并触发器：让 SlotMap 的 'sidebar.footer.action' 键类型可见（官方契约包，类型导入不进 bundle）
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PANEL_WIDTH, clampPanelWidth, draggedPanelWidth,sidebarColumn,expandedPanelLeft } from './panel-layout.ts'
import {dockColumns,dockGeometry,dockWidth,reserveHostDock} from './host-dock.ts'
import {installPanelFileDrop} from './panel-file-drop.ts'
import { MeetingPanel, type RoundTableConnection, type UseSessionsLike, type UseWorkspacesLike } from './MeetingPanel.tsx'

/** slots 注册按钮；sessions 解析参会窗口的 SessionFace（scope/sessionOf/prompt）。 */
export const inject = ['slots', 'sessions', 'remote', 'remote.session', 'remote.workspace', 'remote.agentPresets', 'workspaces', 'uiWorkspace']


/** 圆桌图标：圆桌+三椅，inline SVG 避免依赖图标库。 */
function RoundTableIcon(): React.ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="1.75" r="1" fill="currentColor" />
      <circle cx="2.6" cy="11.4" r="1" fill="currentColor" />
      <circle cx="13.4" cy="11.4" r="1" fill="currentColor" />
    </svg>
  )
}

/**
 * 侧边栏底部动作条目（sidebar.footer.action 是 list slot，owner 只给列宽状态；
 * useSessions/useWorkspaces 是框架给全局（root scope）slot 组件的标准 props）。
 * 点击开合右侧抽屉；抽屉是 fixed 元素且不渲染任何遮罩层，
 * 因此面板外区域天然保持可交互（无 pointer-events 陷阱）。
 */
function RoundTableEntry({ wide, useSessions, useWorkspaces, rtCtx, connection,profileName }: SidebarFooterActionOwnerProps & {
  useSessions: UseSessionsLike
  useWorkspaces: UseWorkspacesLike
  rtCtx: ClientContext
  connection: RoundTableConnection
  profileName?:string
}): React.ReactNode {
  const [open, setOpen] = useState(false)
  const [expanded,setExpanded]=useState(false),[attention,setAttention]=useState(0)
  const [badge,setBadge]=useState({review:0,fault:0,running:0})
  const persistence=useLocalPersistence()
  const [draftGeneration,setDraftGeneration]=useState(0)
  useEffect(()=>{let alive=true;const tick=()=>{void fetch('/plugins/round-table/meetings?view=summary').then(r=>r.json()).then(v=>{if(alive){const meetings=(v.meetings??[]).filter((m:{archivedAt?:number})=>!m.archivedAt);setAttention(meetings.reduce((n:number,m:{counts?:{attention:number}})=>n+(m.counts?.attention??0),0));setBadge(meetings.reduce((n:{review:number;fault:number;running:number},m:{counts?:{awaitingReview?:number;faults?:number;running?:number}})=>({review:n.review+(m.counts?.awaitingReview??0),fault:n.fault+(m.counts?.faults??0),running:n.running+(m.counts?.running??0)}),{review:0,fault:0,running:0}))}}).catch(()=>{})};tick();const timer=setInterval(tick,15000);return()=>{alive=false;clearInterval(timer)}},[])
  const [panelWidth,setPanelWidth]=useState(DEFAULT_PANEL_WIDTH)
  const entry=useRef<HTMLDivElement>(null)
  const panel=useRef<HTMLElement>(null),[fileHint,setFileHint]=useState('')
  const [panelLayer,setPanelLayer]=useState<HTMLElement|null>(null)
  useEffect(()=>{const node=panel.current;if(!open||!node)return;const hint=(event:Event)=>setFileHint(String((event as CustomEvent).detail??''));node.addEventListener('round-table-file-hint',hint);const dispose=installPanelFileDrop(node);return()=>{dispose();node.removeEventListener('round-table-file-hint',hint);setFileHint('')}},[open,panelLayer])
  const currentPanelLayer=()=>dockColumns(entry.current)?.frame.querySelector<HTMLElement>(':scope > [data-shell-overlay]')??null
  const mountPanel=(node:React.ReactNode)=>panelLayer?createPortal(node,panelLayer):node
  const [workbenchLeft,setWorkbenchLeft]=useState(0)
  const [dock,setDock]=useState(()=>dockGeometry(null,DEFAULT_PANEL_WIDTH,window.innerWidth))
  const measureWorkbench=()=>{setWorkbenchLeft(expandedPanelLeft(sidebarColumn(entry.current),window.innerWidth));const next=dockGeometry(entry.current,panelWidth,window.innerWidth);setDock(old=>JSON.stringify(old)===JSON.stringify(next)?old:next)}
  useEffect(()=>{
    if(!open)return
    const columns=dockColumns(entry.current)
    if(columns?.frame.querySelector)setPanelLayer(currentPanelLayer())
    measureWorkbench()
    const resize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(()=>measureWorkbench())
    if(columns)for(const column of [columns.sidebar,columns.frame,columns.right])if(column)resize?.observe(column)
    window.addEventListener('resize',measureWorkbench)
    return()=>{resize?.disconnect();window.removeEventListener('resize',measureWorkbench)}
  },[open,wide,panelWidth])
  useEffect(()=>{if(open&&!expanded&&dock.supported)return reserveHostDock(entry.current,dock.width)},[open,expanded,dock.width,dock.supported])
  const drag=useRef<{x:number;width:number;pointerId:number}|undefined>()
  const [dragging,setDragging]=useState(false)
  useEffect(()=>{const resize=()=>setPanelWidth(width=>clampPanelWidth(width,window.innerWidth));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
  const endDrag=()=>{drag.current=undefined;setDragging(false)}
  return (
    <div
      ref={entry}
      data-round-table-entry=""
      style={wide
        ? { display: 'flex', alignItems: 'center', alignSelf: 'flex-start', width: 'fit-content', height: 49, marginTop: 8, position: 'relative', flex: 'none' }
        : { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, position: 'relative', flex: 'none' }}
    >
      <button
        type="button"
        aria-label="圆桌"
        aria-expanded={open}
        onClick={() => { if(open)setOpen(false);else{if(dockColumns(entry.current)?.frame.querySelector)setPanelLayer(currentPanelLayer());setPanelWidth(DEFAULT_PANEL_WIDTH);setExpanded(false);setDock(dockGeometry(entry.current,DEFAULT_PANEL_WIDTH,window.innerWidth));setOpen(true)} }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: wide ? 8 : 0,
          width: wide ? 'fit-content' : 36,
          height: wide ? 49 : 36,
          padding: wide ? '0 10px 0 8px' : 0,
          border: 'none',
          borderRadius: wide ? 12 : '50%',
          background: open ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
          color: 'var(--dsw-alias-label-primary)',
          fontFamily: 'inherit',
          fontSize: 14,
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        <RoundTableIcon />
        {attention>0&&<span aria-label={`${badge.review}项待验收，${badge.fault}项需核实或故障，${badge.running}项执行中`} title={`${badge.review}项待验收 · ${badge.fault}项需核实／故障 · ${badge.running}项执行中`} style={{fontSize:11,borderRadius:8,padding:'0 4px',background:'var(--dsw-alias-interactive-bg-hover)'}}>{wide?([badge.review?badge.review+' 待验收':'',badge.fault?badge.fault+' 需核实／故障':''].filter(Boolean).join(' · ')||attention+' 待处理'):attention}</span>}
        {wide && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>圆桌</span>}
      </button>
      {open && mountPanel(
        <section
          ref={panel}
          data-round-table-panel=""
          data-round-table-expanded={expanded?'true':'false'}
          aria-label="圆桌"
          style={{
            position: 'fixed',
            top: window.location.protocol==='dsh-app:'?40:0,
            right: expanded?0:dock.right,
            bottom: 0,
            left: expanded?workbenchLeft:undefined,
            width: expanded?`calc(100% - ${workbenchLeft}px)`:dock.width,
            boxSizing: 'border-box',
            userSelect: dragging ? 'none' : undefined,
            maxWidth: expanded?undefined:'calc(100vw - 24px)',
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'auto',
            background: 'var(--dsw-alias-bg-base)',
            borderLeft: '1px solid var(--dsw-alias-border-l1)',
            boxShadow: 'var(--dsw-shadow-lv2)',
          }}
        >
          {!expanded&&<div role="separator" aria-label="调整圆桌侧栏宽度" aria-orientation="vertical" tabIndex={0}
            aria-valuemin={Math.min(320,dock.available/2)} aria-valuemax={dockWidth(1100,dock.available)} aria-valuenow={Math.round(dock.width)}
            title="拖动调整宽度；左右方向键调整；双击恢复默认"
            data-round-table-resize=""
            style={{position:'absolute',left:-4,top:0,bottom:0,width:9,cursor:'col-resize',touchAction:'none',zIndex:1,background:dragging?'var(--dsw-alias-border-l1)':'transparent'}}
            onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();drag.current={x:event.clientX,width:dock.width,pointerId:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);setDragging(true)}}
            onPointerMove={event=>{const start=drag.current;if(start&&start.pointerId===event.pointerId)setPanelWidth(draggedPanelWidth(start.width,start.x,event.clientX,window.innerWidth))}}
            onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);endDrag()}}
            onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            onDoubleClick={()=>setPanelWidth(clampPanelWidth(DEFAULT_PANEL_WIDTH,window.innerWidth))}
            onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setPanelWidth(width=>clampPanelWidth(width+(event.key==='ArrowLeft'?24:-24),window.innerWidth))}else if(event.key==='Home'){event.preventDefault();setPanelWidth(clampPanelWidth(DEFAULT_PANEL_WIDTH,window.innerWidth))}}}
          />}
          <header
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 44,
              padding: '10px 12px',
              boxSizing: 'border-box',
              borderBottom: '1px solid var(--dsw-alias-border-l2)',
            }}
          >
            <span style={{ color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontWeight: 500, lineHeight: '20px' }}>
              圆桌会议
            </span>
            <button type="button" aria-label={expanded?'收回侧栏':'展开会议工作台'} onClick={()=>{measureWorkbench();endDrag();setExpanded(v=>!v)}} style={{font:'inherit',background:'transparent',border:'none',color:'inherit',cursor:'pointer'}}>{expanded?'收回侧栏':'打开完整工作台'}</button>
            <button
              type="button"
              aria-label="关闭圆桌面板"
              onClick={() => { setOpen(false) }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                border: 'none',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--dsw-alias-label-secondary)',
                fontSize: 14,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </header>
          {fileHint&&<div role="status" data-file-drop-hint="" style={{position:'absolute',top:48,left:12,right:12,zIndex:2300,padding:'6px 12px',borderRadius:8,fontSize:12,background:'var(--dsw-alias-bg-base)',border:'1px dashed #2876dc',pointerEvents:'none'}}>{fileHint}</div>}
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px' }}>
            {!expanded&&!dock.supported&&<p role="alert">当前宿主布局尚未就绪，无法分配并排空间。请重新打开圆桌或使用完整工作台。</p>}
            {!persistence.available&&<p role="alert" style={{fontSize:12,margin:'0 0 8px'}}>{persistence.reason}。草稿和待核实请求仅本次窗口有效，关闭前请复制或导出；不要关闭后重新发送未确认的请求。</p>}
            <MeetingPanel key={draftGeneration} rtCtx={rtCtx} useSessions={useSessions} useWorkspaces={useWorkspaces} connection={connection} />
          </div>
        </section>
      )}
    </div>
  )
}

/** Mount draft readers only after the authenticated host identifies its profile. */
function ScopedEntry(props:Parameters<typeof RoundTableEntry>[0]):React.ReactNode{
 const [scope,setScope]=useState<string>(),[error,setError]=useState(''),[retry,setRetry]=useState(0),[show,setShow]=useState(false)
 const [profile,setProfile]=useState('')
 useEffect(()=>{
  let alive=true,inFlight=false,identified:string|undefined
  configureLocalScope(undefined);setScope(undefined);setError('')
  const identify=async()=>{if(inFlight)return;inFlight=true;try{const r=await fetch('/plugins/round-table/local-scope'),data=await r.json();if(!r.ok||typeof data.scope!=='string')throw Error(data.error??'无法识别当前 DSH 实例');if(alive&&identified!==data.scope){identified=data.scope;configureLocalScope(data.scope);setProfile(data.profileName??'');setScope(data.scope);setError('')}}catch(e){if(alive&&!identified)setError(String(e instanceof Error?e.message:e))}finally{inFlight=false}}
  void identify();const timer=setInterval(()=>{void identify()},5000)
  return()=>{alive=false;clearInterval(timer)}
 },[retry,props.rtCtx.remote.$host.home])
 if(scope)return <RoundTableEntry key={scope} {...props} profileName={profile}/>
 return <div><button aria-label="圆桌" onClick={()=>setShow(v=>!v)} style={{font:'inherit'}}>圆桌</button>{show&&<div role={error?'alert':'status'} style={{position:'fixed',right:12,bottom:20,padding:16,background:'var(--dsw-alias-bg-base)',border:'1px solid var(--dsw-alias-border-l2)',maxWidth:360,zIndex:40}}>{error||'正在识别当前 DSH 实例…'}{error&&<button onClick={()=>setRetry(v=>v+1)}>重新连接</button>}<p>识别前不读取或恢复任何草稿。</p></div>}</div>
}

export function apply(ctx: ClientContext): void {
  // 官方先例：dsh-client-ui-cordis 的 CordisPanel —— inject 等待 slot 声明后注册条目，
  // 返回值经调用方 ctx.effect 接管，插件卸载即级联清理。
  // rtCtx 经闭包传给条目组件（slot props 里没有 ctx，注册面只带声明式 share）。
  const connection = desktopConnection(ctx.remote)
  const Entry = (props: SidebarFooterActionOwnerProps & { useSessions: UseSessionsLike; useWorkspaces: UseWorkspacesLike }): React.ReactNode =>
    <ScopedEntry {...props} useSessions={selector=>props.useSessions(state=>{const snapshot={...state,current:Object.entries(state.byId).find(([,row])=>(row?.retainedBy?.mainView??0)>0)?.[0]};return selector(snapshot)})} useWorkspaces={selector=>props.useWorkspaces(state=>{const snapshot={...state,baselinesReady:state.phase==='ready'};return selector(snapshot)})} rtCtx={ctx} connection={connection} />
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'round-table',
      order: 100,
      label: '圆桌',
    }, Entry))
}
