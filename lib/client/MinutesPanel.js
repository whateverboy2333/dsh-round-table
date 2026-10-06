import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { downloadText } from "./ui-state.js";
import { useScopedOperations } from "./use-scoped-operations.js";
const button = { font: 'inherit', padding: '5px 9px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-base)', color: 'inherit', cursor: 'pointer' };
const statusName = (s) => ({ completed: '已提交', accepted: '已验收', changes_requested: '要求修改', not_reviewed: '未验收', queued: '等待投递', offline: '原窗口未连接', in_progress: '处理中', failed: '失败', cancelled: '已结束' }[s] ?? s);
const scopeText = (m) => m.integrity?.facts.taskScope?.mode === 'since_last' ? `本次增量涉及 ${m.integrity.facts.taskScope.changedTaskIds.length} 项任务${m.integrity.facts.taskScope.addedTaskIds ? '，其中新增 ' + m.integrity.facts.taskScope.addedTaskIds.length + ' 项' : ''}；下方总数为全会快照。` : '';
const factsMarkdown = (m) => m.integrity ? '\n\n## 系统事实与核对\n' + m.integrity.facts.scopeLabel + '；任务' + m.integrity.facts.counts.total + '项，已验收' + m.integrity.facts.counts.accepted + '项。\n' + m.integrity.warnings.join('\n') + '\n' + m.integrity.coverage + '\n' + scopeText(m) : '';
const minutesMarkdown = (m) => `# 会议纪要\n\n${m.summary}\n\n` + [['关键决策', m.keyDecisions], ['任务进展', m.taskProgress], ['未决事项', m.openItems]].map(([title, items]) => `## ${title}\n\n${items.map(x => `- ${x}`).join('\n') || '无'}`).join('\n\n') + factsMarkdown(m);
export function MinutesPanel({ meetingId, ready, minutes = [], job, onChanged, formalOnly = false, publishedIds = [], members = [] }) {
    const { meetingCall, isCurrent } = useScopedOperations();
    const [share, setShare] = useState();
    const [shareError, setShareError] = useState('');
    const guard = useRef(false), dialog = useRef(null), returnFocus = useRef();
    const closeShare = () => { if (guard.current)
        return; setShare(undefined); setShareError(''); returnFocus.current?.focus(); };
    const openShare = (value, trigger) => { returnFocus.current = trigger; setShareError(''); setShare(value); };
    useEffect(() => { if (share)
        dialog.current?.focus(); }, [share?.id, share?.mode]);
    useEffect(() => () => { returnFocus.current?.focus(); }, []);
    const [scope, setScope] = useState('full');
    const [busy, setBusy] = useState();
    const [error, setError] = useState();
    const [inputPreview, setInputPreview] = useState();
    const action = async (name, body = {}, contextual = false) => {
        if (guard.current)
            return false;
        if (!isCurrent()) {
            const message = 'DSH 实例已变化，请重新打开圆桌并核对纪要';
            if (contextual)
                setShareError(message);
            else
                setError(message);
            return false;
        }
        guard.current = true;
        setBusy(name);
        setError(undefined);
        if (contextual)
            setShareError('');
        try {
            await meetingCall(meetingId, name, body);
            if (!isCurrent())
                return true;
            try {
                await onChanged();
            }
            catch (e) {
                setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`);
            }
            return true;
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (contextual)
                setShareError(message);
            else
                setError(message);
            return false;
        }
        finally {
            setBusy(undefined);
            guard.current = false;
        }
    };
    return _jsxs("section", { "data-round-table-minutes": "", style: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, padding: 10, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10 }, children: [_jsx("strong", { children: "\u4F1A\u8BAE\u7EAA\u8981 \u00B7 \u8349\u7A3F \u2192 \u6838\u5BF9 \u2192 \u5206\u4EAB" }), _jsxs("label", { children: ["\u6574\u7406\u8303\u56F4 ", _jsxs("select", { "aria-label": "\u7EAA\u8981\u8303\u56F4", value: scope, onChange: e => setScope(e.target.value), disabled: !!busy || job?.status === 'running', style: button, children: [_jsx("option", { value: "full", children: "\u5168\u91CF" }), _jsx("option", { value: "since_last", children: "\u81EA\u4E0A\u6B21\u4EE5\u6765" })] })] }), _jsxs("p", { style: { margin: 0, opacity: .7 }, children: [formalOnly ? '只整理正式会议消息、任务状态与人工发布内容，不读取未发布的原窗口私聊。' : '读取参会范围内的原会话发言。', "\u7EAA\u8981\u5148\u4FDD\u5B58\u9884\u89C8\uFF0C\u4E0D\u81EA\u52A8\u53D1\u9001\u3002", scope === 'since_last' && !minutes.some(m => m.cursors && (!formalOnly || m.source === 'formal')) ? ' 尚无同来源生成基线，将按全量整理。' : ''] }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { style: button, disabled: !!busy || job?.status === 'running', onClick: () => { setBusy('preview'); void meetingCall(meetingId, 'minutes-data', { scope }).then(v => { if (isCurrent())
                            setInputPreview(v.data); }).catch(e => { if (isCurrent())
                            setError(String(e)); }).finally(() => { if (isCurrent())
                            setBusy(undefined); }); }, children: "\u9884\u89C8\u8BFB\u53D6\u8303\u56F4" }), _jsx("button", { type: "button", style: button, disabled: !ready || !!busy || job?.status === 'running', onClick: () => { void action('minutes', { scope }); }, children: "\u751F\u6210\u7EAA\u8981" }), job?.status === 'running' && _jsx("button", { type: "button", style: button, disabled: !!busy, onClick: () => { void action('cancel-minutes'); }, children: "\u53D6\u6D88\u751F\u6210" })] }), inputPreview && _jsxs("div", { role: "region", "aria-label": "\u7EAA\u8981\u8F93\u5165\u9884\u89C8", children: [_jsx("b", { children: inputPreview.source === 'formal' ? '正式会议资料' : '包括参会期原会话回复' }), _jsxs("p", { children: [inputPreview.events.length, " \u6761\u4F1A\u8BAE\u8BB0\u5F55\uFF1B", inputPreview.members.reduce((n, m) => n + m.messages.length, 0), " \u6761\u539F\u4F1A\u8BDD\u56DE\u590D\u3002\u751F\u6210\u65F6\u4F1A\u91CD\u65B0\u8BFB\u53D6\u6700\u65B0\u6570\u636E\u3002"] }), _jsx("button", { style: button, onClick: () => downloadText('minutes-input.json', JSON.stringify(inputPreview, null, 2), 'application/json'), children: "\u5BFC\u51FA\u5B8C\u6574\u8F93\u5165\u6838\u5BF9" }), _jsx("button", { style: button, onClick: () => setInputPreview(undefined), children: "\u5173\u95ED\u9884\u89C8" })] }), !ready && job?.status !== 'running' && _jsx("p", { style: { margin: 0 }, children: "\u8BF7\u5148\u914D\u7F6E\u4F1A\u8BAE\u79D8\u4E66\u3002" }), !minutes.length && job?.status !== 'running' && ready && _jsx("p", { style: { margin: 0 }, children: "\u8FD8\u6CA1\u6709\u7EAA\u8981\u3002\u5148\u5728\u8BA8\u8BBA\u4E2D\u8BB0\u5F55\u5185\u5BB9\uFF0C\u518D\u9009\u62E9\u6574\u7406\u8303\u56F4\u5E76\u751F\u6210\uFF1B\u751F\u6210\u540E\u53EF\u4EE5\u4FDD\u7559\u4E0D\u53D1\u9001\u3002" }), job?.status === 'running' && _jsxs("p", { role: "status", style: { margin: 0 }, children: ["\u6B63\u5728\u6574\u7406\u2026\u5DF2\u542F\u52A8 ", job.modelCalls, " \u6B21\u751F\u6210"] }), (job?.status === 'failed' || job?.status === 'cancelled') && _jsxs("p", { role: "alert", style: { margin: 0, color: 'var(--dsw-alias-state-error-primary)' }, children: [job.error ?? '生成已取消', "\uFF08\u672A\u63A8\u8FDB\u8BFB\u53D6\u8303\u56F4\uFF09"] }), error && _jsx("p", { role: "alert", style: { margin: 0, color: 'var(--dsw-alias-state-error-primary)' }, children: error }), [...minutes].reverse().map((m, index) => _jsxs("details", { open: index === 0, "data-minutes-id": m.id, style: { borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 8 }, children: [_jsxs("summary", { style: { cursor: 'pointer' }, children: [new Date(m.generatedAt).toLocaleString(), " \u00B7 ", m.scope === 'full' ? '全量' : '增量', " \u00B7 ", m.sent ? '已发送' : m.deliveries?.some(d => d.status === 'delivered') ? '部分发送' : '未发送'] }), _jsx("strong", { children: "\u6458\u8981" }), _jsx("p", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: m.summary }), [['关键决策', m.keyDecisions], ['任务进展与责任', m.taskProgress], ['未决事项与下一步', m.openItems]].map(([label, items]) => _jsxs("div", { children: [_jsx("strong", { children: label }), items.length ? _jsx("ul", { style: { paddingLeft: 18, overflowWrap: 'anywhere' }, children: items.map((text, i) => _jsx("li", { children: text }, i)) }) : _jsx("p", { children: "\u65E0" })] }, label)), m.integrity && _jsxs("p", { role: m.integrity.warnings.length ? 'alert' : 'status', children: [m.integrity.warnings.length ? '发现内容冲突，请展开证据逐项核对。' : m.integrity.reviewedAt ? '主持人已核对；这不是自动认证。' : '待人工核对。', !m.integrity.reviewedAt && _jsx("button", { style: button, disabled: !!busy, onClick: e => openShare({ id: m.id, mode: 'review' }, e.currentTarget), children: "\u6838\u5BF9\u540E\u786E\u8BA4" })] }), _jsxs("details", { children: [_jsx("summary", { children: "\u751F\u6210\u4FE1\u606F\u4E0E\u539F\u59CB\u8BC1\u636E" }), _jsxs("p", { style: { opacity: .7 }, children: [m.source === 'formal' ? '正式资料（含簿记与任务状态）' : '原会话发言', " ", m.sourceCount ?? '未知', " \u6761 \u00B7 \u5B50\u4EE3\u7406 ", m.modelCalls, " \u6B21 \u00B7 \u6A21\u578B\u6B65\u9AA4 ", m.requestCount ?? '未提供计数', " \u6B21\uFF08\u4E0D\u542B\u4F20\u8F93\u91CD\u8BD5\uFF09"] }), m.cutoff && _jsxs("p", { style: { opacity: .7 }, children: ["\u6574\u7406\u622A\u6B62\uFF1A", new Date(m.cutoff).toLocaleString()] }), (m.missing?.length ?? m.missingSessionIds?.length ?? 0) > 0 && _jsxs("p", { role: "alert", style: { color: 'var(--dsw-alias-state-error-primary)' }, children: ["\u90E8\u5206\u6570\u636E\u7F3A\u5931\uFF1A", m.missing?.map(s => `${s.sessionId}（${s.error}）`).join('；') ?? m.missingSessionIds?.join('、'), "\u3002\u4E0B\u6B21\u589E\u91CF\u5C06\u91CD\u8BD5\u7F3A\u5931\u8303\u56F4\u3002"] }), m.integrity && _jsxs("section", { "aria-label": "\u7EAA\u8981\u4E8B\u5B9E\u6838\u5BF9", style: { border: '1px solid var(--dsw-alias-border-l2)', padding: 10, borderRadius: 8, marginBottom: 8 }, children: [_jsx("b", { children: m.integrity.warnings.length ? '发现内容冲突 · 需人工核对' : m.integrity.reviewedAt ? '主持人已核对 · 非自动认证' : '待人工核对的纪要草稿' }), _jsxs("p", { children: [m.integrity.facts.scopeLabel, "\uFF1A\u4EFB\u52A1", m.integrity.facts.counts.total, "\u9879\uFF0C\u5DF2\u63D0\u4EA4", m.integrity.facts.counts.submitted, "\u9879\uFF0C\u5DF2\u9A8C\u6536", m.integrity.facts.counts.accepted, "\u9879\uFF0C\u5F85\u9A8C\u6536", m.integrity.facts.counts.awaitingReview, "\u9879\uFF0C\u8981\u6C42\u4FEE\u6539", m.integrity.facts.counts.changesRequested, "\u9879\u3002"] }), scopeText(m) && _jsx("p", { children: scopeText(m) }), m.integrity.warnings.map(w => _jsx("p", { role: "alert", children: w }, w)), _jsx("p", { children: m.integrity.coverage }), _jsxs("details", { children: [_jsx("summary", { children: "\u6838\u5BF9\u4EFB\u52A1\u4E0E\u6210\u5458\u4F9D\u636E" }), _jsxs("p", { children: ["\u6210\u5458\uFF1A", m.integrity.facts.members.join('、') || '无'] }), m.integrity.facts.tasks.map(t => _jsxs("div", { style: { padding: 6, borderBottom: '1px solid var(--dsw-alias-border-l2)' }, children: [_jsxs("b", { children: [t.member, " \u00B7 ", t.title || '任务'] }), _jsxs("p", { children: [t.kind, " \u00B7 ", statusName(t.status), " \u00B7 ", statusName(t.review)] }), t.result && _jsx("p", { style: { whiteSpace: 'pre-wrap' }, children: t.result }), _jsxs("small", { children: [t.id, " \u00B7 \u6765\u6E90 ", t.source] })] }, t.id))] })] }), !m.integrity && _jsx("p", { children: "\u5386\u53F2\u7EAA\u8981\u672A\u8BB0\u5F55\u7CFB\u7EDF\u6838\u5BF9\u5FEB\u7167\uFF1B\u8BF7\u5BF9\u7167\u539F\u59CB\u4EFB\u52A1\u6838\u5BF9\uFF0C\u4E0D\u81EA\u52A8\u6807\u4E3A\u5DF2\u9A8C\u6536\u3002" })] }), _jsx("button", { type: "button", style: button, disabled: !!busy || publishedIds.includes(m.id) || !!m.integrity && !m.integrity.reviewedAt, onClick: e => openShare({ id: m.id, mode: 'publish' }, e.currentTarget), children: publishedIds.includes(m.id) ? '已公开到会议' : '公开到会议（不唤醒成员）' }), _jsx("button", { type: "button", style: button, disabled: !!busy || m.sending || m.sent || !!m.integrity && !m.integrity.reviewedAt, onClick: e => openShare({ id: m.id, mode: 'send' }, e.currentTarget), children: m.sending ? '发送中…' : m.sent ? '已发送' : m.deliveries?.some(d => d.status === 'undelivered') ? '重试未送达成员' : '发送通知给成员' }), !m.sent && _jsx("span", { style: { marginLeft: 8, opacity: .7 }, children: "\u4E5F\u53EF\u4EE5\u4FDD\u7559\u4E0D\u53D1\u9001" }), _jsx("button", { style: button, onClick: () => downloadText(`纪要-${m.id}.md`, minutesMarkdown(m)), children: "\u5BFC\u51FA\u6B64\u7EAA\u8981" }), _jsx("button", { style: button, onClick: () => { void navigator.clipboard.writeText(minutesMarkdown(m)).catch(e => setError(`复制失败，请使用导出：${String(e)}`)); }, children: "\u590D\u5236\u7EAA\u8981" }), m.deliveries?.map(d => _jsxs("p", { style: { fontSize: 11, overflowWrap: 'anywhere' }, children: [d.status === 'delivered' ? '✓ 已入队' : '✗ 未送达', " ", members.find(x => x.id === d.sessionId)?.name ?? d.sessionId, d.error ? `：${d.error}` : ''] }, d.sessionId))] }, m.id)), share && _jsx("div", { style: { position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.25)', display: 'grid', placeItems: 'center', padding: 24 }, children: _jsxs("div", { ref: dialog, role: "alertdialog", "aria-modal": true, "aria-label": "\u786E\u8BA4\u7EAA\u8981\u64CD\u4F5C", tabIndex: -1, onKeyDown: event => { if (event.key === 'Escape') {
                        event.preventDefault();
                        closeShare();
                    }
                    else if (event.key === 'Tab') {
                        const controls = dialog.current?.querySelectorAll('button:not(:disabled), [tabindex="0"]');
                        if (controls?.length) {
                            const first = controls[0], last = controls[controls.length - 1];
                            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
                                event.preventDefault();
                                last.focus();
                            }
                            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
                                event.preventDefault();
                                first.focus();
                            }
                        }
                        else {
                            event.preventDefault();
                            dialog.current?.focus();
                        }
                    } }, style: { padding: 20, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-base)', maxWidth: 560, width: '100%', maxHeight: '80vh', overflow: 'auto', boxSizing: 'border-box' }, children: [_jsx("b", { children: share.mode === 'review' ? '确认已逐项核对' : share.mode === 'publish' ? '公开到会议' : '发送通知给成员' }), _jsxs("p", { children: [new Date(minutes.find(n => n.id === share.id)?.generatedAt ?? 0).toLocaleString(), " \u00B7 ", minutes.find(n => n.id === share.id)?.scope === 'full' ? '全量' : '增量', " \u00B7 ", share.id.slice(-8)] }), _jsx("blockquote", { style: { margin: '8px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: minutes.find(n => n.id === share.id)?.summary.slice(0, 300) }), _jsx("p", { children: share.mode === 'review' ? '请逐项核对系统数量、任务原结果、成员和正文。确认只记录你的核对动作，不会把模型内容自动认证为正确。' : share.mode === 'publish' ? '把这份纪要作为会议资料公开，不唤醒任何成员。' : '将发送给：' + (members.map(x => x.name).join('、') || '本会普通成员') + '。成员可能开始回应并消耗模型额度，秘书不接收通知。' }), minutes.find(n => n.id === share.id)?.integrity?.warnings.length ? _jsx("p", { role: "alert", children: "\u5DF2\u6709\u51B2\u7A81\u4ECD\u4FDD\u7559\uFF0C\u5206\u4EAB\u4E0E\u5BFC\u51FA\u9644\u4E0A\u51B2\u7A81\u8BF4\u660E\uFF1B\u82E5\u4E0D\u63A5\u53D7\uFF0C\u8BF7\u53D6\u6D88\u5E76\u91CD\u65B0\u6574\u7406\u3002" }) : null, shareError && _jsxs("p", { role: "alert", children: [shareError, "\u3002\u53EF\u91CD\u8BD5\u540C\u4E00\u4EFD\u7EAA\u8981\uFF0C\u8DF3\u8FC7\u5DF2\u8BB0\u5F55\u9001\u8FBE\u7684\u6210\u5458\uFF1B\u82E5\u4E0A\u6B21\u6295\u9012\u7ED3\u679C\u4E0D\u786E\u5B9A\uFF0C\u8BF7\u5148\u6838\u5BF9\u539F\u7A97\u53E3\u3002"] }), busy && _jsx("p", { role: "status", children: "\u6B63\u5728\u63D0\u4EA4\uFF0C\u8BF7\u7B49\u5F85\u7ED3\u679C\u2026" }), _jsx("button", { style: button, disabled: !!busy, onClick: () => { const current = share; void action(current.mode === 'review' ? 'review-minutes' : current.mode === 'publish' ? 'publish-minutes' : 'send-minutes', { minutesId: current.id, confirmed: true, acknowledgeConflicts: true }, true).then(ok => { if (ok)
                                closeShare(); }); }, children: shareError ? '重试此操作' : '确认' }), _jsx("button", { style: button, disabled: !!busy, onClick: closeShare, children: "\u53D6\u6D88" })] }) })] });
}
