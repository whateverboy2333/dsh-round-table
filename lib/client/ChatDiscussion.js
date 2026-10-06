import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { ChatAssetPreview } from "./ChatAssetPreview.js";
import { RevisionPanel } from "./RevisionPanel.js";
import { reviewState, revisionChild } from "../task-review.js";
import { useEffect, useRef, useState } from 'react';
import { HostingComposer } from "./HostingComposer.js";
import { uiButton as button, uiInput as input } from "./ui-state.js";
import { useScopedOperations } from "./use-scoped-operations.js";
import { chatStyles } from "./chat-style.js";
import { RelativeTime, useRelativeNow } from "./RelativeTime.js";
export function ChatDiscussion({ meetingId, messages, releases, members, assets, names, memberStatus, run, paused, archived, onChanged, onNavigate, onOpenSession, onPrepareTask, onSupplement, onPublish, draftRunIds = [], discussions = [], onOpenMember, onCreateTask }) {
    const { meetingCall, isCurrent } = useScopedOperations();
    const now = useRelativeNow();
    const [search, setSearch] = useState(false), [query, setQuery] = useState(''), [limit, setLimit] = useState(40), [unread, setUnread] = useState(false);
    const [response, setResponse] = useState(), [reference, setReference] = useState(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [confirmation, setConfirmation] = useState();
    const scroll = useRef(null), atBottom = useRef(true), guard = useRef(false), heightBefore = useRef();
    const name = (id) => { if (id === 'user')
        return '你'; if (id === 'secretary')
        return '秘书'; const m = members.find(m => m.id === id); return m ? `${m.name}${members.filter(x => x.name === m.name).length > 1 ? ' · ' + id.slice(-6) : ''}` : names[id] ?? `历史成员 · ${id.slice(-6)}`; };
    const [revisionTarget, setRevisionTarget] = useState();
    const revisionTask = releases.flatMap(r => r.tasks).find(t => t.taskId === revisionTarget);
    const publicMessages = messages.filter(m => !m.previewOnly), filtered = publicMessages.filter(m => !query || `${name(m.sender)} ${m.text}`.toLowerCase().includes(query.toLowerCase()));
    const newest = publicMessages.at(-1)?.id;
    useEffect(() => { const box = scroll.current; if (!box)
        return; if (atBottom.current) {
        box.scrollTop = box.scrollHeight;
        setUnread(false);
    }
    else
        setUnread(true); }, [newest]);
    useEffect(() => { const box = scroll.current; if (box && heightBefore.current !== undefined) {
        box.scrollTop += box.scrollHeight - heightBefore.current;
        heightBefore.current = undefined;
    } }, [limit]);
    const action = async (fn) => { if (guard.current || !isCurrent())
        return; guard.current = true; setBusy(true); setError(''); try {
        await fn();
    }
    catch (e) {
        if (isCurrent())
            setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        guard.current = false;
        if (isCurrent())
            setBusy(false);
    } };
    const refreshAccepted = async () => { if (!isCurrent())
        return; try {
        await onChanged();
    }
    catch (e) {
        if (isCurrent())
            setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`);
    } };
    const call = (what, body) => { void action(async () => { await meetingCall(meetingId, what, body); await refreshAccepted(); }); };
    const showReference = (id) => { if (!isCurrent())
        return; const message = publicMessages.find(m => m.id === id); if (message) {
        setReference(message);
        return;
    } void action(async () => { const { message } = await meetingCall(meetingId, 'lookup-message', { id }); if (!isCurrent())
        return; if (!message || message.previewOnly)
        throw Error('原消息不存在或尚未公开'); setReference(message); }); };
    const taskPaused = (task) => paused || !!(run?.paused && task.workflow?.runId === run.id);
    const status = (task) => {
        if (task.restoration?.state === 'restoring')
            return '正在恢复原会话';
        if (task.status === 'offline' && task.error?.startsWith('会话状态需核对'))
            return '会话状态需核对';
        if (task.status === 'queued') {
            const s = memberStatus[task.toSessionId];
            return taskPaused(task) ? '投递已暂停' : s?.running ? '等待窗口空闲' : s?.blockers.length ? '等待前项任务' : '等待投递';
        }
        return { offline: '原窗口未连接', delivering: '正在投递', uncertain: '投递待核实', delivered: '已投递', in_progress: '本会任务执行中', completed: '已回复', failed: '执行失败', cancelled: '已结束' }[task.status];
    };
    const taskActions = (task) => _jsxs("div", { className: "rt-chat-detail-actions", children: [_jsx("button", { style: button, onClick: () => onOpenSession?.(task.toSessionId), children: "\u6253\u5F00\u539F\u7A97\u53E3" }), ['delivered', 'in_progress', 'uncertain', 'failed'].includes(task.status) && task.attempts !== 0 && _jsx("button", { style: button, disabled: archived, onClick: () => onSupplement(task), children: "\u4EBA\u5DE5\u8865\u4EA4" }), ['offline', 'uncertain'].includes(task.status) && _jsx("button", { style: button, disabled: busy || taskPaused(task) || archived, onClick: () => task.status === 'uncertain' ? setConfirmation({ action: 'retry-release', body: { taskId: task.taskId, allowDuplicate: true }, text: '投递结果尚不确定。请先检查原窗口；确认重试可能重复执行。' }) : call('retry-release', { taskId: task.taskId }), children: "\u91CD\u8BD5\u6295\u9012" }), !['completed', 'cancelled'].includes(task.status) && _jsx("button", { style: button, disabled: busy || archived, onClick: () => setConfirmation({ action: 'close-task', body: { taskId: task.taskId, confirmed: true }, text: '只结束本次会议等待，原窗口工作继续。' }), children: "\u7ED3\u675F\u672C\u4F1A\u7B49\u5F85" }), task.status === 'completed' && _jsxs(_Fragment, { children: [_jsx("span", { children: reviewState({ releases }, task) }), _jsx("button", { style: button, disabled: busy || archived || task.review === 'accepted' || !!revisionChild({ releases }, task), onClick: () => call('review-task', { taskId: task.taskId, review: 'accepted' }), children: "\u9A8C\u6536\u901A\u8FC7" }), _jsx("button", { style: button, disabled: busy || archived || !!revisionChild({ releases }, task), onClick: () => { void action(async () => { await meetingCall(meetingId, 'review-task', { taskId: task.taskId, review: 'changes_requested', note: task.reviewNote ?? '' }); await refreshAccepted(); if (isCurrent())
                            setRevisionTarget(task.taskId); }); }, children: "\u8981\u6C42\u4FEE\u6539" })] })] });
    return _jsxs("section", { className: "rt-chat", "aria-label": "\u4F1A\u8BAE\u7FA4\u804A", children: [_jsx("style", { children: chatStyles }), _jsxs("div", { className: "rt-chat-toolbar", children: [_jsx("span", { className: "rt-chat-muted", children: "\u4F1A\u8BAE\u8BA8\u8BBA \u00B7 \u53D1\u8A00\u4E0E\u4EFB\u52A1\u5361" }), _jsxs("div", { children: [_jsx("button", { style: button, "aria-expanded": search, onClick: () => setSearch(v => !v), children: "\u641C\u7D22" }), _jsx("button", { style: button, disabled: archived, onClick: onPublish, children: "\u5BFC\u5165\u6210\u5458\u56DE\u590D" })] })] }), search && _jsx("input", { "aria-label": "\u641C\u7D22\u4F1A\u8BAE\u6D88\u606F", placeholder: "\u641C\u7D22\u5185\u5BB9\u6216\u6210\u5458", style: input, value: query, onChange: e => { setQuery(e.target.value); setLimit(40); } }), error && _jsx("p", { role: "alert", children: error }), _jsxs("div", { ref: scroll, className: "rt-chat-scroll", "aria-label": "\u4F1A\u8BAE\u6D88\u606F", onScroll: () => { const box = scroll.current; if (!box)
                    return; atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 60; if (atBottom.current)
                    setUnread(false); }, children: [filtered.length > limit && _jsxs("button", { style: button, onClick: () => { heightBefore.current = scroll.current?.scrollHeight; setLimit(n => n + 40); }, children: ["\u66F4\u65E9\u6D88\u606F\uFF08\u8FD8\u6709 ", filtered.length - limit, " \u6761\uFF09"] }), !filtered.length && _jsxs("div", { className: "rt-chat-empty", children: [_jsx("b", { children: query ? '没有匹配的消息' : archived ? '暂无已公开内容' : members.length ? '开始会议讨论' : '先添加会议成员' }), _jsx("p", { children: query ? '试试其他关键词。' : archived ? '会议已归档，可到设置页恢复后继续记录。' : members.length ? '在下方记录一个议题，或 @成员请他回应。' : '也可以先记录议题；添加成员后用 @ 点名。' }), !query && !archived && !members.length && _jsx("button", { style: button, onClick: () => onNavigate?.('members'), children: "\u6DFB\u52A0\u4F1A\u8BAE\u6210\u5458" }), _jsx("small", { children: "\u53EA\u6709\u660E\u786E\u9009\u4E2D\u7684\u5185\u5BB9\u624D\u4F1A\u4EA4\u7ED9\u6210\u5458\u3002" })] }), filtered.slice(-limit).map(m => {
                        const own = m.sender === 'user', release = m.releaseId ? releases.find(r => r.id === m.releaseId) : undefined, task = m.taskId ? releases.flatMap(r => r.tasks).find(t => t.taskId === m.taskId) : undefined;
                        const discussion = m.discussionId ? discussions.find(d => d.id === m.discussionId) : undefined;
                        return _jsxs("article", { id: `flow-${m.id}`, "data-flow-message": m.id, className: `rt-chat-row ${own ? 'own' : ''}`, children: [_jsx("button", { className: `rt-chat-avatar ${m.sender === 'secretary' ? 'secretary' : ''}`, "aria-label": own ? '主持人' : `查看${name(m.sender)}成员详情`, disabled: own || m.sender === 'secretary', onClick: () => onOpenMember?.(m.sender), children: own ? '你' : name(m.sender).slice(0, 1) }), _jsxs("div", { className: "rt-chat-message", children: [_jsxs("div", { className: "rt-chat-author", children: [_jsx("b", { children: name(m.sender) }), _jsx(RelativeTime, { timestamp: m.time, now: now }), m.source?.kind === 'manual' && _jsxs("small", { children: ["\u4EBA\u5DE5\u516C\u5F00", m.source.excerpt ? ' · 节选' : ''] })] }), _jsxs("div", { className: "rt-chat-bubble", children: [!!m.replyTo?.length && _jsxs("div", { className: "rt-chat-reply-links", children: [m.replyTo.slice(0, 3).map(id => _jsxs("button", { onClick: () => showReference(id), children: ["\u21B3 ", publicMessages.find(x => x.id === id)?.text.slice(0, 75) ?? '查看引用原文'] }, id)), m.replyTo.length > 3 && _jsxs("small", { children: ["\u53E6\u6709 ", m.replyTo.length - 3, " \u6761\u5F15\u7528\uFF0C\u53EF\u5728\u8BE6\u60C5\u67E5\u770B"] })] }), !!release && _jsxs("div", { className: "rt-chat-chips", children: [_jsx("b", { children: "\u5DE5\u4F5C\u4EFB\u52A1\u5361" }), release.recipientIds.map(id => _jsxs("span", { className: "rt-chat-mention", children: ["@", name(id)] }, id))] }), !!discussion && discussion.messageId === m.id && _jsxs("div", { className: "rt-chat-chips", children: [discussion.recipientIds.map(id => _jsxs("span", { className: "rt-chat-mention", children: ["@", name(id)] }, id)), _jsx("small", { children: discussion.contextTaskId ? '原工作澄清／补充' : '普通讨论消息' })] }), m.text.length > 1200 ? _jsxs("details", { children: [_jsxs("summary", { children: [m.text.slice(0, 170), "\u2026 \u5C55\u5F00\u5168\u6587"] }), _jsx("p", { className: "rt-chat-text", children: m.text })] }) : _jsx("p", { className: "rt-chat-text", children: m.text }), !!m.assetIds?.length && _jsx(ChatAssetPreview, { meetingId: meetingId, assets: assets, assetIds: m.assetIds })] }), _jsxs("div", { className: "rt-chat-receipts", children: [discussion?.messageId === m.id && discussion.deliveries.map(d => _jsxs("span", { "data-discussion-receipt": discussion.id, children: [name(d.toSessionId), " \u00B7 ", discussion.replies.some(r => r.sessionId === d.toSessionId) ? '已回应' : d.status === 'delivered' ? '已送入原会话' : d.status === 'queued' ? '等待接收' : d.status === 'offline' ? '恢复需处理' : d.status === 'uncertain' ? '送达需核实' : d.status === 'cancelled' ? '已结束' : d.status === 'failed' ? '接收失败，图文未处理' : '投递中'] }, d.toSessionId)), release?.tasks.map(t => _jsxs("span", { "data-chat-receipt": t.taskId, "data-status": t.status, children: [name(t.toSessionId), " \u00B7 ", status(t)] }, t.taskId)), discussion?.messageId === m.id && discussion.deliveries.filter(d => d.error).map(d => _jsxs("span", { role: "alert", children: [name(d.toSessionId), "\uFF1A", d.error] }, 'error-' + d.toSessionId)), m.recordOnly && !release && _jsx("span", { children: "\u4EC5\u8BB0\u5F55 \u00B7 \u672A\u6295\u9012" }), m.kind === 'minutes' && _jsx("span", { children: m.deliveries?.some(d => d.status === 'delivered') ? '已公开 · 有成员投递记录' : '已公开到会议 · 未向成员投递' }), m.deliveries?.map(d => _jsxs("span", { children: [name(d.sessionId), " \u00B7 ", d.status === 'delivered' ? '已投递' : '未送达'] }, d.sessionId))] }), _jsxs("div", { className: "rt-chat-message-actions", children: [_jsx("button", { className: "rt-chat-link", disabled: archived, onClick: () => setResponse({ messageIds: [m.id], nonce: Date.now(), ...(m.taskId ? { contextTaskId: m.taskId, recipientIds: [m.sender] } : m.releaseId ? { contextTaskId: release?.tasks[0]?.taskId, recipientIds: release?.recipientIds } : {}) }), children: "\u56DE\u590D" }), _jsxs("details", { children: [_jsx("summary", { children: "\u66F4\u591A" }), _jsxs("div", { className: "rt-chat-detail-actions", children: [_jsx("button", { style: button, disabled: archived, onClick: () => { setResponse({ messageIds: [m.id], nonce: Date.now(), purpose: 'task-card' }); onPrepareTask(m); }, children: "\u636E\u6B64\u751F\u6210\u4EFB\u52A1\u5361" }), _jsx("button", { style: button, disabled: archived || busy || m.id.startsWith('conclusion-'), onClick: () => call('mark-conclusion', { messageId: m.id }), children: "\u6807\u8BB0\u4E3A\u7ED3\u8BBA" }), _jsx("button", { style: button, onClick: () => { void navigator.clipboard.writeText(m.text).catch(e => setError(String(e))); }, children: "\u590D\u5236\u6B63\u6587" }), _jsx("button", { style: button, onClick: () => showReference(m.id), children: "\u6765\u6E90\u4E0E\u5168\u6587" })] }), (m.replyTo ?? []).map(id => _jsxs("button", { style: button, onClick: () => showReference(id), children: ["\u67E5\u770B\u5F15\u7528 ", publicMessages.find(x => x.id === id)?.text.slice(0, 25) ?? '历史消息'] }, id)), release?.tasks.map(t => _jsxs("button", { style: button, onClick: () => onOpenMember?.(t.toSessionId, t.taskId), children: [name(t.toSessionId), " \u00B7 ", status(t), " \u2192 \u6210\u5458\u5DE5\u4F5C\u65E5\u5FD7"] }, t.taskId)), task && _jsx("button", { style: button, onClick: () => onOpenMember?.(task.toSessionId, task.taskId), children: "\u67E5\u770B\u8FD9\u9879\u5DE5\u4F5C\u7684\u8BE6\u7EC6\u65E5\u5FD7" })] })] })] })] }, m.id);
                    })] }), unread && _jsx("button", { className: "rt-chat-new", onClick: () => { const box = scroll.current; if (box)
                    box.scrollTop = box.scrollHeight; atBottom.current = true; setUnread(false); }, children: "\u6709\u65B0\u6D88\u606F \u2193" }), reference && _jsxs("div", { className: "rt-chat-overlay", role: "dialog", "aria-label": "\u5F15\u7528\u539F\u6587", children: [_jsxs("header", { children: [_jsxs("b", { children: [name(reference.sender), " \u00B7 ", new Date(reference.time).toLocaleString()] }), _jsx("button", { style: button, onClick: () => setReference(undefined), children: "\u5173\u95ED\u539F\u6587" })] }), _jsx("p", { className: "rt-chat-text", children: reference.text }), _jsxs("small", { children: [reference.source?.kind === 'manual' ? `人工公开 · 原回复 #${reference.source.seq}${reference.source.excerpt ? ' · 节选' : ''}` : reference.source?.kind === 'agent' ? 'Agent正式提交' : '会议资料', _jsx("br", {}), reference.id, reference.taskId ? ` / ${reference.taskId}` : ''] })] }), confirmation && _jsxs("div", { className: "rt-chat-overlay", role: "alertdialog", "aria-label": "\u786E\u8BA4\u4EFB\u52A1\u64CD\u4F5C", children: [_jsx("p", { children: confirmation.text }), _jsx("button", { style: button, disabled: busy, onClick: () => { call(confirmation.action, confirmation.body); setConfirmation(undefined); }, children: "\u786E\u8BA4" }), _jsx("button", { style: button, onClick: () => setConfirmation(undefined), children: "\u53D6\u6D88" })] }), revisionTask && _jsx(RevisionPanel, { meetingId: meetingId, task: revisionTask, memberName: name(revisionTask.toSessionId), onChanged: onChanged, onClose: () => setRevisionTarget(undefined) }, revisionTask.taskId), _jsx(HostingComposer, { onCreateTask: onCreateTask, meetingId: meetingId, run: run, members: members, messages: publicMessages, assets: assets, paused: paused, archived: archived, prepared: response, onPrepared: () => setResponse(undefined), onChanged: onChanged, onNavigate: onNavigate, memberStatus: memberStatus, draftRunIds: draftRunIds }, `${meetingId}:${run?.id ?? 'plain'}`), _jsx("div", { className: "rt-chat-floating-layer", "data-rt-chat-floating-layer": "" })] });
}
