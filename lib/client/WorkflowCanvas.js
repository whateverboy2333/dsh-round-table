import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { workflowPosition, workflowSurface, workflowEdgeGeometry, fitWorkflowZoom, clampWorkflowZoom, workflowAvailableHeight, anchoredWorkflowScroll } from "./workflow-viewport.js";
export const workflowLabels = { not_started: '未开始', not_walked: '未走此路径', waiting_inputs: '等待输入', ready: '可开始', waiting_decision: '待你决定', queued: '等待投递', offline: '原窗口未连接', delivering: '正在投递', uncertain: '投递待核实', in_progress: '处理中', waiting_review: '待验收', changes_requested: '待修改', submitted: '已提交', failed: '执行失败', ended: '已结束', skipped: '已跳过', limit: '达到上限' };
export const workflowColor = (status) => status === 'submitted' ? '#16794c' : status === 'ready' ? '#2470b5' : ['waiting_decision', 'uncertain', 'failed', 'limit'].includes(status ?? '') ? '#a55d00' : ['skipped', 'not_walked', 'ended'].includes(status ?? '') ? '#85858b' : '#5b6677';
export function WorkflowCanvas({ definition, views, run, selected, onSelect, onMove, zoom, members, readOnly = false, selectedEdge, onSelectEdge, onConnect, onZoomChange, fitRequest = 0, manualZoomRequest = 0 }) {
    const drag = useRef();
    const surface = useRef(null), linkRef = useRef();
    const [link, setLink] = useState();
    const viewport = useRef(null), automatic = useRef(true), lastFit = useRef(-1), lastManual = useRef(manualZoomRequest), previousZoom = useRef(zoom), currentZoom = useRef(zoom);
    currentZoom.current = zoom;
    const pendingScroll = useRef(), [canvasHeight, setCanvasHeight] = useState(120);
    const initialBounds = workflowSurface(definition), origin = useRef({ id: definition.id, x: initialBounds.offsetX, y: initialBounds.offsetY });
    if (origin.current.id !== definition.id) {
        origin.current = { id: definition.id, x: initialBounds.offsetX, y: initialBounds.offsetY };
        automatic.current = true;
    }
    const bounds = workflowSurface(definition, origin.current), { width, height, offsetX, offsetY } = bounds;
    useEffect(() => { if (lastManual.current !== manualZoomRequest) {
        automatic.current = false;
        pendingScroll.current = undefined;
        lastManual.current = manualZoomRequest;
    } }, [manualZoomRequest]);
    useEffect(() => {
        const element = viewport.current;
        if (!element)
            return;
        if (lastFit.current !== fitRequest) {
            automatic.current = true;
            lastFit.current = fitRequest;
        }
        const host = element.closest('.rt-meeting-content'), parent = element.parentElement;
        const measure = () => {
            const hostRect = host?.getBoundingClientRect(), bottom = Math.min(hostRect?.bottom ?? window.innerHeight, window.innerHeight), top = Math.max(element.getBoundingClientRect().top, hostRect?.top ?? -Infinity), available = workflowAvailableHeight(top, bottom);
            setCanvasHeight(current => current === available ? current : available);
            if (!automatic.current || !onZoomChange || !element.clientWidth)
                return;
            const chrome = Math.max(0, (element.offsetHeight ?? element.clientHeight) - element.clientHeight), usableHeight = Math.max(1, available - chrome);
            const next = fitWorkflowZoom(bounds, element.clientWidth, usableHeight), scroll = { zoom: next, left: Math.max(0, bounds.centerX * next - element.clientWidth / 2), top: Math.max(0, bounds.centerY * next - usableHeight / 2) };
            if (next === currentZoom.current) {
                pendingScroll.current = undefined;
                element.scrollLeft = scroll.left;
                element.scrollTop = scroll.top;
            }
            else {
                pendingScroll.current = scroll;
                onZoomChange(next);
            }
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
        observer?.observe(element);
        if (host)
            observer?.observe(host);
        if (parent)
            observer?.observe(parent);
        window.addEventListener('resize', measure);
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
    }, [definition.id, width, height, offsetX, offsetY, bounds.fitWidth, bounds.fitHeight, bounds.centerX, bounds.centerY, fitRequest, onZoomChange]);
    useEffect(() => {
        const element = viewport.current;
        if (!element)
            return;
        const pending = pendingScroll.current;
        if (pending && pending.zoom === zoom) {
            element.scrollLeft = pending.left;
            element.scrollTop = pending.top;
            pendingScroll.current = undefined;
        }
        else if (!pending && previousZoom.current !== zoom) {
            const scroll = anchoredWorkflowScroll(previousZoom.current, zoom, element.scrollLeft, element.scrollTop, element.clientWidth / 2, element.clientHeight / 2);
            element.scrollLeft = scroll.left;
            element.scrollTop = scroll.top;
        }
        previousZoom.current = zoom;
    }, [zoom]);
    useEffect(() => {
        const element = viewport.current;
        if (!element || !onZoomChange)
            return;
        // React's delegated wheel events can be passive. This local listener must cancel
        // Ctrl-wheel before Electron/the browser applies its application-wide zoom.
        const wheel = (event) => {
            if (!event.ctrlKey)
                return;
            event.preventDefault();
            event.stopPropagation();
            automatic.current = false;
            if (drag.current || linkRef.current || !event.deltaY)
                return;
            const pending = pendingScroll.current, oldZoom = pending?.zoom ?? zoom;
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1), next = clampWorkflowZoom(oldZoom * Math.exp(-Math.max(-300, Math.min(300, delta)) * .0015));
            if (next === oldZoom)
                return;
            const rect = element.getBoundingClientRect(), scroll = anchoredWorkflowScroll(oldZoom, next, pending?.left ?? element.scrollLeft, pending?.top ?? element.scrollTop, event.clientX - rect.left - element.clientLeft, event.clientY - rect.top - element.clientTop);
            pendingScroll.current = { zoom: next, ...scroll };
            onZoomChange(next);
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, [zoom, onZoomChange]);
    const locked = (id) => readOnly || run?.status === 'active' && run.activations.some(a => a.nodeId === id && !a.temporary);
    const clear = () => { linkRef.current = undefined; setLink(undefined); };
    const begin = (id, x, y) => { const p = position(id); linkRef.current = { from: id, x: p.x + 220, y: p.y + 58, clientX: x, clientY: y }; setLink(linkRef.current); };
    const finish = (to) => { const start = linkRef.current; if (start && !locked(to)) {
        clear();
        onConnect?.(start.from, to);
    } };
    const position = (id) => { const p = workflowPosition(definition, id); return { x: p.x + offsetX, y: p.y + offsetY }; };
    return _jsxs("div", { ref: viewport, className: "rt-workflow-canvas", "aria-label": "\u6D41\u7A0B\u753B\u5E03\uFF0C\u53EF\u6A2A\u5411\u548C\u7EB5\u5411\u6EDA\u52A8\uFF1BCtrl\uFF0B\u6EDA\u8F6E\u7F29\u653E", tabIndex: 0, onKeyDown: e => { if (e.key === 'Escape') {
            e.preventDefault();
            clear();
        } }, style: { overflow: 'auto', height: canvasHeight, minHeight: 120, boxSizing: 'border-box', flexShrink: 0, position: 'relative', overscrollBehavior: 'contain', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-l1, #f5f6f8)' }, children: [link && _jsx("span", { role: "status", style: { position: 'absolute', zIndex: 4, background: 'var(--dsw-alias-bg-base,white)', padding: 5, pointerEvents: 'none' }, children: "\u62D6\u5230\u53E6\u4E00\u73AF\u8282\u5DE6\u4FA7\u5706\u70B9\uFF0C\u6216\u70B9\u51FB\u63A5\u6536\u70B9\uFF1BEsc\u53D6\u6D88\u3002" }), _jsx("div", { style: { width: width * zoom, height: height * zoom, position: 'relative' }, children: _jsxs("div", { ref: surface, "data-workflow-surface": "", style: { width, height, transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative' }, children: [_jsxs("svg", { width: width, height: height, style: { position: 'absolute', inset: 0, pointerEvents: 'none' }, children: [_jsx("defs", { children: _jsx("marker", { id: "rt-flow-arrow", markerWidth: "8", markerHeight: "8", refX: "7", refY: "4", orient: "auto", children: _jsx("path", { d: "M0,0 L8,4 L0,8", fill: "#87909c" }) }) }), definition.edges.map(e => {
                                    const fromView = views.find(v => v.nodeId === e.from), toView = views.find(v => v.nodeId === e.to);
                                    const targetActivation = run?.activations.find(a => a.id === toView?.activationId), sources = targetActivation?.sourceActivationIds ?? toView?.sourceActivationIds ?? [];
                                    const sameExecution = fromView?.activationId ? sources.includes(fromView.activationId) : !!fromView?.sourceActivationIds.length && fromView.sourceActivationIds.every(id => sources.includes(id));
                                    const chosen = fromView?.status === 'submitted' && toView?.incomingEdgeIds.includes(e.id) && sameExecution, color = chosen ? '#16794c' : '#87909c';
                                    const returning = e.kind === 'loop', { path, labelX, labelY } = workflowEdgeGeometry(definition, e);
                                    return _jsxs("g", { transform: `translate(${offsetX} ${offsetY})`, children: [_jsx("path", { "data-workflow-edge-hit": e.id, role: "button", tabIndex: 0, "aria-label": `连线：${definition.nodes.find(n => n.id === e.from)?.title} → ${definition.nodes.find(n => n.id === e.to)?.title}`, "aria-pressed": selectedEdge === e.id, d: path, fill: "none", stroke: "transparent", strokeWidth: 18, style: { pointerEvents: 'stroke', cursor: 'pointer' }, onClick: () => onSelectEdge?.(e.id), onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    onSelectEdge?.(e.id);
                                                } } }), _jsx("path", { "data-workflow-edge": e.id, d: path, fill: "none", stroke: selectedEdge === e.id ? '#2470b5' : color, strokeWidth: selectedEdge === e.id ? 3 : chosen ? 2.5 : 1.5, strokeDasharray: returning ? '6 4' : e.kind === 'choice' && !chosen ? '3 4' : undefined, markerEnd: "url(#rt-flow-arrow)" }), _jsx("text", { x: labelX, y: labelY, fontSize: "11", fill: color, textAnchor: "middle", children: returning ? '返回下一轮' : e.label ?? '' })] }, e.id);
                                }), link && _jsx("path", { "data-workflow-preview-line": "", d: `M ${position(link.from).x + 220} ${position(link.from).y + 58} L ${link.x} ${link.y}`, fill: "none", stroke: "#2470b5", strokeWidth: 2, strokeDasharray: "5 4" })] }), definition.nodes.map(n => {
                            const p = position(n.id), v = views.find(v => v.nodeId === n.id), color = workflowColor(v?.status);
                            return _jsxs("div", { style: { position: 'absolute', left: p.x, top: p.y, width: 220, height: 124 }, children: [_jsxs("button", { type: "button", "data-workflow-node": n.id, "aria-label": `${n.title}，${workflowLabels[v?.status ?? 'not_started']}`, "aria-pressed": selected === n.id, style: { position: 'absolute', inset: 0, width: 220, height: 124, overflow: 'hidden', boxSizing: 'border-box', padding: 14, textAlign: 'left', font: 'inherit', color: 'inherit', background: 'var(--dsw-alias-bg-base,white)', border: `${selected === n.id ? 2 : 1}px solid ${selected === n.id ? '#2470b5' : 'var(--dsw-alias-border-l2,#d4d9df)'}`, borderRadius: 12, boxShadow: '0 3px 8px #00000008', touchAction: 'none', cursor: readOnly ? 'default' : 'grab', overflowWrap: 'anywhere' }, onClick: () => onSelect(n.id), onPointerDown: e => { if (e.button !== 0 || readOnly)
                                            return; automatic.current = false; onSelect(n.id); e.currentTarget.setPointerCapture(e.pointerId); const raw = workflowPosition(definition, n.id); drag.current = { id: n.id, x: e.clientX, y: e.clientY, atX: raw.x, atY: raw.y, pointerId: e.pointerId }; }, onPointerMove: e => { const d = drag.current; if (d?.id === n.id && d.pointerId === e.pointerId)
                                            onMove(n.id, Math.max(0, Math.round(d.atX + (e.clientX - d.x) / zoom)), Math.max(0, Math.round(d.atY + (e.clientY - d.y) / zoom))); }, onPointerUp: () => { drag.current = undefined; }, onPointerCancel: () => { drag.current = undefined; }, onKeyDown: e => { const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }; const step = delta[e.key]; if (step && e.altKey && !readOnly) {
                                            e.preventDefault();
                                            automatic.current = false;
                                            const raw = workflowPosition(definition, n.id);
                                            onMove(n.id, Math.max(0, raw.x + step[0]), Math.max(0, raw.y + step[1]));
                                        } }, children: [_jsxs("small", { style: { color, display: 'block', marginBottom: 7 }, children: [n.kind === 'join' ? '◇ 汇合与选择' : n.kind === 'minutes' ? '▤ 会议秘书' : '● 成员处理', v?.loopId ? ` · 第${v.round}轮` : ''] }), _jsx("strong", { style: { display: 'block', fontSize: 14, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: n.title }), _jsx("span", { style: { display: 'block', fontSize: 11, color: '#78818c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: n.memberIds.map(id => members.find(m => m.id === id)?.name ?? id).join('、') || (n.kind === 'minutes' ? '独立秘书，只读整理' : '脚本判断，不调用模型') }), _jsxs("span", { style: { display: 'block', marginTop: 8, color, fontSize: 12 }, children: [workflowLabels[v?.status ?? 'not_started'], v && v.required > 0 ? ` · ${v.submitted}/${v.required}` : ''] })] }), !readOnly && _jsxs(_Fragment, { children: [_jsx("button", { type: "button", "data-workflow-in": n.id, "aria-label": `接收点：${n.title}`, title: "\u4ECE\u53E6\u4E00\u4E2A\u73AF\u8282\u53F3\u4FA7\u5706\u70B9\u62D6\u5230\u8FD9\u91CC\uFF1B\u4E5F\u53EF\u5148\u70B9\u53D1\u9001\u70B9\uFF0C\u518D\u70B9\u8FD9\u91CC\u3002", disabled: !!locked(n.id), onClick: () => finish(n.id), style: { position: 'absolute', left: -10, top: 48, width: 20, height: 20, borderRadius: '50%', border: '2px solid #2470b5', background: 'var(--dsw-alias-bg-base,white)', padding: 0, cursor: 'crosshair', zIndex: 2 } }), _jsx("button", { type: "button", "data-workflow-out": n.id, "aria-label": `发送点：${n.title}`, title: "\u62D6\u5230\u4E0B\u4E00\u73AF\u8282\u7684\u5DE6\u4FA7\u5706\u70B9\u5EFA\u7ACB\u8FDE\u7EBF\uFF1B\u4EC5\u7F16\u8F91\uFF0C\u4E0D\u6267\u884C\u3002", disabled: !!locked(n.id), style: { position: 'absolute', right: -10, top: 48, width: 20, height: 20, borderRadius: '50%', border: '2px solid #2470b5', background: '#dceafa', padding: 0, cursor: 'crosshair', touchAction: 'none', zIndex: 2 }, onPointerDown: e => { if (e.button !== 0)
                                                    return; e.stopPropagation(); begin(n.id, e.clientX, e.clientY); e.currentTarget.setPointerCapture(e.pointerId); }, onPointerMove: e => { if (!linkRef.current)
                                                    return; const rect = surface.current?.getBoundingClientRect(); if (rect)
                                                    setLink({ from: linkRef.current.from, x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom }); }, onPointerUp: e => { const start = linkRef.current; if (!start)
                                                    return; const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-workflow-in]')?.getAttribute('data-workflow-in'); if (e.currentTarget.hasPointerCapture(e.pointerId))
                                                    e.currentTarget.releasePointerCapture(e.pointerId); if (target)
                                                    finish(target);
                                                else if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 6)
                                                    clear(); }, onPointerCancel: clear, onClick: e => { if (e.detail === 0)
                                                    begin(n.id, 0, 0); } })] })] }, n.id);
                        })] }) })] });
}
