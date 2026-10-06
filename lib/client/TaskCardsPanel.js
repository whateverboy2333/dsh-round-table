import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { scopedLocal, localScopeId, uiButton as button, uiInput as input } from "./ui-state.js";
/** The key fences late responses and drafts when switching meetings or DSH homes. */
export function TaskCardsPanel(props) { const scope = localScopeId(); return props.open ? _jsx(TaskCardsDialog, { ...props }, `${scope ?? 'unknown'}:${props.meetingId}`) : null; }
export function TaskCardsDialog({ meetingId, readOnly = false, onClose, cards = [], generations = [], publications = [], discussions = [], members, onChanged, onOpenMember }) {
    const scope = useRef(localScopeId()).current, { readLocal, writeLocal, meetingCall } = scopedLocal(scope), draftKey = `task-cards-editor.${meetingId}`, pendingKey = `task-cards-pending.${meetingId}`;
    const [editor, setEditor] = useState(() => readLocal(draftKey, undefined)), [selected, setSelected] = useState([]), [pending, setPending] = useState(() => readLocal(pendingKey, undefined)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false), [approval, setApproval] = useState([]), [notice, setNotice] = useState('');
    const guard = useRef(false), alive = useRef(true), dialog = useRef(null), focusReturn = useRef();
    useEffect(() => { alive.current = true; if (typeof document !== 'undefined') {
        focusReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
        dialog.current?.focus();
    } return () => { alive.current = false; focusReturn.current?.focus(); }; }, []);
    const name = (id) => members.find(x => x.id === id)?.name ?? (id ? '已离会成员' : '待确认');
    const batch = (c) => { const n = generations.filter(g => g.kind === 'generate').findIndex(g => g.id === c.generationId); return n < 0 ? '历史生成' : `第${n + 1}次生成`; };
    const edit = (next) => { if (readOnly || guard.current || pending)
        return; if (!writeLocal(draftKey, next)) {
        setError('无法保存本地编辑，请保留正文；尚未发送修改');
        return;
    } setEditor(next); setNotice(''); };
    const choose = (c) => { if (readOnly) {
        setEditor({ cardId: c.id, expectedVersion: c.version, title: c.title, body: c.body, assigneeSessionId: c.assigneeSessionId ?? '', note: '' });
        return;
    } if (editor && (editor.title !== cards.find(x => x.id === editor.cardId)?.title || editor.body !== cards.find(x => x.id === editor.cardId)?.body || editor.assigneeSessionId !== (cards.find(x => x.id === editor.cardId)?.assigneeSessionId ?? '') || !!editor.note.trim())) {
        setError('当前正文尚未保存，请先保存本卡；切换不会覆盖它');
        return;
    } edit({ cardId: c.id, expectedVersion: c.version, title: c.title, body: c.body, assigneeSessionId: c.assigneeSessionId ?? '', note: '' }); };
    const send = async (request) => { if (readOnly || guard.current)
        return; guard.current = true; setBusy(true); setError(''); try {
        const result = await meetingCall(meetingId, request.action, { ...request.body, requestId: request.requestId });
        let next;
        if (request.action === 'task-card-edit' || request.action === 'task-card-adopt') {
            const c = (result.card ?? result);
            if (!c.id || !c.version)
                throw Error('服务器修改回执缺少任务卡版本');
            next = { cardId: c.id, expectedVersion: c.version, title: c.title, body: c.body, assigneeSessionId: c.assigneeSessionId ?? '', note: '' };
            if (!writeLocal(draftKey, next))
                throw Error('修改已响应但本地正文未能保存，保留原请求核对');
        }
        if (!writeLocal(pendingKey, undefined))
            throw Error('操作已响应，但本地回执未能收尾；请用原请求核对');
        if (alive.current) {
            setPending(undefined);
            if (next)
                setEditor(next);
            setNotice(request.action === 'task-card-publish' ? '选定卡片已发布，已进入责任成员通知队列；投递与执行状态见成员工作日志。' : request.label + '已记录。生成或调整不会自动执行任务。');
            setConfirm(false);
            await onChanged();
        }
    }
    catch (e) {
        const x = e;
        if (x.requestState === 'rejected' && writeLocal(pendingKey, undefined) && alive.current)
            setPending(undefined);
        if (alive.current)
            setError(x.message + (x.requestState === 'rejected' ? '' : '；结果待核实，请保留原请求重试，勿新建同次操作'));
    }
    finally {
        guard.current = false;
        if (alive.current)
            setBusy(false);
    } };
    const begin = (action, body, label) => { if (readOnly || guard.current || pending)
        return; const next = { requestId: crypto.randomUUID(), action, body: structuredClone(body), label }; if (!writeLocal(pendingKey, next)) {
        setError('本地存储不可用，无法保留原请求；尚未发送');
        return;
    } setPending(next); void send(next); };
    const save = () => { if (!editor)
        return; begin('task-card-edit', { cardId: editor.cardId, expectedVersion: editor.expectedVersion, title: editor.title, body: editor.body, assigneeSessionId: editor.assigneeSessionId || undefined }, '修改'); };
    const publishable = cards.filter(c => selected.includes(c.id) && !publications.some(p => p.cards.some(v => v.cardId === c.id && v.version === c.version)));
    const selectedCard = editor ? cards.find(c => c.id === editor.cardId) : undefined;
    const dirty = !!editor && !!selectedCard && (editor.title !== selectedCard.title || editor.body !== selectedCard.body || editor.assigneeSessionId !== (selectedCard.assigneeSessionId ?? ''));
    const statusNames = { queued: '等待原成员', delivering: '投递中', delivered: '已接收，等待卡片', offline: '原成员未连接', failed: '投递失败', uncertain: '送达待核实', cancelled: '等待已结束' };
    const retry = (d, sid) => begin('discussion-retry', { discussionId: d.id, sessionId: sid }, '重试原生成请求');
    return _jsxs("div", { style: { position: 'absolute', inset: 8, zIndex: 2200, background: 'var(--dsw-alias-bg-base)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, boxShadow: '0 10px 50px #0003', display: 'flex', flexDirection: 'column', overflow: 'hidden' }, role: "dialog", "aria-modal": "true", "aria-label": "\u4EFB\u52A1\u5361\u751F\u6210\u4E0E\u4FEE\u6539", tabIndex: -1, ref: dialog, onKeyDown: e => { if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        } if (e.key === 'Tab') {
            const nodes = [...(dialog.current?.querySelectorAll('button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]') ?? [])].filter(x => x.getClientRects().length);
            const first = nodes[0], last = nodes.at(-1);
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        } }, children: [_jsxs("header", { style: { display: 'flex', gap: 8, alignItems: 'center', padding: 12, borderBottom: '1px solid var(--dsw-alias-border-l2)' }, children: [_jsx("strong", { style: { flex: 1 }, children: "\u4EFB\u52A1\u5361\u751F\u6210\u4E0E\u4FEE\u6539" }), _jsx("button", { style: button, onClick: onClose, children: "\u5173\u95ED" })] }), _jsxs("div", { style: { padding: 12, overflow: 'auto', minHeight: 0, flex: 1 }, children: [readOnly && _jsx("p", { role: "status", children: "\u4F1A\u8BAE\u5DF2\u5F52\u6863\uFF0C\u4EC5\u67E5\u770B\u5386\u53F2\uFF1B\u4FEE\u6539\u3001\u8C03\u6574\u3001\u91CD\u8BD5\u4E0E\u53D1\u5E03\u5747\u6682\u505C\u3002" }), _jsx("p", { children: "\u7531\u4F60\u5DF2@\u7684\u539F\u6210\u5458\u63D0\u51FA\u540E\u7EED\u5DE5\u4F5C\u3002\u751F\u6210\u8005\u4E0E\u6267\u884C\u8005\u5206\u522B\u663E\u793A\uFF1B\u751F\u6210\u548C\u4FEE\u6539\u5C5E\u4E8E\u51C6\u5907\u5DE5\u4F5C\uFF0C\u786E\u8BA4\u53D1\u5E03\u540E\u624D\u901A\u77E5\u6267\u884C\u3002" }), pending && _jsxs("div", { role: "status", children: [pending.label, "\u7684\u539F\u8BF7\u6C42\u5F85\u6838\u5B9E\uFF0C\u91CD\u5F00\u540E\u4ECD\u4FDD\u7559\u3002", _jsx("button", { style: button, disabled: readOnly || busy, onClick: () => void send(pending), children: "\u6838\u5BF9\u5E76\u91CD\u8BD5\u539F\u8BF7\u6C42" })] }), error && _jsx("p", { role: "alert", style: { color: 'var(--dsw-alias-error-primary,#b42318)' }, children: error }), notice && _jsx("p", { role: "status", children: notice }), generations.length === 0 && _jsx("p", { children: "\u8BF7\u5728\u8BA8\u8BBA\u8F93\u5165\u533A@\u539F\u6210\u5458\uFF0C\u70B9\u51FB\u300C\u4EFB\u52A1\u5361\u751F\u6210\u300D\u3002\u53EF\u4EE5\u4E0D\u586B\u5199\u989D\u5916\u6B63\u6587\u3002" }), generations.map(g => _jsxs("section", { style: { borderBottom: '1px solid var(--dsw-alias-border-l2)', padding: '8px 0' }, children: [_jsx("strong", { children: g.kind === 'adjust' ? '指定卡片调整' : '后续工作生成' }), g.recipientIds.map(sid => { const response = g.responses.find(x => x.sessionId === sid), d = discussions.find(x => x.id === g.discussionId), delivery = d?.deliveries.find(x => x.toSessionId === sid); return _jsxs("div", { children: [_jsx("button", { style: button, onClick: () => { onClose(); onOpenMember?.(sid); }, children: name(sid) }), " \u00B7 ", response ? response.emptyReason ? `无待办：${response.emptyReason}` : `已返回${response.cardIds.length}张卡` : statusNames[delivery?.status ?? 'queued'], delivery?.error && _jsxs("span", { role: "status", children: [" \u00B7 ", delivery.error] }), !response && d && ['offline', 'failed', 'uncertain'].includes(delivery?.status ?? '') && _jsx("button", { style: button, disabled: readOnly || busy || !!pending, onClick: () => retry(d, sid), children: "\u91CD\u8BD5\u6B64\u6210\u5458\u539F\u8BF7\u6C42" })] }, sid); })] }, g.id)), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 12, marginTop: 12 }, children: [_jsxs("section", { "aria-label": "\u9010\u9879\u4EFB\u52A1\u5361\u6E05\u5355", children: [cards.map(c => { const published = publications.find(p => p.cards.some(v => v.cardId === c.id && v.version === c.version)); return _jsxs("article", { style: { padding: 10, marginBottom: 8, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }, children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", "aria-label": `选择${c.title}`, checked: selected.includes(c.id), disabled: readOnly || !!published || busy || !!pending, onChange: e => { setConfirm(false); setSelected(v => e.target.checked ? [...v, c.id] : v.filter(x => x !== c.id)); } }), " ", c.title, " \u00B7 v", c.version] }), _jsxs("small", { style: { display: 'block', marginTop: 4 }, children: [batch(c), " \u00B7 ", new Date(c.createdAt).toLocaleString()] }), _jsxs("p", { style: { margin: '6px 0' }, children: ["\u751F\u6210\uFF1A", name(c.generatorSessionId), " \u00B7 \u6267\u884C\uFF1A", name(c.assigneeSessionId)] }), _jsx("button", { style: button, disabled: !readOnly && (busy || !!pending), onClick: () => choose(c), children: "\u67E5\u770B\u5168\u6587\u4E0E\u4FEE\u6539" }), published && _jsxs("p", { children: [published.status === 'published' ? '此版本已发布' : '此版本已批准，写入待核实', published.cards.find(v => v.cardId === c.id)?.relativePath && ` · ${published.cards.find(v => v.cardId === c.id).relativePath}`] })] }, c.id); }), !cards.length && generations.length > 0 && _jsx("p", { children: "\u7B49\u5F85\u5404\u4F4D\u539F\u6210\u5458\u8FD4\u56DE\u5361\u7247\uFF1B\u5176\u4ED6\u6210\u5458\u5931\u8D25\u4E0D\u4F1A\u91CD\u65B0\u751F\u6210\u6210\u529F\u9879\u3002" })] }), editor && _jsxs("section", { "aria-label": "\u4EFB\u52A1\u5361\u6B63\u6587\u7F16\u8F91", children: [_jsxs("label", { children: ["\u540D\u79F0", _jsx("input", { style: input, value: editor.title, disabled: readOnly || busy || !!pending, onChange: e => edit({ ...editor, title: e.target.value }) })] }), _jsxs("p", { children: ["\u7F16\u8F91\u57FA\u4E8E v", editor.expectedVersion, "\uFF0C\u670D\u52A1\u5668\u5F53\u524D v", selectedCard?.version ?? '未知', "\u3002\u5237\u65B0\u4E0D\u4F1A\u66FF\u6362\u6B63\u5728\u7F16\u8F91\u7684\u6B63\u6587\u3002"] }), _jsxs("label", { children: ["\u5B8C\u6574Markdown\u6B63\u6587", _jsx("textarea", { style: { ...input, minHeight: 250, fontFamily: 'inherit' }, value: editor.body, disabled: readOnly || busy || !!pending, onChange: e => edit({ ...editor, body: e.target.value }) })] }), _jsxs("label", { children: ["\u786E\u8BA4\u8D23\u4EFB\u6210\u5458", _jsxs("select", { style: input, value: editor.assigneeSessionId, disabled: readOnly || busy || !!pending, onChange: e => edit({ ...editor, assigneeSessionId: e.target.value }), children: [_jsx("option", { value: "", children: "\u5F85\u786E\u8BA4" }), members.map(m => _jsx("option", { value: m.id, children: m.name }, m.id))] })] }), _jsx("button", { style: button, disabled: readOnly || busy || !!pending || !dirty || !editor.body.trim() || !editor.title.trim(), onClick: save, children: "\u4FDD\u5B58\u672C\u5361\u4FEE\u6539" }), _jsxs("details", { children: [_jsx("summary", { children: "\u5BF9\u7167\u5386\u53F2\u7248\u672C" }), selectedCard?.versions.map(v => _jsxs("div", { children: [_jsxs("strong", { children: ["v", v.version, " \u00B7 ", v.source === 'user' ? '用户修改' : v.source === 'adjustment' ? '采纳调整' : '原成员生成'] }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: v.body })] }, v.version))] }), _jsxs("label", { children: ["\u8BA9\u539F\u751F\u6210\u8005\u8C03\u6574\u672C\u5361", _jsx("textarea", { style: { ...input, minHeight: 60 }, value: editor.note, disabled: readOnly || busy || !!pending, onChange: e => edit({ ...editor, note: e.target.value }) })] }), _jsx("button", { style: button, disabled: readOnly || busy || !!pending || dirty || !editor.note.trim() || !selectedCard, onClick: () => begin('task-card-adjust', { cardId: editor.cardId, expectedVersion: editor.expectedVersion, note: editor.note }, '本卡调整请求'), children: "\u4EA4\u7ED9\u539F\u751F\u6210\u8005\u8C03\u6574\u8FD9\u4E00\u5361" }), dirty && _jsx("p", { children: "\u5148\u4FDD\u5B58\u5F53\u524D\u7F16\u8F91\uFF0C\u518D\u8BF7\u6C42\u8C03\u6574\u6216\u53D1\u5E03\u3002" }), selectedCard?.proposals.filter(p => !p.adoptedVersion).map(p => _jsxs("details", { children: [_jsxs("summary", { children: ["\u8C03\u6574\u5EFA\u8BAE \u00B7 \u57FA\u4E8E v", p.baseVersion, "\uFF08\u4E0D\u4F1A\u8986\u76D6\u5F53\u524D\u6B63\u6587\uFF09"] }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: p.body }), _jsx("button", { style: button, disabled: readOnly || busy || !!pending || dirty || p.baseVersion !== selectedCard.version, onClick: () => begin('task-card-adopt', { cardId: selectedCard.id, proposalId: p.id, expectedVersion: selectedCard.version }, '采纳调整建议'), children: "\u91C7\u7EB3\u6B64\u5EFA\u8BAE\u7248\u672C" }), p.baseVersion !== selectedCard.version && _jsx("p", { children: "\u4F60\u5DF2\u4FEE\u6539\u4E3A\u65B0\u7248\u672C\uFF0C\u8BF7\u5BF9\u7167\u5EFA\u8BAE\u624B\u52A8\u5408\u5E76\uFF0C\u4E0D\u76F4\u63A5\u8986\u76D6\u3002" })] }, p.id))] })] }), publishable.length > 0 && _jsx("section", { style: { paddingTop: 12, borderTop: '1px solid var(--dsw-alias-border-l2)' }, children: !confirm ? _jsxs("button", { style: button, disabled: readOnly || busy || !!pending || dirty, onClick: () => { setApproval(structuredClone(publishable)); setConfirm(true); }, children: ["\u6838\u5BF9\u9009\u5B9A\u7684", publishable.length, "\u5F20\u5361"] }) : _jsxs("div", { children: [_jsx("p", { children: "\u4EC5\u53D1\u5E03\u4EE5\u4E0B\u7248\u672C\uFF0C\u5199\u5165\u672C\u4F1A\u6587\u4EF6\u5939\u6210\u529F\u540E\u901A\u77E5\u6240\u5217\u8D23\u4EFB\u6210\u5458\u6267\u884C\u3002\u672A\u9009\u4E2D\u7684\u5361\u4E0D\u4F1A\u6267\u884C\u3002" }), approval.map(c => _jsxs("p", { children: [c.title, " \u00B7 v", c.version, " \u00B7 ", batch(c), " \u00B7 \u6267\u884C\uFF1A", name(c.assigneeSessionId)] }, c.id)), _jsx("button", { style: button, disabled: readOnly || busy || !!pending || dirty || approval.some(c => !c.assigneeSessionId), onClick: () => begin('task-card-publish', { cards: approval.map(c => ({ cardId: c.id, version: c.version })), execute: true }, '选定卡片发布'), children: "\u786E\u8BA4\u53D1\u5E03\u5E76\u901A\u77E5\u6267\u884C" }), _jsx("button", { style: button, onClick: () => setConfirm(false), children: "\u8FD4\u56DE\u4FEE\u6539" }), publishable.some(c => !c.assigneeSessionId) && _jsx("p", { children: "\u8BF7\u5148\u4E3A\u6240\u9009\u5361\u786E\u8BA4\u8D23\u4EFB\u6210\u5458\u5E76\u4FDD\u5B58\u3002" })] }) })] })] });
}
