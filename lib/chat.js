import { assetInputText, assetImageRef } from "./asset-reference.js";
import { assertMinutesShareable, minutesEvidenceText } from "./minutes-facts.js";
import { randomUUID } from 'node:crypto';
import { mutateMeeting, stateRoot } from "./meetings.js";
import { freezeRelease, meetingMessageStream } from "./meeting-flow.js";
import { workflowHash } from "./workflow-projection.js";
import { previewTemporary, startTemporaryInMeeting } from "./workflow-temporary.js";
import { workflowQueueTarget } from "./workflow-runtime.js";
import { workflowSupported } from "./workflow-state.js";
import { newDiscussion } from "./discussion.js";
import { findReleaseTask } from "./meeting-flow.js";
import { assertImageRecipients } from "./image-preflight.js";
/** Only failures before writing state are definite rejections; storage/transport failures stay uncertain. */
export class ChatConflict extends Error {
}
function precondition(fn) { try {
    return fn();
}
catch (e) {
    throw new ChatConflict(e instanceof Error ? e.message : String(e));
} }
function validate(input) {
    if (input.kind !== undefined && !['message', 'task'].includes(input.kind))
        throw Error('请选择讨论消息或工作任务');
    if (input.contextTaskId !== undefined && (typeof input.contextTaskId !== 'string' || !input.contextTaskId))
        throw Error('关联任务编号非法');
    if (input.kind === 'message' && input.mode === 'queue')
        throw Error('普通讨论消息不能暂存为流程任务输入，请明确选择工作任务');
    if (!input || !['record', 'send', 'queue'].includes(input.mode) || typeof input.instruction !== 'string' || (!input.instruction.trim() && !(input.kind === 'message' && input.mode !== 'queue' && (input.assetIds?.length || input.messageIds?.length))) || input.instruction.length > 100000)
        throw new Error('请输入本次内容或选择附件／引用（正文不超过10万字符）');
    for (const list of [input.messageIds, input.assetIds, input.recipientIds])
        if (!Array.isArray(list) || list.length > 200 || list.some(x => typeof x !== 'string') || new Set(list).size !== list.length)
            throw new Error('资料或成员列表非法／重复');
    if (input.runId !== null && (typeof input.runId !== 'string' || !input.runId))
        throw new Error('请刷新当前流程状态');
    if (input.mode === 'record' && input.recipientIds.length)
        throw new Error('仅记录不能同时选择接收成员');
    if (input.mode === 'queue' && (typeof input.nodeId !== 'string' || !input.nodeId))
        throw new Error('请选择已有会议环节');
}
function activeRun(m, input) {
    if (!workflowSupported(m))
        throw new Error('流程版本不支持，请先升级');
    const active = m.workflow?.runs.find(r => r.status === 'active');
    if (input.mode !== 'record' && (active?.id ?? null) !== input.runId)
        throw new Error('活动流程已变化，请重新检查发送内容');
    return active;
}
function draftOf(input) { return { id: 'chat-preview', version: 1, status: 'draft', instruction: input.instruction, messageIds: input.messageIds, recipientIds: input.recipientIds, assetIds: input.assetIds, createdAt: 0, tasks: [], title: '群聊点名' }; }
function selectedInputs(m, input) {
    const stream = meetingMessageStream(m), inputs = input.messageIds.map(id => { const item = stream.find(x => x.id === id); if (!item || item.previewOnly)
        throw new Error('所选会议消息不存在或尚未公开，请调整引用'); return item; });
    const assetIds = [...new Set([...input.assetIds, ...inputs.flatMap(x => x.assetIds ?? [])])];
    const assets = assetIds.map(id => { const a = m.assets?.find(x => x.id === id); if (!a)
        throw new Error('所选附件不存在'); return a; });
    if (assets.filter(a => assetImageRef(a)).length > 4)
        throw new Error('每次最多4张图片');
    for (const a of assets)
        inputs.push({ id: a.id, time: a.createdAt, sender: 'user', kind: 'message', text: assetInputText(a, m) });
    if (JSON.stringify(inputs).length + input.instruction.length > 100000)
        throw new Error('所选输入过长，请拆分；没有投递');
    return { inputs, assetIds, assets };
}
export function previewChat(m, input) {
    validate(input);
    if (m.archivedAt || m.deletion)
        throw new Error('会议已归档或正在删除');
    const run = activeRun(m, input);
    if (input.contextTaskId && !findReleaseTask(m, input.contextTaskId))
        throw Error('关联任务不属于本会议');
    let sources = selectedInputs(m, input), recipientIds = input.recipientIds, slotKey, round, nodeTitle, guard;
    if (input.mode === 'send') {
        if (m.releasePaused)
            throw new Error('会议投递已暂停');
        if (input.kind === 'message') {
            if (!input.recipientIds.length || input.recipientIds.some(id => !m.memberSessionIds.includes(id) || id === m.secretary?.sessionId))
                throw Error('讨论接收者必须是当前普通会议成员');
        }
        else {
            if (run) {
                const p = previewTemporary(m, run, { ...input, title: '群聊点名' });
                guard = p.fingerprint;
            }
            const frozen = freezeRelease(m, draftOf(input));
            sources = { ...sources, inputs: frozen.inputs ?? [], assetIds: frozen.assetIds ?? [] };
        }
    }
    if (input.mode === 'queue') {
        if (!input.runId)
            throw new Error('请先到进程页开始运行');
        const target = workflowQueueTarget(m, input.runId, input.nodeId);
        slotKey = target.slot.slotKey;
        round = target.slot.round;
        nodeTitle = target.node.title;
        recipientIds = target.node.memberIds;
        guard = { node: target.node, slot: target.slot, revision: target.run.definition.revision, pending: target.run.pendingInputs?.[slotKey] ?? [] };
    }
    const fingerprint = workflowHash({ input, members: m.memberSessionIds, title: m.title, sources, guard, slotKey, round, recipientIds });
    return { fingerprint, inputs: sources.inputs, assetIds: sources.assetIds, recipientIds, characters: JSON.stringify(sources.inputs).length + input.instruction.length, ...(slotKey ? { slotKey, round, nodeTitle } : {}) };
}
function receiptOf(meta) { const { requestId: _, requestHash: __, mode: ___, ...receipt } = meta; return receipt; }
export async function commitChat(meetingId, input, fingerprint, requestId, ctx) {
    precondition(() => { validate(input); if (typeof fingerprint !== 'string' || typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,70}$/.test(requestId))
        throw new Error('非法发送请求'); });
    const requestHash = workflowHash({ input, fingerprint });
    let result;
    await mutateMeeting(stateRoot(), meetingId, async (m) => {
        const accepted = [...(m.releases ?? []).map(r => r.chat), ...m.events.flatMap(e => e.kind === 'message' ? [e.chat] : [])].some(meta => meta?.requestId === requestId);
        if (!accepted && ctx && input.mode === 'send') {
            const check = precondition(() => { const plan = previewChat(m, input); if (plan.fingerprint !== fingerprint)
                throw Error('输入、成员、流程或额度已变化，请重新检查发送内容'); return plan; });
            try {
                await assertImageRecipients(ctx, m, check.recipientIds, check.assetIds);
            }
            catch (error) {
                throw new ChatConflict(error instanceof Error ? error.message : String(error));
            }
        }
        return precondition(() => {
            const old = [...(m.releases ?? []).map(r => r.chat), ...m.events.flatMap(e => e.kind === 'message' ? [e.chat] : [])].find(x => x?.requestId === requestId);
            if (old) {
                if (old.requestHash !== requestHash)
                    throw new Error('请求ID已用于其他内容');
                result = receiptOf(old);
                return m;
            }
            const plan = previewChat(m, input);
            if (plan.fingerprint !== fingerprint)
                throw new Error('输入、成员、流程或额度已变化，请重新检查发送内容');
            const now = Date.now(), meta = { requestId, requestHash, mode: input.mode, messageId: `message-chat-${requestId}` };
            if (input.mode === 'send' && input.kind === 'message') {
                const discussion = newDiscussion(m, input, plan, requestId, requestHash);
                meta.discussionId = discussion.id;
                m.discussions = [...(m.discussions ?? []), discussion];
                m.events.push({ id: meta.messageId, kind: 'message', time: now, by: 'user', text: input.instruction, replyTo: input.messageIds, assetIds: plan.assetIds, chat: meta, discussionId: discussion.id, contextTaskId: input.contextTaskId });
            }
            else if (input.mode === 'send') {
                let release;
                if (input.runId) {
                    const run = m.workflow.runs.find(r => r.id === input.runId), temporary = { ...input, title: '群聊点名' };
                    const p = previewTemporary(m, run, temporary), activation = startTemporaryInMeeting(m, input.runId, temporary, p.fingerprint, `chat-${requestId}`);
                    release = m.releases.find(r => r.id === activation.releaseId);
                    meta.runId = input.runId;
                }
                else {
                    release = freezeRelease(m, { ...draftOf(input), id: `chat-${requestId}`, createdAt: now });
                    m.releases = [...(m.releases ?? []), release];
                }
                meta.releaseId = release.id;
                meta.messageId = `sent-${release.id}`;
                release.chat = meta;
            }
            else {
                if (input.mode === 'queue') {
                    const { run, node, slot } = workflowQueueTarget(m, input.runId, input.nodeId);
                    meta.runId = run.id;
                    meta.nodeId = node.id;
                    meta.slotKey = slot.slotKey;
                    meta.round = slot.round;
                    run.pendingInputs ??= {};
                    run.pendingInputs[slot.slotKey] ??= [];
                    // Preserve explicit quoted sources separately: a reference is not implicit recursive history.
                    for (const id of [meta.messageId, ...input.messageIds])
                        if (!run.pendingInputs[slot.slotKey].some(x => x.kind === 'message' && x.id === id))
                            run.pendingInputs[slot.slotKey].push({ kind: 'message', id });
                    run.events.push({ id: randomUUID(), time: now, action: 'queue-input', details: `为「${node.title}」第${slot.round || 1}轮暂存消息 ${meta.messageId}；尚未投递` });
                }
                m.events.push({ id: meta.messageId, kind: 'message', time: now, by: 'user', text: input.instruction, replyTo: input.messageIds, assetIds: plan.assetIds, chat: meta });
            }
            result = receiptOf(meta);
            return m;
        });
    });
    return result;
}
export async function publishChatMinutes(meetingId, minutesId) {
    await mutateMeeting(stateRoot(), meetingId, m => {
        if (m.archivedAt || m.deletion)
            throw new Error('会议已归档或正在删除');
        const minutes = m.minutes?.find(x => x.id === minutesId);
        if (!minutes)
            throw new Error('纪要不存在');
        assertMinutesShareable(minutes);
        if (m.events.some(e => (e.kind === 'message' || e.kind === 'broadcast') && e.minutesId === minutesId))
            return m;
        m.events.push({ id: `published-${minutesId}`, kind: 'message', time: Date.now(), by: 'secretary', minutesId, text: `${minutes.summary}\n\n关键决策：\n${minutes.keyDecisions.join('\n') || '无'}\n\n任务进展：\n${minutes.taskProgress.join('\n') || '无'}\n\n未决事项：\n${minutes.openItems.join('\n') || '无'}${minutesEvidenceText(minutes)}` });
        return m;
    });
}
