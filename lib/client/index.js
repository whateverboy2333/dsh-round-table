import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { desktopConnection } from "./desktop-connection.js";
import { configureLocalScope, useLocalPersistence } from "./ui-state.js";
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PANEL_WIDTH, clampPanelWidth, draggedPanelWidth, sidebarColumn, expandedPanelLeft } from "./panel-layout.js";
import { dockColumns, dockGeometry, dockWidth, reserveHostDock } from "./host-dock.js";
import { installPanelFileDrop } from "./panel-file-drop.js";
import { MeetingPanel } from "./MeetingPanel.js";
/** slots 注册按钮；sessions 解析参会窗口的 SessionFace（scope/sessionOf/prompt）。 */
export const inject = ['slots', 'sessions', 'remote', 'remote.session', 'remote.workspace', 'remote.agentPresets', 'workspaces', 'uiWorkspace'];
/** 圆桌图标：圆桌+三椅，inline SVG 避免依赖图标库。 */
function RoundTableIcon() {
    return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [_jsx("circle", { cx: "8", cy: "8", r: "3.25", stroke: "currentColor", strokeWidth: "1.5" }), _jsx("circle", { cx: "8", cy: "1.75", r: "1", fill: "currentColor" }), _jsx("circle", { cx: "2.6", cy: "11.4", r: "1", fill: "currentColor" }), _jsx("circle", { cx: "13.4", cy: "11.4", r: "1", fill: "currentColor" })] }));
}
/**
 * 侧边栏底部动作条目（sidebar.footer.action 是 list slot，owner 只给列宽状态；
 * useSessions/useWorkspaces 是框架给全局（root scope）slot 组件的标准 props）。
 * 点击开合右侧抽屉；抽屉是 fixed 元素且不渲染任何遮罩层，
 * 因此面板外区域天然保持可交互（无 pointer-events 陷阱）。
 */
function RoundTableEntry({ wide, useSessions, useWorkspaces, rtCtx, connection, profileName }) {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false), [attention, setAttention] = useState(0);
    const [badge, setBadge] = useState({ review: 0, fault: 0, running: 0 });
    const persistence = useLocalPersistence();
    const [draftGeneration, setDraftGeneration] = useState(0);
    useEffect(() => { let alive = true; const tick = () => { void fetch('/plugins/round-table/meetings?view=summary').then(r => r.json()).then(v => { if (alive) {
        const meetings = (v.meetings ?? []).filter((m) => !m.archivedAt);
        setAttention(meetings.reduce((n, m) => n + (m.counts?.attention ?? 0), 0));
        setBadge(meetings.reduce((n, m) => ({ review: n.review + (m.counts?.awaitingReview ?? 0), fault: n.fault + (m.counts?.faults ?? 0), running: n.running + (m.counts?.running ?? 0) }), { review: 0, fault: 0, running: 0 }));
    } }).catch(() => { }); }; tick(); const timer = setInterval(tick, 15000); return () => { alive = false; clearInterval(timer); }; }, []);
    const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
    const entry = useRef(null);
    const panel = useRef(null), [fileHint, setFileHint] = useState('');
    const [panelLayer, setPanelLayer] = useState(null);
    useEffect(() => { const node = panel.current; if (!open || !node)
        return; const hint = (event) => setFileHint(String(event.detail ?? '')); node.addEventListener('round-table-file-hint', hint); const dispose = installPanelFileDrop(node); return () => { dispose(); node.removeEventListener('round-table-file-hint', hint); setFileHint(''); }; }, [open, panelLayer]);
    const currentPanelLayer = () => dockColumns(entry.current)?.frame.querySelector(':scope > [data-shell-overlay]') ?? null;
    const mountPanel = (node) => panelLayer ? createPortal(node, panelLayer) : node;
    const [workbenchLeft, setWorkbenchLeft] = useState(0);
    const [dock, setDock] = useState(() => dockGeometry(null, DEFAULT_PANEL_WIDTH, window.innerWidth));
    const measureWorkbench = () => { setWorkbenchLeft(expandedPanelLeft(sidebarColumn(entry.current), window.innerWidth)); const next = dockGeometry(entry.current, panelWidth, window.innerWidth); setDock(old => JSON.stringify(old) === JSON.stringify(next) ? old : next); };
    useEffect(() => {
        if (!open)
            return;
        const columns = dockColumns(entry.current);
        if (columns?.frame.querySelector)
            setPanelLayer(currentPanelLayer());
        measureWorkbench();
        const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => measureWorkbench());
        if (columns)
            for (const column of [columns.sidebar, columns.frame, columns.right])
                if (column)
                    resize?.observe(column);
        window.addEventListener('resize', measureWorkbench);
        return () => { resize?.disconnect(); window.removeEventListener('resize', measureWorkbench); };
    }, [open, wide, panelWidth]);
    useEffect(() => { if (open && !expanded && dock.supported)
        return reserveHostDock(entry.current, dock.width); }, [open, expanded, dock.width, dock.supported]);
    const drag = useRef();
    const [dragging, setDragging] = useState(false);
    useEffect(() => { const resize = () => setPanelWidth(width => clampPanelWidth(width, window.innerWidth)); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
    const endDrag = () => { drag.current = undefined; setDragging(false); };
    return (_jsxs("div", { ref: entry, "data-round-table-entry": "", style: wide
            ? { display: 'flex', alignItems: 'center', alignSelf: 'flex-start', width: 'fit-content', height: 49, marginTop: 8, position: 'relative', flex: 'none' }
            : { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, position: 'relative', flex: 'none' }, children: [_jsxs("button", { type: "button", "aria-label": "\u5706\u684C", "aria-expanded": open, onClick: () => { if (open)
                    setOpen(false);
                else {
                    if (dockColumns(entry.current)?.frame.querySelector)
                        setPanelLayer(currentPanelLayer());
                    setPanelWidth(DEFAULT_PANEL_WIDTH);
                    setExpanded(false);
                    setDock(dockGeometry(entry.current, DEFAULT_PANEL_WIDTH, window.innerWidth));
                    setOpen(true);
                } }, style: {
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
                }, children: [_jsx(RoundTableIcon, {}), attention > 0 && _jsx("span", { "aria-label": `${badge.review}项待验收，${badge.fault}项需核实或故障，${badge.running}项执行中`, title: `${badge.review}项待验收 · ${badge.fault}项需核实／故障 · ${badge.running}项执行中`, style: { fontSize: 11, borderRadius: 8, padding: '0 4px', background: 'var(--dsw-alias-interactive-bg-hover)' }, children: wide ? ([badge.review ? badge.review + ' 待验收' : '', badge.fault ? badge.fault + ' 需核实／故障' : ''].filter(Boolean).join(' · ') || attention + ' 待处理') : attention }), wide && _jsx("span", { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: "\u5706\u684C" })] }), open && mountPanel(_jsxs("section", { ref: panel, "data-round-table-panel": "", "data-round-table-expanded": expanded ? 'true' : 'false', "aria-label": "\u5706\u684C", style: {
                    position: 'fixed',
                    top: window.location.protocol === 'dsh-app:' ? 40 : 0,
                    right: expanded ? 0 : dock.right,
                    bottom: 0,
                    left: expanded ? workbenchLeft : undefined,
                    width: expanded ? `calc(100% - ${workbenchLeft}px)` : dock.width,
                    boxSizing: 'border-box',
                    userSelect: dragging ? 'none' : undefined,
                    maxWidth: expanded ? undefined : 'calc(100vw - 24px)',
                    zIndex: 40,
                    display: 'flex',
                    flexDirection: 'column',
                    pointerEvents: 'auto',
                    background: 'var(--dsw-alias-bg-base)',
                    borderLeft: '1px solid var(--dsw-alias-border-l1)',
                    boxShadow: 'var(--dsw-shadow-lv2)',
                }, children: [!expanded && _jsx("div", { role: "separator", "aria-label": "\u8C03\u6574\u5706\u684C\u4FA7\u680F\u5BBD\u5EA6", "aria-orientation": "vertical", tabIndex: 0, "aria-valuemin": Math.min(320, dock.available / 2), "aria-valuemax": dockWidth(1100, dock.available), "aria-valuenow": Math.round(dock.width), title: "\u62D6\u52A8\u8C03\u6574\u5BBD\u5EA6\uFF1B\u5DE6\u53F3\u65B9\u5411\u952E\u8C03\u6574\uFF1B\u53CC\u51FB\u6062\u590D\u9ED8\u8BA4", "data-round-table-resize": "", style: { position: 'absolute', left: -4, top: 0, bottom: 0, width: 9, cursor: 'col-resize', touchAction: 'none', zIndex: 1, background: dragging ? 'var(--dsw-alias-border-l1)' : 'transparent' }, onPointerDown: event => { if (event.button !== 0)
                            return; event.preventDefault(); drag.current = { x: event.clientX, width: dock.width, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }, onPointerMove: event => { const start = drag.current; if (start && start.pointerId === event.pointerId)
                            setPanelWidth(draggedPanelWidth(start.width, start.x, event.clientX, window.innerWidth)); }, onPointerUp: event => { if (event.currentTarget.hasPointerCapture(event.pointerId))
                            event.currentTarget.releasePointerCapture(event.pointerId); endDrag(); }, onPointerCancel: endDrag, onLostPointerCapture: endDrag, onDoubleClick: () => setPanelWidth(clampPanelWidth(DEFAULT_PANEL_WIDTH, window.innerWidth)), onKeyDown: event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                            event.preventDefault();
                            setPanelWidth(width => clampPanelWidth(width + (event.key === 'ArrowLeft' ? 24 : -24), window.innerWidth));
                        }
                        else if (event.key === 'Home') {
                            event.preventDefault();
                            setPanelWidth(clampPanelWidth(DEFAULT_PANEL_WIDTH, window.innerWidth));
                        } } }), _jsxs("header", { style: {
                            flex: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            minHeight: 44,
                            padding: '10px 12px',
                            boxSizing: 'border-box',
                            borderBottom: '1px solid var(--dsw-alias-border-l2)',
                        }, children: [_jsx("span", { style: { color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontWeight: 500, lineHeight: '20px' }, children: "\u5706\u684C\u4F1A\u8BAE" }), _jsx("button", { type: "button", "aria-label": expanded ? '收回侧栏' : '展开会议工作台', onClick: () => { measureWorkbench(); endDrag(); setExpanded(v => !v); }, style: { font: 'inherit', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }, children: expanded ? '收回侧栏' : '打开完整工作台' }), _jsx("button", { type: "button", "aria-label": "\u5173\u95ED\u5706\u684C\u9762\u677F", onClick: () => { setOpen(false); }, style: {
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
                                }, children: "\u2715" })] }), fileHint && _jsx("div", { role: "status", "data-file-drop-hint": "", style: { position: 'absolute', top: 48, left: 12, right: 12, zIndex: 2300, padding: '6px 12px', borderRadius: 8, fontSize: 12, background: 'var(--dsw-alias-bg-base)', border: '1px dashed #2876dc', pointerEvents: 'none' }, children: fileHint }), _jsxs("div", { style: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px' }, children: [!expanded && !dock.supported && _jsx("p", { role: "alert", children: "\u5F53\u524D\u5BBF\u4E3B\u5E03\u5C40\u5C1A\u672A\u5C31\u7EEA\uFF0C\u65E0\u6CD5\u5206\u914D\u5E76\u6392\u7A7A\u95F4\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u5706\u684C\u6216\u4F7F\u7528\u5B8C\u6574\u5DE5\u4F5C\u53F0\u3002" }), !persistence.available && _jsxs("p", { role: "alert", style: { fontSize: 12, margin: '0 0 8px' }, children: [persistence.reason, "\u3002\u8349\u7A3F\u548C\u5F85\u6838\u5B9E\u8BF7\u6C42\u4EC5\u672C\u6B21\u7A97\u53E3\u6709\u6548\uFF0C\u5173\u95ED\u524D\u8BF7\u590D\u5236\u6216\u5BFC\u51FA\uFF1B\u4E0D\u8981\u5173\u95ED\u540E\u91CD\u65B0\u53D1\u9001\u672A\u786E\u8BA4\u7684\u8BF7\u6C42\u3002"] }), _jsx(MeetingPanel, { rtCtx: rtCtx, useSessions: useSessions, useWorkspaces: useWorkspaces, connection: connection }, draftGeneration)] })] }))] }));
}
/** Mount draft readers only after the authenticated host identifies its profile. */
function ScopedEntry(props) {
    const [scope, setScope] = useState(), [error, setError] = useState(''), [retry, setRetry] = useState(0), [show, setShow] = useState(false);
    const [profile, setProfile] = useState('');
    useEffect(() => {
        let alive = true, inFlight = false, identified;
        configureLocalScope(undefined);
        setScope(undefined);
        setError('');
        const identify = async () => { if (inFlight)
            return; inFlight = true; try {
            const r = await fetch('/plugins/round-table/local-scope'), data = await r.json();
            if (!r.ok || typeof data.scope !== 'string')
                throw Error(data.error ?? '无法识别当前 DSH 实例');
            if (alive && identified !== data.scope) {
                identified = data.scope;
                configureLocalScope(data.scope);
                setProfile(data.profileName ?? '');
                setScope(data.scope);
                setError('');
            }
        }
        catch (e) {
            if (alive && !identified)
                setError(String(e instanceof Error ? e.message : e));
        }
        finally {
            inFlight = false;
        } };
        void identify();
        const timer = setInterval(() => { void identify(); }, 5000);
        return () => { alive = false; clearInterval(timer); };
    }, [retry, props.rtCtx.remote.$host.home]);
    if (scope)
        return _jsx(RoundTableEntry, { ...props, profileName: profile }, scope);
    return _jsxs("div", { children: [_jsx("button", { "aria-label": "\u5706\u684C", onClick: () => setShow(v => !v), style: { font: 'inherit' }, children: "\u5706\u684C" }), show && _jsxs("div", { role: error ? 'alert' : 'status', style: { position: 'fixed', right: 12, bottom: 20, padding: 16, background: 'var(--dsw-alias-bg-base)', border: '1px solid var(--dsw-alias-border-l2)', maxWidth: 360, zIndex: 40 }, children: [error || '正在识别当前 DSH 实例…', error && _jsx("button", { onClick: () => setRetry(v => v + 1), children: "\u91CD\u65B0\u8FDE\u63A5" }), _jsx("p", { children: "\u8BC6\u522B\u524D\u4E0D\u8BFB\u53D6\u6216\u6062\u590D\u4EFB\u4F55\u8349\u7A3F\u3002" })] })] });
}
export function apply(ctx) {
    // 官方先例：dsh-client-ui-cordis 的 CordisPanel —— inject 等待 slot 声明后注册条目，
    // 返回值经调用方 ctx.effect 接管，插件卸载即级联清理。
    // rtCtx 经闭包传给条目组件（slot props 里没有 ctx，注册面只带声明式 share）。
    const connection = desktopConnection(ctx.remote);
    const Entry = (props) => _jsx(ScopedEntry, { ...props, useSessions: selector => props.useSessions(state => { const snapshot = { ...state, current: Object.entries(state.byId).find(([, row]) => (row?.retainedBy?.mainView ?? 0) > 0)?.[0] }; return selector(snapshot); }), useWorkspaces: selector => props.useWorkspaces(state => { const snapshot = { ...state, baselinesReady: state.phase === 'ready' }; return selector(snapshot); }), rtCtx: ctx, connection: connection });
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'round-table',
        order: 100,
        label: '圆桌',
    }, Entry));
}
