import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { localScopeId, scopedLocal, uiButton as button } from "./ui-state.js";
import { collectLegacyDrafts, recoveryContent } from "./legacy-draft-model.js";
export function LegacyDrafts({ onImported, meetings: provided = [], requestOpen = 0 }) {
    const owner = useRef(localScopeId()).current, { readLocal, writeLocal } = scopedLocal(owner);
    const [dismissed, setDismissed] = useState(() => readLocal('legacy-recovery-dismissed', false)), [open, setOpen] = useState(false), [meetings, setMeetings] = useState(provided);
    const [selected, setSelected] = useState(), [ownership, setOwnership] = useState(false), [notice, setNotice] = useState('');
    const [handled, setHandled] = useState(() => readLocal('legacy-recovery-handled', {}));
    const focus = useRef(), dialog = useRef(null);
    useEffect(() => { if (provided.length)
        setMeetings(provided); }, [provided]);
    useEffect(() => { if (provided.length || !open)
        return; let alive = true; void fetch('/plugins/round-table/meetings?view=summary').then(r => { if (!r.ok)
        throw Error('无法读取会议名称'); return r.json(); }).then(v => { if (alive && owner === localScopeId())
        setMeetings(v.meetings ?? []); }).catch(() => { if (alive)
        setNotice('暂时无法确认所属会议，可以先预览或复制正文。'); }); return () => { alive = false; }; }, [open]);
    useEffect(() => { if (requestOpen) {
        setOpen(true);
        setNotice('');
    } }, [requestOpen]);
    useEffect(() => { if (open)
        dialog.current?.focus(); }, [open]);
    let entries = [];
    try {
        entries = collectLegacyDrafts(localStorage, meetings);
    }
    catch { /* Parent persistence notice covers storage access errors. */ }
    const fingerprint = (entry) => JSON.stringify(entry.values);
    const unhandled = entries.filter(e => handled?.[e.id] !== fingerprint(e));
    const entry = entries.find(e => e.id === selected);
    const close = () => { setOpen(false); setSelected(undefined); setOwnership(false); focus.current?.focus(); };
    const restore = () => {
        if (!entry || !owner || owner !== localScopeId() || !ownership || !entry.knownMeeting || entry.recoveryBlocked)
            return;
        try {
            if (entry.values.some(v => { const raw = localStorage.getItem(`round-table.${owner}.${v.key}`), current = raw === null ? undefined : JSON.parse(raw); return !!recoveryContent(current) || (v.key.endsWith('.pending') || v.key.startsWith('editor-save.')) && !!current; })) {
                setNotice('当前已有编辑内容或待核实请求，已保留原稿。请先处理当前草稿，或复制这份旧内容。');
                return;
            }
        }
        catch {
            setNotice('当前草稿无法读取或格式损坏，暂不覆盖。原记录仍在，可以先复制正文。');
            return;
        }
        const ordered = [...entry.values].sort((a, b) => Number(b.key.endsWith('.pending') || b.key.startsWith('editor-save.')) - Number(a.key.endsWith('.pending') || a.key.startsWith('editor-save.')));
        let restoredRequest = false;
        for (const value of ordered) {
            if (!writeLocal(value.key, value.value)) {
                setNotice('未能完整保存恢复内容。原记录仍在；请保留此窗口并复制正文，勿另起发送。');
                if (restoredRequest)
                    onImported(entry);
                return;
            }
            if (value.key.endsWith('.pending') || value.key.startsWith('editor-save.'))
                restoredRequest = true;
        }
        // A copied uncertain request is still unresolved. Only confirmed ordinary or known-outcome recovery closes its reminder.
        if (!entry.pending || entry.outcome === 'completed' || entry.outcome === 'rejected') {
            const next = { ...handled, [entry.id]: fingerprint(entry) };
            setHandled(next);
            writeLocal('legacy-recovery-handled', next);
        }
        setNotice(entry.pending ? entry.outcome === 'completed' ? '已恢复成功凭据，原会议只需完成本地草稿清理，不会再次提交。' : entry.outcome === 'rejected' ? '已恢复拒绝凭据，原会议只需完成本地草稿恢复，不会再次提交。' : '已恢复原请求，请在原会议核实接收状态；没有自动发送。' : `已恢复到「${entry.meetingTitle}」的${entry.label}，仍未发送。`);
        onImported(entry);
    };
    return _jsxs(_Fragment, { children: [!dismissed && unhandled.length > 0 && _jsxs("div", { "data-legacy-recovery-notice": "", style: { flex: 'none', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }, children: [_jsx("span", { children: unhandled.every(e => e.pending) ? '仍有原发送结果需要核实' : '发现之前写过的内容' }), _jsx("button", { style: button, onClick: e => { focus.current = e.currentTarget; setOpen(true); setNotice(''); }, children: "\u627E\u56DE\u65E7\u8349\u7A3F" }), _jsx("button", { style: { ...button, border: 0 }, onClick: () => { writeLocal('legacy-recovery-dismissed', true); setDismissed(true); }, children: "\u7A0D\u540E\u63D0\u9192" })] }), open && _jsx("div", { style: { position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.25)', padding: 16 }, children: _jsxs("section", { ref: dialog, role: "dialog", "aria-modal": "true", "aria-label": "\u627E\u56DE\u65E7\u8349\u7A3F", tabIndex: -1, onKeyDown: e => { if (e.key === 'Escape') {
                        e.preventDefault();
                        close();
                    } if (e.key === 'Tab') {
                        const list = dialog.current?.querySelectorAll('button:not(:disabled),input:not(:disabled)');
                        if (list?.length) {
                            const first = list[0], last = list[list.length - 1];
                            if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
                                e.preventDefault();
                                last.focus();
                            }
                            else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
                                e.preventDefault();
                                first.focus();
                            }
                        }
                    } }, style: { background: 'var(--dsw-alias-bg-base)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: 16, maxWidth: 700, width: '100%', maxHeight: '82vh', overflow: 'auto', boxSizing: 'border-box' }, children: [_jsxs("header", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("b", { children: "\u627E\u56DE\u4E4B\u524D\u5199\u7684\u5185\u5BB9" }), _jsx("button", { style: button, onClick: close, children: "\u5173\u95ED\u8349\u7A3F\u6062\u590D" })] }), _jsx("p", { children: "\u8FD9\u91CC\u662F\u65E7\u7248\u672C\u4E2D\u5C1A\u672A\u5904\u7406\u7684\u6587\u5B57\u548C\u7F16\u8F91\u5185\u5BB9\u3002\u67E5\u770B\u3001\u590D\u5236\u6216\u7A0D\u540E\u5904\u7406\u90FD\u4E0D\u4F1A\u53D1\u9001\u7ED9\u6210\u5458\uFF1B\u539F\u5185\u5BB9\u4FDD\u7559\u3002" }), !entries.length && _jsx("p", { children: "\u6CA1\u6709\u53EF\u6062\u590D\u7684\u65E7\u8349\u7A3F\u3002\u7A7A\u8349\u7A3F\u548C\u9875\u9762\u663E\u793A\u504F\u597D\u4E0D\u9700\u8981\u6062\u590D\u3002" }), entries.map(e => _jsxs("article", { "data-recovery-entry": e.kind, style: { borderTop: '1px solid var(--dsw-alias-border-l2)', padding: '10px 0' }, children: [_jsxs("b", { children: [e.meetingTitle, " \u00B7 ", e.label] }), _jsxs("p", { style: { margin: '5px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: [e.text.slice(0, 130), e.text.length > 130 ? '…' : ''] }), e.recipientNames.length > 0 && _jsxs("small", { children: ["\u539F\u63A5\u6536\u4EBA\uFF1A", e.recipientNames.join('、')] }), e.pending && _jsx("p", { role: "status", children: e.outcome === 'completed' ? '操作已明确成功，仅本地草稿清理未完成；原成功凭据与正文成组保留。' : e.outcome === 'rejected' ? '操作已明确拒绝，仅本地草稿恢复未完成；原拒绝凭据与正文成组保留。' : '曾尝试发送，结果未确认。这不是一份普通的未发送草稿；正文与原请求已关联。' }), _jsx("button", { style: button, onClick: () => { setSelected(e.id); setOwnership(false); setNotice(''); }, children: "\u9884\u89C8\u8FD9\u4EFD\u5185\u5BB9" })] }, e.id)), entry && _jsxs("section", { "aria-label": "\u65E7\u8349\u7A3F\u5185\u5BB9\u9884\u89C8", style: { border: '1px solid var(--dsw-alias-border-l2)', padding: 12, borderRadius: 8 }, children: [_jsxs("b", { children: [entry.meetingTitle, " \u00B7 ", entry.label] }), _jsx("p", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 220, overflow: 'auto' }, children: entry.text }), _jsx("button", { style: button, onClick: () => { void (async () => { try {
                                        await navigator.clipboard.writeText(entry.text);
                                        setNotice('正文已复制，可以自行保留或继续编辑；没有发送。');
                                    }
                                    catch {
                                        setNotice('复制失败，请选中预览正文手动复制。');
                                    } })(); }, children: "\u590D\u5236\u6B63\u6587" }), !entry.knownMeeting ? _jsx("p", { children: "\u6240\u5C5E\u4F1A\u8BAE\u5C1A\u672A\u786E\u8BA4\uFF1B\u73B0\u5728\u53EA\u63D0\u4F9B\u9884\u89C8\u6216\u590D\u5236\uFF0C\u4E0D\u4F1A\u628A\u539F\u8BF7\u6C42\u6062\u590D\u5230\u5176\u4ED6\u4F1A\u8BAE\u3002" }) : entry.recoveryBlocked ? _jsx("p", { children: entry.recoveryBlocked }) : _jsxs(_Fragment, { children: [_jsxs("label", { style: { display: 'block', marginTop: 8 }, children: [_jsx("input", { type: "checkbox", checked: ownership, onChange: e => setOwnership(e.target.checked) }), "\u6211\u786E\u8BA4\u8FD9\u4EFD\u5185\u5BB9\u5C5E\u4E8E\u5F53\u524D\u4F1A\u8BAE\u5E93\u4E2D\u7684\u300C", entry.meetingTitle, "\u300D"] }), entry.pending && _jsx("p", { children: entry.outcome === 'completed' || entry.outcome === 'rejected' ? '恢复保留已明确的结果凭据，仅处理本地草稿，不再次提交。' : '恢复仅保留原发送身份，仍须核实送达；不会新建或自动重发。' }), _jsx("button", { style: button, disabled: !ownership, onClick: restore, children: entry.pending ? entry.outcome === 'completed' || entry.outcome === 'rejected' ? '恢复本地清理记录' : '恢复原请求供核实' : '恢复继续编辑' })] })] }), notice && _jsx("p", { role: "status", children: notice }), _jsxs("footer", { children: [_jsx("button", { style: button, onClick: () => { writeLocal('legacy-recovery-dismissed', true); setDismissed(true); close(); }, children: "\u7A0D\u540E\u5904\u7406" }), _jsx("small", { children: "\u4EE5\u540E\u53EF\u5728\u4F1A\u8BAE\u8BBE\u7F6E\u4E2D\u6253\u5F00\u201C\u627E\u56DE\u65E7\u8349\u7A3F\u201D\u3002" })] })] }) })] });
}
