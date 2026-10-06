import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useScopedOperations } from "./use-scoped-operations.js";
const style = { font: 'inherit', padding: 6, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, background: 'var(--dsw-alias-bg-base)', color: 'inherit', maxWidth: '100%' };
export function PublishPanel({ meetingId, members, releases, onChanged, initialTarget, open: controlledOpen, onClose }) {
    const { meetingCall, isCurrent } = useScopedOperations();
    const [expanded, setOpen] = useState(!!initialTarget), [sessionId, setSession] = useState(initialTarget?.sessionId ?? ''), [items, setItems] = useState([]), [next, setNext] = useState(), [selected, setSelected] = useState(), [taskId, setTask] = useState(initialTarget?.taskId ?? ''), [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState();
    const modal = controlledOpen !== undefined, open = controlledOpen ?? expanded, [purpose, setPurpose] = useState(initialTarget ? 'task' : 'meeting');
    const dialog = useRef(null), returnFocus = useRef();
    useEffect(() => { if (!modal || !open)
        return; if (typeof document !== 'undefined')
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined; dialog.current?.focus(); return () => returnFocus.current?.focus(); }, [modal, open]);
    const [query, setQuery] = useState(''), [excerpt, setExcerpt] = useState(''), [note, setNote] = useState('');
    const guard = useRef(false), request = useRef();
    const clear = () => { setSelected(undefined); setPreview(false); setExcerpt(''); setNote(''); request.current = undefined; };
    const close = () => { if (guard.current)
        return; setOpen(false); clear(); onClose?.(); returnFocus.current?.focus(); };
    const onDialogKey = (event) => { if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
    } if (event.key !== 'Tab')
        return; const controls = dialog.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'); if (!controls?.length) {
        event.preventDefault();
        dialog.current?.focus();
        return;
    } const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();
        last.focus();
    }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault();
        first.focus();
    } };
    const call = (action, body) => meetingCall(meetingId, action, body);
    const run = async (fn) => { if (guard.current || !isCurrent())
        return; guard.current = true; setBusy(true); setError(undefined); try {
        await fn();
    }
    catch (e) {
        if (isCurrent())
            setError(String(e instanceof Error ? e.message : e));
    }
    finally {
        guard.current = false;
        if (isCurrent())
            setBusy(false);
    } };
    const load = (before) => run(async () => { clear(); const v = await call('publish-candidates', { sessionId, ...(before !== undefined ? { before } : {}) }); if (!isCurrent())
        return; setItems(v.items); setNext(v.nextBefore); });
    const targetTask = modal && purpose === 'meeting' ? '' : taskId;
    const publish = () => run(async () => { if (!selected || !preview || modal && purpose === 'task' && !targetTask)
        return; request.current ??= crypto.randomUUID(); await call('publish-reply', { sessionId, seq: selected.seq, digest: selected.digest, requestId: request.current, confirmed: true, ...(excerpt !== selected.text ? { excerpt } : {}), ...(note.trim() ? { note } : {}), ...(targetTask ? { taskId: targetTask } : {}) }); if (!isCurrent())
        return; clear(); setOpen(false); onClose?.(); returnFocus.current?.focus(); try {
        await onChanged();
    }
    catch (e) {
        if (isCurrent())
            setError(`公开已接受，列表刷新失败，请刷新查看，无需重复公开：${String(e)}`);
    } });
    const tasks = releases.flatMap(r => r.tasks.map(t => ({ ...t, instruction: r.instruction }))).filter(t => t.toSessionId === sessionId && t.attempts !== 0 && ['delivered', 'in_progress', 'uncertain', 'failed'].includes(t.status));
    if (modal && !open)
        return null;
    const content = _jsxs("section", { ref: dialog, role: modal ? 'dialog' : undefined, "aria-modal": modal ? true : undefined, "aria-label": modal ? '导入成员回复' : undefined, tabIndex: modal ? -1 : undefined, onKeyDown: modal ? onDialogKey : undefined, className: modal ? 'rt-import-dialog' : undefined, style: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, fontSize: 12, ...(modal ? { background: 'var(--dsw-alias-bg-base)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: 16, width: 'min(660px,100%)', maxHeight: '88vh', overflow: 'auto', boxSizing: 'border-box' } : {}) }, children: [modal ? _jsxs("header", { style: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }, children: [_jsx("h3", { style: { margin: 0 }, children: "\u5BFC\u5165\u6210\u5458\u56DE\u590D" }), _jsx("button", { style: style, disabled: busy, onClick: close, children: "\u53D6\u6D88\u5BFC\u5165" })] }) : _jsx("button", { style: style, disabled: busy, onClick: () => { setOpen(!open); clear(); }, children: open ? '关闭人工发布' : '从原会话发布 / 补交结果' }), open && _jsxs(_Fragment, { children: [_jsxs("p", { style: { margin: 0 }, children: [modal ? '从成员原窗口选择回复，加入本会资料；不会通知其他成员。打开此窗口不会读取原会话，请先选择成员并主动读取。' : '只读取你选择的原会话回复；先预览再确认。', "\u4E0D\u4F1A\u81EA\u52A8\u516C\u5F00\u601D\u8003\u6216\u5DE5\u5177\u65E5\u5FD7\u3002\u5355\u6761\u8D85\u8FC7 10 \u4E07\u5B57\u7B26\u7684\u56DE\u590D\u4E0D\u5217\u5165\u5019\u9009\u3002"] }), _jsxs("select", { "aria-label": "\u6765\u6E90\u6210\u5458", style: style, value: sessionId, disabled: busy, onChange: e => { setSession(e.target.value); setItems([]); setNext(undefined); setTask(''); clear(); }, children: [_jsx("option", { value: "", children: "\u9009\u62E9\u6765\u6E90\u6210\u5458" }), members.map(m => _jsx("option", { value: m.id, children: m.name }, m.id))] }), _jsx("button", { style: style, disabled: busy || !sessionId, onClick: () => { void load(); }, children: "\u8BFB\u53D6\u8FD1\u671F\u56DE\u590D" }), _jsx("input", { "aria-label": "\u641C\u7D22\u539F\u56DE\u590D", style: style, value: query, onChange: e => setQuery(e.target.value), placeholder: "\u5728\u672C\u9875\u56DE\u590D\u4E2D\u641C\u7D22" }), _jsx("div", { style: { maxHeight: 240, overflow: 'auto' }, children: items.filter(item => !query || item.text.includes(query)).map(item => _jsxs("label", { style: { display: 'block', marginBottom: 7, overflowWrap: 'anywhere' }, children: [_jsx("input", { type: "radio", name: modal ? `import-candidate-${meetingId}` : `publish-${meetingId}`, disabled: busy, checked: selected?.seq === item.seq, onChange: () => { clear(); setSelected(item); setExcerpt(item.text); } }), new Date(item.time).toLocaleString(), " \u00B7 #", item.seq, _jsx("p", { style: { margin: 0, whiteSpace: 'pre-wrap' }, children: item.text.length > 250 ? `${item.text.slice(0, 250)}…（预览可看全文）` : item.text })] }, item.seq)) }), sessionId && !items.length && _jsx("span", { children: "\u5C1A\u65E0\u5019\u9009\uFF1B\u70B9\u51FB\u8BFB\u53D6\uFF0C\u6216\u9009\u62E9\u5176\u4ED6\u6210\u5458\u3002" }), next !== undefined && _jsx("button", { style: style, disabled: busy, onClick: () => { void load(next); }, children: "\u66F4\u65E9\u56DE\u590D" }), modal ? _jsxs("fieldset", { style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 10 }, children: [_jsx("legend", { children: "\u8FD9\u4EFD\u56DE\u590D\u7528\u4E8E" }), _jsxs("label", { style: { display: 'block' }, children: [_jsx("input", { type: "radio", name: `import-purpose-${meetingId}`, "aria-label": "\u52A0\u5165\u672C\u4F1A\u8D44\u6599", checked: purpose === 'meeting', disabled: busy, onChange: () => { setPurpose('meeting'); setPreview(false); request.current = undefined; } }), "\u52A0\u5165\u672C\u4F1A\u8D44\u6599 \u00B7 \u4E0D\u901A\u77E5\u5176\u4ED6\u6210\u5458"] }), _jsxs("label", { style: { display: 'block', marginTop: 7 }, children: [_jsx("input", { type: "radio", name: `import-purpose-${meetingId}`, "aria-label": "\u8865\u4EA4\u5DE5\u4F5C\u4EFB\u52A1\u7ED3\u679C", checked: purpose === 'task', disabled: busy, onChange: () => { setPurpose('task'); setPreview(false); request.current = undefined; } }), "\u8865\u4EA4\u5DE5\u4F5C\u4EFB\u52A1\u7ED3\u679C \u00B7 \u63D0\u4EA4\u540E\u4ECD\u9700\u4E3B\u6301\u4EBA\u9A8C\u6536"] }), purpose === 'task' && _jsxs("select", { "aria-label": "\u8865\u4EA4\u5230\u4EFB\u52A1", style: { ...style, width: '100%', marginTop: 8 }, value: taskId, disabled: busy, onChange: e => { setTask(e.target.value); setPreview(false); request.current = undefined; }, children: [_jsx("option", { value: "", children: "\u9009\u62E9\u8FD9\u4F4D\u6210\u5458\u7684\u4EFB\u52A1" }), tasks.map(t => _jsx("option", { value: t.taskId, children: t.instruction.slice(0, 70) }, t.taskId))] }), purpose === 'task' && !tasks.length && _jsx("p", { children: "\u8FD9\u4F4D\u6210\u5458\u6CA1\u6709\u53EF\u8865\u4EA4\u7684\u4EFB\u52A1\u3002\u53EF\u6539\u4E3A\u52A0\u5165\u672C\u4F1A\u8D44\u6599\u3002" })] }) : _jsxs("select", { "aria-label": "\u53D1\u5E03\u7528\u9014", style: style, value: taskId, disabled: busy, onChange: e => { setTask(e.target.value); setPreview(false); request.current = undefined; }, children: [_jsx("option", { value: "", children: "\u53D1\u5E03\u4E3A\u72EC\u7ACB\u4F1A\u8BAE\u6D88\u606F" }), tasks.map(t => _jsxs("option", { value: t.taskId, children: ["\u8865\u4EA4\uFF1A", t.instruction.slice(0, 35), " \u00B7 ", t.taskId] }, t.taskId))] }), _jsx("button", { style: style, disabled: busy || !selected || modal && purpose === 'task' && !taskId, onClick: () => setPreview(true), children: modal ? '预览将加入的内容' : '预览将公开的内容' }), selected && _jsxs(_Fragment, { children: [_jsxs("label", { children: ["\u516C\u5F00\u5168\u6587\u6216\u8FDE\u7EED\u7247\u6BB5", _jsx("textarea", { "aria-label": "\u516C\u5F00\u7247\u6BB5", rows: 4, style: { ...style, width: '100%', boxSizing: 'border-box' }, value: excerpt, onChange: e => { setExcerpt(e.target.value); setPreview(false); request.current = undefined; } })] }), _jsxs("label", { children: ["\u4E3B\u6301\u4EBA\u8865\u5145\uFF08\u5355\u72EC\u6807\u6CE8\uFF09", _jsx("textarea", { "aria-label": "\u4E3B\u6301\u4EBA\u8865\u5145", rows: 2, style: { ...style, width: '100%', boxSizing: 'border-box' }, value: note, onChange: e => { setNote(e.target.value); setPreview(false); request.current = undefined; } })] })] }), preview && selected && _jsxs("div", { role: "region", "aria-label": "\u4EBA\u5DE5\u53D1\u5E03\u786E\u8BA4", style: { border: '1px solid var(--dsw-alias-border-l2)', padding: 8, overflowWrap: 'anywhere' }, children: [_jsxs("b", { children: [targetTask ? '补交到任务' : '加入本会资料', " \u00B7 \u6765\u6E90\uFF1A", members.find(m => m.id === sessionId)?.name, "\u539F\u7A97\u53E3 \u00B7 \u56DE\u590D #", selected.seq] }), targetTask && _jsxs("p", { children: ["\u4EFB\u52A1\uFF1A", tasks.find(t => t.taskId === targetTask)?.instruction, "\u3002\u8865\u4EA4\u662F\u63D0\u4EA4\u7ED3\u679C\uFF0C\u5C1A\u4E0D\u4EE3\u8868\u9A8C\u6536\u901A\u8FC7\u3002"] }), _jsxs("p", { style: { whiteSpace: 'pre-wrap' }, children: [excerpt, note.trim() ? `\n\n【主持人补充】\n${note}` : ''] }), _jsx("p", { children: "\u786E\u8BA4\u540E\u4F1A\u6210\u4E3A\u6B63\u5F0F\u4F1A\u8BAE\u8D44\u6599\uFF0C\u53EF\u4F9B\u540E\u7EED\u9009\u7528\u548C\u79D8\u4E66\u6574\u7406\uFF1B\u4E0D\u4F1A\u901A\u77E5\u6216\u5524\u9192\u5176\u4ED6\u6210\u5458\u3002\u539F\u56DE\u590D\u8EAB\u4EFD\u548C\u5185\u5BB9\u6821\u9A8C\u4FDD\u7559\u3002" }), _jsx("button", { style: style, disabled: busy, onClick: () => { void publish(); }, children: modal ? targetTask ? '确认导入并补交' : '确认加入本会资料' : `确认公开${taskId ? '并补交' : ''}` }), _jsx("button", { style: style, disabled: busy, onClick: () => setPreview(false), children: "\u53D6\u6D88\u9884\u89C8" })] })] }), error && _jsx("p", { role: "alert", children: error })] });
    return modal ? _jsx("div", { className: "rt-import-overlay", style: { position: 'fixed', inset: 0, zIndex: 110, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.28)', padding: 16 }, children: content }) : content;
}
