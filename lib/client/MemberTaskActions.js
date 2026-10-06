import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { RevisionPanel } from "./RevisionPanel.js";
import { PublishPanel } from "./PublishPanel.js";
import { useScopedOperations } from "./use-scoped-operations.js";
import { revisionChild, reviewState } from "../task-review.js";
import { uiButton as button } from "./ui-state.js";
/** Execution controls belong to the selected member's meeting work log. */
export function MemberTaskActions({ meetingId, memberId, memberName, releases, discussions = [], onChanged, focusTaskId }) {
    const { meetingCall, isCurrent } = useScopedOperations(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(), [supplement, setSupplement] = useState(), [confirm, setConfirm] = useState();
    const owner = JSON.stringify([meetingId, memberId]), ownerRef = useRef(owner), pending = useRef(undefined);
    ownerRef.current = owner;
    useEffect(() => { setBusy(false); setError(''); setRevision(undefined); setSupplement(undefined); setConfirm(undefined); }, [owner]);
    const current = () => isCurrent() && ownerRef.current === owner;
    const tasks = releases.flatMap(r => r.tasks.filter(t => t.toSessionId === memberId).map(t => ({ r, t }))), ordinary = discussions.flatMap(d => d.deliveries.filter(delivery => delivery.toSessionId === memberId).map(delivery => ({ d, delivery })));
    const changed = async () => { if (!current())
        return; try {
        await onChanged();
    }
    catch {
        if (current())
            setError('操作已接受，日志刷新失败，请刷新查看，不要重复执行。');
    } };
    const action = async (name, body) => { if (pending.current?.owner === owner || !current())
        return false; const operation = { owner }; pending.current = operation; setBusy(true); setError(''); try {
        await meetingCall(meetingId, name, body);
        await changed();
        return true;
    }
    catch (e) {
        if (current())
            setError(e instanceof Error ? e.message : String(e));
        return false;
    }
    finally {
        if (pending.current === operation)
            pending.current = undefined;
        if (current())
            setBusy(false);
    } };
    const confirmAction = async () => { const selected = confirm; if (!selected || selected.owner !== owner || !current())
        return; if (await action(selected.action, selected.body) && current())
        setConfirm(undefined); };
    const target = tasks.find(x => x.t.taskId === revision)?.t;
    return _jsxs("section", { "aria-label": "\u6210\u5458\u4EFB\u52A1\u64CD\u4F5C", style: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }, children: [error && _jsx("p", { role: "alert", children: error }), !!ordinary.length && _jsxs("section", { "aria-label": "\u666E\u901A\u8BA8\u8BBA\u6295\u9012\u64CD\u4F5C", style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsx("p", { children: "\u666E\u901A\u8BA8\u8BBA\u53EA\u8BB0\u5F55\u672C\u4F1A\u6295\u9012\u4E0E\u56DE\u590D\uFF0C\u4E0D\u521B\u5EFA\u5DE5\u4F5C\u4EFB\u52A1\uFF0C\u4E5F\u4E0D\u9700\u8981\u6210\u679C\u9A8C\u6536\u3002" }), ordinary.slice().reverse().map(({ d, delivery }) => _jsxs("details", { "data-member-discussion": d.id, style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8 }, children: [_jsxs("summary", { children: [d.instruction.slice(0, 35), " \u00B7 ", delivery.status === 'queued' ? '等待投递' : delivery.status === 'offline' ? '原成员需恢复' : delivery.status === 'delivering' ? '正在投递' : delivery.status === 'delivered' ? '已送达' : delivery.status === 'uncertain' ? '送达待核实' : delivery.status === 'failed' ? '投递失败' : '本会等待已结束'] }), _jsx("p", { style: { whiteSpace: 'pre-wrap' }, children: d.instruction }), d.contextTaskId && _jsx("p", { children: "\u5173\u8054\u5DE5\u4F5C\u4EFB\u52A1\u7684\u6F84\u6E05\u6216\u8865\u5145\uFF1B\u4E0D\u4F1A\u521B\u5EFA\u65B0\u4EFB\u52A1\u6216\u63D0\u4EA4\u6B63\u5F0F\u6210\u679C\u3002" }), _jsxs("p", { children: ["\u672C\u4F1A\u5DF2\u6536\u5230 ", d.replies.filter(reply => reply.sessionId === memberId).length, " \u6761\u666E\u901A\u56DE\u590D\u3002"] }), delivery.error && _jsx("p", { role: "alert", children: delivery.error }), _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [['offline', 'failed', 'uncertain'].includes(delivery.status) && _jsx("button", { style: button, disabled: busy, onClick: () => delivery.status === 'uncertain' ? setConfirm({ id: d.id, owner, kind: 'discussion', action: 'discussion-retry', body: { discussionId: d.id, sessionId: memberId }, description: '送达结果尚不明确，请先核对原窗口。重复发送可能产生重复回复；本操作只核实原消息的送达证据，无法核实时保留待核实状态，不盲目重投。' }) : void action('discussion-retry', { discussionId: d.id, sessionId: memberId }), children: delivery.status === 'uncertain' ? '核实原讨论投递' : '在会议内重试讨论投递' }), delivery.status !== 'cancelled' && _jsx("button", { style: button, disabled: busy, onClick: () => setConfirm({ id: d.id, owner, kind: 'discussion', action: 'discussion-close', body: { discussionId: d.id, sessionId: memberId, confirmed: true }, description: '仅结束这条普通讨论在本会对该成员的等待，保留已有消息与回复，不取消或停止原窗口工作。其他成员的投递继续，不会把工作任务或环节标为已完成。' }), children: "\u7ED3\u675F\u8FD9\u6761\u8BA8\u8BBA\u7B49\u5F85" })] })] }, d.id))] }), !tasks.length && _jsx("p", { children: "\u8FD9\u4F4D\u6210\u5458\u5C1A\u65E0\u5DE5\u4F5C\u4EFB\u52A1\u3002\u666E\u901A\u8BA8\u8BBA\u56DE\u590D\u4F1A\u51FA\u73B0\u5728\u4E0A\u65B9\u53D1\u8A00\u8BB0\u5F55\uFF0C\u4E0D\u9700\u8981\u4EFB\u52A1\u9A8C\u6536\u3002" }), tasks.slice().reverse().map(({ r, t }) => _jsxs("details", { open: t.taskId === focusTaskId, "data-member-task": t.taskId, style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8 }, children: [_jsxs("summary", { children: [r.title ?? r.instruction.slice(0, 35), " \u00B7 ", t.status === 'completed' ? reviewState({ releases }, t) : t.status === 'offline' ? '恢复或投递需处理' : t.status === 'queued' ? '等待执行' : t.status === 'in_progress' ? '执行中' : t.status === 'delivered' ? '等待成果' : t.status === 'cancelled' ? '已结束' : t.status === 'failed' ? '执行失败' : '投递需核实'] }), _jsx("p", { style: { whiteSpace: 'pre-wrap' }, children: r.instruction }), _jsxs("p", { children: ["\u5F15\u7528 ", r.messageIds.length, " \u6761\u4F1A\u8BAE\u6D88\u606F\uFF0C", r.assetIds?.length ?? 0, " \u4EFD\u9644\u4EF6\uFF1B\u6295\u9012 ", t.attempts, " \u6B21\u3002"] }), t.result && _jsxs("p", { style: { whiteSpace: 'pre-wrap' }, children: ["\u6B63\u5F0F\u6210\u679C\uFF1A", t.result] }), t.error && _jsx("p", { role: "alert", children: t.error }), _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [t.status === 'completed' && _jsxs(_Fragment, { children: [_jsx("button", { style: button, disabled: busy || t.review === 'accepted' || !!revisionChild({ releases }, t), onClick: () => { void action('review-task', { taskId: t.taskId, review: 'accepted' }); }, children: "\u9A8C\u6536\u901A\u8FC7" }), _jsx("button", { style: button, disabled: busy || !!revisionChild({ releases }, t), onClick: () => setRevision(t.taskId), children: "\u8981\u6C42\u4FEE\u6539" })] }), ['delivered', 'in_progress', 'uncertain', 'failed'].includes(t.status) && t.attempts > 0 && _jsx("button", { style: button, disabled: busy, onClick: () => setSupplement(t.taskId), children: "\u4ECE\u539F\u7A97\u53E3\u8865\u4EA4\u6210\u679C" }), ['offline', 'uncertain'].includes(t.status) && _jsx("button", { style: button, disabled: busy, onClick: () => t.status === 'uncertain' ? setConfirm({ id: t.taskId, owner, kind: 'task', action: 'retry-release', body: { taskId: t.taskId, allowDuplicate: true }, description: '这次送达结果尚不明确。请先核对原窗口，确认重试可能重复执行。' }) : void action('retry-release', { taskId: t.taskId }), children: "\u5728\u4F1A\u8BAE\u5185\u91CD\u8BD5\u6062\u590D\u4E0E\u6295\u9012" }), !['completed', 'cancelled'].includes(t.status) && _jsx("button", { style: button, disabled: busy, onClick: () => setConfirm({ id: t.taskId, owner, kind: 'task', action: 'close-task', body: { taskId: t.taskId, confirmed: true }, description: '仅结束本会等待，保留原工作及历史结果；不会把环节标为已完成。' }), children: "\u7ED3\u675F\u672C\u4F1A\u7B49\u5F85" })] })] }, t.taskId)), target && _jsx(RevisionPanel, { meetingId: meetingId, task: target, memberName: memberName, onChanged: changed, onClose: () => setRevision(undefined) }, target.taskId), supplement && _jsx(PublishPanel, { open: true, onClose: () => setSupplement(undefined), meetingId: meetingId, members: [{ id: memberId, name: memberName }], releases: releases, initialTarget: { taskId: supplement, sessionId: memberId }, onChanged: async () => { await changed(); setSupplement(undefined); } }), confirm?.owner === owner && _jsxs("div", { role: "alertdialog", "aria-label": confirm.kind === 'discussion' ? '确认普通讨论操作' : '确认成员任务操作', children: [_jsx("p", { children: confirm.description }), _jsx("button", { style: button, disabled: busy, onClick: () => { void confirmAction(); }, children: "\u786E\u8BA4" }), _jsx("button", { style: button, disabled: busy, onClick: () => setConfirm(undefined), children: "\u53D6\u6D88" })] })] });
}
