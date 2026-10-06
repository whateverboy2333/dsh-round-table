import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { isValidElement, useEffect, useRef } from 'react';
import { uiButton, uiInput } from "./ui-state.js";
/** Compact hierarchy only: the owning WorkflowPanel retains all state, business conditions and handlers. */
export function WorkflowToolbar({ view, onViewChange, historyValue, historyOptions, onHistoryChange, viewingNote, historical = false, readOnly = false, configurationStatus, configurationTone = 'unavailable', configurationActions, runStatus, runNote, collaborationControls, primaryAction, runOperations, runtimeDetails, readOnlyReturn, }) {
    const menu = useRef(null), summary = useRef(null);
    const mutable = !historical && !readOnly;
    const primary = mutable && isValidElement(primaryAction) && primaryAction.type === 'button' ? primaryAction : null;
    const closeMenu = (restoreFocus = false) => { if (!menu.current?.open)
        return; menu.current.open = false; if (restoreFocus)
        summary.current?.focus(); };
    useEffect(() => {
        if (typeof document === 'undefined')
            return;
        const outside = (event) => { if (menu.current?.open && !menu.current.contains(event.target))
            closeMenu(); };
        document.addEventListener('pointerdown', outside, true);
        return () => document.removeEventListener('pointerdown', outside, true);
    }, []);
    useEffect(() => { closeMenu(); }, [historyValue, historical, readOnly, view]);
    const segmentStyle = (selected) => ({
        ...uiButton, padding: '4px 9px', border: 0, borderRadius: 6,
        background: selected ? 'var(--dsw-alias-bg-base)' : 'transparent',
        boxShadow: selected ? '0 0 0 1px var(--dsw-alias-border-l2)' : undefined,
        fontWeight: selected ? 600 : 400,
    });
    return _jsxs("section", { className: "rt-workflow-toolbar", "data-workflow-toolbar": "", children: [_jsx("style", { children: WORKFLOW_TOOLBAR_CSS }), _jsxs("div", { className: "rt-workflow-view-row", children: [_jsxs("div", { className: "rt-workflow-viewing", children: [_jsxs("label", { className: "rt-workflow-view-field", children: [_jsx("span", { children: "\u6B63\u5728\u67E5\u770B" }), _jsx("select", { "aria-label": "\u6B63\u5728\u67E5\u770B", style: { ...uiInput, padding: '5px 8px' }, value: historyValue, onChange: e => onHistoryChange(e.target.value), children: historyOptions.map(option => _jsx("option", { value: option.value, disabled: option.disabled, children: option.label }, option.value)) })] }), (viewingNote || historical || readOnly) && _jsxs("div", { className: "rt-workflow-view-note", children: [historical ? _jsx("span", { className: "rt-workflow-read-only", children: "\u5386\u53F2\u8BB0\u5F55 \u00B7 \u53EA\u8BFB" }) : readOnly ? _jsx("span", { className: "rt-workflow-read-only", children: "\u5F53\u524D\u4F1A\u8BAE \u00B7 \u53EA\u8BFB" }) : null, viewingNote && _jsx("span", { children: viewingNote })] })] }), _jsxs("div", { className: "rt-workflow-display", children: [_jsx("span", { children: "\u663E\u793A\u65B9\u5F0F" }), _jsxs("div", { className: "rt-workflow-segments", role: "group", "aria-label": "\u663E\u793A\u65B9\u5F0F", children: [_jsx("button", { type: "button", style: segmentStyle(view === 'sequence'), "aria-pressed": view === 'sequence', onClick: () => onViewChange('sequence'), children: "\u6B65\u9AA4\u5217\u8868" }), _jsx("button", { type: "button", style: segmentStyle(view === 'graph'), "aria-pressed": view === 'graph', onClick: () => onViewChange('graph'), children: "\u6D41\u7A0B\u56FE" })] })] })] }), mutable && _jsxs("section", { className: "rt-workflow-configuration-band", "aria-label": "\u6D41\u7A0B\u914D\u7F6E", "data-configuration-tone": configurationTone, children: [_jsxs("div", { className: "rt-workflow-configuration-copy", children: [_jsx("strong", { children: "\u6D41\u7A0B\u914D\u7F6E" }), _jsx("span", { className: "rt-workflow-configuration-status", role: "status", children: configurationStatus }), _jsx("small", { children: "\u4FDD\u5B58\u53EA\u8BB0\u5F55\u5B89\u6392" })] }), configurationActions && _jsx("div", { className: "rt-workflow-configuration-actions", children: configurationActions })] }), _jsxs("section", { className: "rt-workflow-run-band", "aria-label": "\u672C\u8F6E\u8FD0\u884C", children: [_jsxs("div", { className: "rt-workflow-run-copy", children: [_jsx("strong", { children: runStatus }), runNote && _jsx("div", { className: "rt-workflow-run-note", children: runNote })] }), mutable && (collaborationControls || primary || runOperations) && _jsxs("div", { className: "rt-workflow-run-actions", children: [collaborationControls && _jsx("div", { className: "rt-workflow-collaboration-controls", children: collaborationControls }), primary && _jsx("div", { className: "rt-workflow-primary-slot", children: primary }), runOperations && _jsxs("details", { className: "rt-workflow-operation-menu", ref: menu, onKeyDown: e => { if (e.key === 'Escape' && menu.current?.open) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeMenu(true);
                                } }, children: [_jsxs("summary", { ref: summary, children: ["\u8FD0\u884C\u64CD\u4F5C", _jsx("span", { "aria-hidden": "true", children: "\u2304" })] }), _jsx("div", { className: "rt-workflow-operation-items", "aria-label": "\u8FD0\u884C\u64CD\u4F5C\u9009\u9879", onClick: e => { const target = e.target; if (target.closest?.('button,a[href]'))
                                            closeMenu(true); }, children: runOperations })] })] }), !mutable && readOnlyReturn && _jsx("div", { className: "rt-workflow-read-only-return", children: readOnlyReturn })] }), runtimeDetails && _jsx("div", { className: "rt-workflow-runtime-details", children: runtimeDetails })] });
}
export const WORKFLOW_TOOLBAR_CSS = `
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
`;
