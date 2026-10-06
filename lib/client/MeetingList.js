import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { uiButton as button, uiInput as input } from "./ui-state.js";
import { sortedMeetings, meetingListStatus, matchesMeetingState } from "./meeting-list-state.js";
import { RelativeTime, useRelativeNow } from "./RelativeTime.js";
import { useScopedOperations } from "./use-scoped-operations.js";
export function MeetingList({ meetings, onCreate, onOpen, onChanged }) {
    const { meetingCall, isCurrent } = useScopedOperations();
    const now = useRelativeNow();
    const [query, setQuery] = useState(''), [archived, setArchived] = useState(false), [managing, setManaging] = useState(false);
    const [stateType, setStateType] = useState('all');
    const [selected, setSelected] = useState([]), [confirmation, setConfirmation] = useState(), [outcomes, setOutcomes] = useState([]);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [progress, setProgress] = useState(0);
    const guard = useRef(false);
    const listed = sortedMeetings(meetings ?? [], query, archived).filter(m => matchesMeetingState(m, stateType)), eligible = listed.filter(m => !m.deletion && !m.listReadOnly && !m.archivedAt);
    const eligibleIds = eligible.map(m => m.meetingId), selectedVisible = selected.filter(id => eligibleIds.includes(id)), all = eligible.length > 0 && selectedVisible.length === eligible.length;
    const eligibilityStamp = eligibleIds.slice().sort().join('|');
    useEffect(() => { setSelected(old => old.filter(id => eligibleIds.includes(id))); }, [eligibilityStamp]);
    const resetSelection = () => { setSelected([]); setConfirmation(undefined); setOutcomes([]); setNotice(''); setError(''); };
    const pin = async (m) => {
        if (guard.current || !isCurrent())
            return;
        guard.current = true;
        setBusy(true);
        setError('');
        setNotice('');
        setProgress(0);
        try {
            await meetingCall(m.meetingId, 'pin', { pinned: !m.pinnedAt });
            if (!isCurrent())
                return;
            await onChanged();
            if (isCurrent())
                setNotice(m.pinnedAt ? '已取消置顶。' : '会议已置顶。');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            guard.current = false;
            setBusy(false);
        }
    };
    const archive = async () => {
        if (guard.current || !confirmation?.length || !isCurrent())
            return;
        guard.current = true;
        setBusy(true);
        setError('');
        setNotice('');
        setProgress(0);
        setOutcomes([]);
        const snapshot = confirmation, results = [];
        setConfirmation(undefined);
        try {
            for (const item of snapshot) {
                if (!isCurrent())
                    return;
                try {
                    await meetingCall(item.meetingId, 'archive', { archived: true, confirmed: true });
                    results.push({ ...item, ok: true });
                }
                catch (e) {
                    results.push({ ...item, ok: false, error: e instanceof Error ? e.message : String(e) });
                }
                if (!isCurrent())
                    return;
                setProgress(results.length);
                setOutcomes([...results]);
            }
            setSelected(results.filter(r => !r.ok).map(r => r.meetingId));
            const succeeded = results.filter(r => r.ok).length;
            setNotice(`已归档 ${succeeded} 个会议${results.length > succeeded ? `，${results.length - succeeded} 个未确认成功；请查看下方原因。` : '。'}`);
            await onChanged();
        }
        catch (e) {
            setError(`列表刷新失败，请刷新核对：${String(e)}`);
        }
        finally {
            guard.current = false;
            setBusy(false);
        }
    };
    const badgeColor = (tone) => tone === 'warning' ? 'var(--dsw-alias-state-error-primary,#9a5600)' : tone === 'active' ? 'var(--dsw-alias-state-business-primary,#2470b5)' : tone === 'review' ? 'var(--dsw-alias-label-primary)' : tone === 'done' ? '#16794c' : 'var(--dsw-alias-label-secondary)';
    return _jsxs("section", { "aria-label": "\u4F1A\u8BAE\u5217\u8868", style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, fontSize: 12 }, children: [_jsxs("div", { style: { flex: 'none', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [_jsx("button", { style: button, disabled: busy, onClick: onCreate, children: "\u65B0\u5EFA\u4F1A\u8BAE" }), _jsx("button", { style: button, disabled: busy || archived || meetings === undefined, "aria-pressed": managing, onClick: () => { setManaging(!managing); resetSelection(); }, children: managing ? '退出管理' : '管理会议' })] }), _jsx("input", { "aria-label": "\u641C\u7D22\u4F1A\u8BAE", placeholder: "\u641C\u7D22\u4F1A\u8BAE\u540D\u79F0\u6216\u8BF4\u660E", style: input, value: query, disabled: busy, onChange: e => { setQuery(e.target.value); resetSelection(); } }), _jsxs("label", { children: ["\u72B6\u6001 ", _jsxs("select", { "aria-label": "\u6309\u4F1A\u8BAE\u72B6\u6001\u7B5B\u9009", value: stateType, disabled: busy, style: button, onChange: e => { setStateType(e.target.value); resetSelection(); }, children: [_jsx("option", { value: "all", children: "\u5168\u90E8\u72B6\u6001" }), _jsx("option", { value: "review", children: "\u5F85\u9A8C\u6536" }), _jsx("option", { value: "fault", children: "\u9700\u6838\u5B9E\uFF0F\u6545\u969C" }), _jsx("option", { value: "running", children: "\u6267\u884C\u4E2D" })] })] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: archived, disabled: busy, onChange: e => { setArchived(e.target.checked); setManaging(false); resetSelection(); } }), "\u67E5\u770B\u5DF2\u5F52\u6863\u4F1A\u8BAE"] }), managing && _jsxs("div", { style: { padding: 8, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", "aria-label": "\u5168\u9009\u5F53\u524D\u7B5B\u9009\u7ED3\u679C", checked: all, disabled: busy || !eligible.length, onChange: () => { setSelected(all ? [] : eligibleIds); setConfirmation(undefined); } }), "\u5168\u9009\u5F53\u524D\u7B5B\u9009\u7ED3\u679C"] }), _jsxs("span", { children: ["\u5DF2\u9009 ", selectedVisible.length, " \u4E2A\u4F1A\u8BAE"] }), _jsx("button", { style: button, disabled: busy || !selectedVisible.length, onClick: () => setConfirmation(eligible.filter(m => selectedVisible.includes(m.meetingId)).map(m => ({ meetingId: m.meetingId, title: m.title }))), children: "\u5F52\u6863\u6240\u9009\u4F1A\u8BAE\u2026" }), _jsx("small", { children: "\u66F4\u6539\u641C\u7D22\u6216\u5F52\u6863\u89C6\u56FE\u4F1A\u6E05\u7A7A\u9009\u62E9\u3002" })] }), busy && progress > 0 && _jsxs("p", { role: "status", style: { margin: 0 }, children: ["\u5DF2\u5904\u7406 ", progress, " \u4E2A\u4F1A\u8BAE\u2026"] }), notice && _jsx("p", { role: "status", style: { margin: 0, overflowWrap: 'anywhere' }, children: notice }), error && _jsx("p", { role: "alert", style: { margin: 0, color: 'var(--dsw-alias-state-error-primary)', overflowWrap: 'anywhere' }, children: error })] }), _jsxs("div", { style: { flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }, children: [confirmation && _jsxs("section", { role: "alertdialog", "aria-label": "\u786E\u8BA4\u6279\u91CF\u5F52\u6863", style: { border: '1px solid var(--dsw-alias-border-l2)', padding: 10, borderRadius: 8, marginBottom: 10, overflowWrap: 'anywhere' }, children: [_jsxs("b", { children: ["\u5F52\u6863\u4EE5\u4E0B ", confirmation.length, " \u4E2A\u4F1A\u8BAE\uFF1F"] }), _jsx("p", { children: "\u4FDD\u7559\u4F1A\u8BAE\u8D44\u6599\u548C\u6210\u5458\u4F1A\u8BDD\uFF1B\u7ED3\u675F\u8FD9\u4E9B\u4F1A\u8BAE\u7684\u672A\u5B8C\u6210\u7B49\u5F85\u4E0E\u6D41\u7A0B\uFF0C\u53D6\u6D88\u6B63\u5728\u751F\u6210\u7684\u7EAA\u8981\u3002\u539F\u6210\u5458\u7A97\u53E3\u4E2D\u7684\u5DE5\u4F5C\u4E0D\u4F1A\u88AB\u505C\u6B62\u3002\u6062\u590D\u4F1A\u8BAE\u540E\uFF0C\u5DF2\u7ED3\u675F\u7684\u7B49\u5F85\u4E0D\u4F1A\u81EA\u52A8\u91CD\u5F00\u3002" }), _jsx("ul", { style: { paddingLeft: 20, maxHeight: 160, overflowY: 'auto' }, children: confirmation.map(m => _jsxs("li", { children: [m.title, " ", _jsxs("small", { children: ["\u00B7 ", m.meetingId.slice(-6)] })] }, m.meetingId)) }), _jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: [_jsx("button", { style: button, disabled: busy, onClick: () => { void archive(); }, children: "\u786E\u8BA4\u5F52\u6863\u6240\u9009\u4F1A\u8BAE" }), _jsx("button", { style: button, disabled: busy, onClick: () => setConfirmation(undefined), children: "\u53D6\u6D88\u5F52\u6863" })] })] }), outcomes.length > 0 && _jsxs("details", { open: outcomes.some(r => !r.ok), style: { marginBottom: 10, overflowWrap: 'anywhere' }, children: [_jsxs("summary", { children: ["\u672C\u6B21\u5F52\u6863\u7ED3\u679C\uFF08", outcomes.length, "\uFF09"] }), _jsx("ul", { style: { paddingLeft: 20 }, children: outcomes.map(r => _jsxs("li", { children: [r.title, "\uFF1A", r.ok ? '已归档' : `未确认成功：${r.error}。可刷新核对后重试。`] }, r.meetingId)) })] }), meetings === undefined ? _jsx("p", { children: "\u52A0\u8F7D\u4E2D\u2026" }) : !listed.length ? _jsxs("div", { style: { padding: 10, lineHeight: 1.7 }, children: [_jsx("p", { children: query ? '没有匹配当前搜索与状态的会议。' : stateType !== 'all' ? `当前筛选下没有${stateType === 'review' ? '待验收' : stateType === 'fault' ? '需核实／故障' : '执行中'}的会议。` : archived ? '暂无已归档会议。讨论结束后，可在管理模式中归档整理。' : '暂无会议。点击“新建会议”，填写目标并邀请成员开始讨论。' }), query && _jsx("button", { style: button, onClick: () => { setQuery(''); resetSelection(); }, children: "\u6E05\u9664\u641C\u7D22" }), stateType !== 'all' && _jsx("button", { style: button, onClick: () => { setStateType('all'); resetSelection(); }, children: "\u67E5\u770B\u5168\u90E8\u72B6\u6001" })] }) : null, _jsx("ul", { style: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }, children: listed.map(m => {
                            const status = meetingListStatus(m);
                            return _jsxs("li", { "data-meeting-list-row": m.meetingId, style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 9, minWidth: 0, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }, children: [managing && _jsx("input", { type: "checkbox", "data-meeting-select": m.meetingId, "aria-label": `选择会议「${m.title}」`, checked: selectedVisible.includes(m.meetingId), disabled: busy || !eligibleIds.includes(m.meetingId), onChange: () => { setSelected(old => old.includes(m.meetingId) ? old.filter(id => id !== m.meetingId) : [...old, m.meetingId]); setConfirmation(undefined); } }), _jsx("span", { "data-meeting-state": m.meetingId, style: { fontSize: 11, color: badgeColor(status.tone) }, children: status.label }), _jsx("button", { "data-meeting-pin": m.meetingId, style: { ...button, padding: '2px 6px', marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap' }, "aria-label": `${m.pinnedAt ? '取消置顶' : '置顶'}「${m.title}」`, "aria-pressed": !!m.pinnedAt, disabled: busy || !!m.deletion || m.listReadOnly, onClick: () => { void pin(m); }, children: m.pinnedAt ? '★ 已置顶' : '☆ 置顶' })] }), _jsxs("button", { "data-round-table-meeting": m.meetingId, type: "button", disabled: busy, onClick: () => onOpen(m.meetingId), style: { ...button, padding: 0, border: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, width: '100%', minWidth: 0, textAlign: 'left', overflowWrap: 'anywhere' }, children: [_jsx("span", { title: m.title, style: { fontSize: 13, fontWeight: 500, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: m.title }), _jsxs("span", { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }, children: [m.memberSessionIds.length, " \u4F4D\u6210\u5458 \u00B7 \u6700\u8FD1\u6D3B\u52A8 ", _jsx(RelativeTime, { timestamp: m.lastActivity ?? m.createdAt, now: now })] }), _jsx("span", { style: { fontSize: 12 }, children: m.counts?.awaitingReview !== undefined ? _jsxs(_Fragment, { children: [m.counts.awaitingReview, " \u9879\u5F85\u9A8C\u6536 \u00B7 ", m.counts.faults ?? 0, " \u9879\u9700\u6838\u5B9E\uFF0F\u6545\u969C \u00B7 ", m.counts.running ?? 0, " \u9879\u6267\u884C\u4E2D"] }) : _jsxs(_Fragment, { children: [m.counts?.pending ?? 0, " \u9879\u672A\u7ED3\u675F \u00B7 ", m.counts?.attention ?? 0, " \u9879\u5F85\u5904\u7406\uFF0F\u9A8C\u6536"] }) }), !m.deletion && m.secretary?.status !== 'ready' && _jsx("span", { style: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)' }, children: m.secretary?.status === 'initializing' ? '秘书初始化中' : m.secretary ? '秘书需要重试' : '未配置会议秘书 · 进入会议补建' })] })] }, m.meetingId);
                        }) })] })] });
}
