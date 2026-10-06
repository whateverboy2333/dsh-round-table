import { assetInputText, assetImageRef } from "./asset-reference.js";
import { projectTaskCardMessage } from "./task-card-projection.js";
import { inboxHasPending, sessionHistory, readStoredSession } from "./host-runtime.js";
import { syncMeetingResultDocument } from "./meeting-files-sync.js";
/** Deterministic project-message routing. Only a user release can authorize work. */
import { randomUUID, createHash } from 'node:crypto';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm/message';
import { listMeetings, mutateMeeting, requireActiveMeeting, stateRoot } from "./meetings.js";
import { withMeetingActivity } from "./meeting-activity.js";
import { readMemberHistory } from "./minutes.js";
import { workflowSupported } from "./workflow-state.js";
import { workflowTaskAllowed, reserveWorkflowRetry } from "./workflow-guard.js";
import { inspectMember, memberForExecution, memberIsArchived } from "./member-session.js";
const MAX_TEXT = 100000;
function text(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT)
        throw new Error(`${label}不能为空且不能超过${MAX_TEXT}字符`);
    return value.trim();
}
function identifier(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(value))
        throw new Error('非法请求ID');
    return value;
}
function stringIds(value) {
    if (!Array.isArray(value) || value.length > 200 || value.some(v => typeof v !== 'string'))
        throw new Error('输入或成员列表非法');
    return [...new Set(value)];
}
/** An explicit conference stream; never reads arbitrary private assistant replies. */
export function meetingMessageStream(meeting) {
    const result = [];
    for (const e of meeting.events) {
        if (e.kind === 'message') {
            const release = e.taskId ? meeting.releases?.find(r => r.tasks.some(t => t.taskId === e.taskId)) : undefined;
            const replyTo = [...new Set([...(release ? [`sent-${release.id}`] : []), ...(e.replyTo ?? [])])];
            const discussion = e.discussionId ? meeting.discussions?.find(d => d.id === e.discussionId) : undefined;
            result.push({ id: e.id, time: e.time, sender: e.by, text: projectTaskCardMessage(meeting, e) ?? e.text, kind: e.minutesId ? 'minutes' : e.taskId ? 'result' : 'message', ...(e.taskId ? { taskId: e.taskId } : {}), ...(replyTo.length ? { replyTo } : {}), ...(e.source ? { source: e.source } : {}), ...(e.assetIds ? { assetIds: e.assetIds } : {}), ...(e.discussionId ? { discussionId: e.discussionId, contextTaskId: e.contextTaskId, recipientIds: discussion?.recipientIds, deliveries: discussion?.messageId === e.id ? discussion.deliveries.map(d => ({ sessionId: d.toSessionId, status: d.status === 'delivered' ? 'delivered' : 'undelivered', error: d.error })) : undefined } : {}), ...(e.minutesId ? { minutesId: e.minutesId, deliveries: meeting.minutes?.find(n => n.id === e.minutesId)?.deliveries } : {}), ...(!e.taskId && !e.discussionId && e.by === 'user' ? { recordOnly: true } : {}) });
        }
        if (e.kind === 'broadcast') {
            if (e.minutesId && result.some(x => x.minutesId === e.minutesId && !x.previewOnly))
                continue;
            result.push({ id: e.id, time: e.time, sender: e.by, text: e.text, kind: e.minutesId ? 'minutes' : 'broadcast', deliveries: e.minutesId ? (meeting.minutes?.find(n => n.id === e.minutesId)?.deliveries ?? e.deliveries) : e.deliveries, ...(e.minutesId ? { minutesId: e.minutesId } : {}) });
        }
        if (e.kind === 'task' && e.status === 'completed' && e.result)
            result.push({ id: `result-${e.id}`, time: e.time, sender: e.toSessionId, text: e.result, kind: 'result', taskId: e.taskId });
        if (e.kind === 'minutes') {
            const m = meeting.minutes?.find(n => n.id === e.minutesId);
            // Generation is a preview. Only explicit publication/delivery belongs in chat.
            if (m)
                result.push({ id: e.id, time: e.time, sender: 'secretary', kind: 'minutes', minutesId: m.id, previewOnly: !(m.sent || m.deliveries?.some(d => d.status === 'delivered')) || meeting.events.some(x => (x.kind === 'message' || x.kind === 'broadcast') && x.minutesId === m.id), deliveries: m.deliveries, text: `${m.summary}\n关键决策：${m.keyDecisions.join('；')}\n任务进展：${m.taskProgress.join('；')}\n未决事项：${m.openItems.join('；')}` });
        }
    }
    for (const r of meeting.releases ?? [])
        if (r.status === 'released')
            result.push({ id: `sent-${r.id}`, time: r.releasedAt ?? r.createdAt, sender: 'user', text: projectTaskCardMessage(meeting, { id: `sent-${r.id}`, sender: 'user', text: r.instruction }) ?? r.instruction, kind: 'message', releaseId: r.id, recipientIds: r.recipientIds, replyTo: r.messageIds });
    return result.filter((m, i, all) => all.findIndex(x => x.id === m.id) === i).sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}
export async function saveMeetingMessage(meetingId, content, requestId) {
    const id = `message-${identifier(requestId)}`, body = text(content, '消息');
    return mutateMeeting(stateRoot(), meetingId, m => {
        if (m.archivedAt)
            throw new Error('会议已归档，不能记录新消息');
        const existing = m.events.find(e => e.id === id);
        if (existing) {
            if (existing.kind !== 'message' || existing.by !== 'user' || existing.text !== body)
                throw new Error('请求ID已用于另一条消息');
            return m;
        }
        return { ...m, events: [...m.events, { id, kind: 'message', time: Date.now(), by: 'user', text: body }] };
    });
}
function validRecipients(m, ids) {
    if (!ids.length)
        throw new Error('至少选择一个接收成员');
    if (ids.some(id => id === m.secretary?.sessionId || !m.memberSessionIds.includes(id)))
        throw new Error('接收者必须是当前普通会议成员');
}
export async function markMeetingConclusion(meetingId, messageId) {
    return mutateMeeting(stateRoot(), meetingId, m => {
        if (m.archivedAt)
            throw new Error('会议已归档，不能修改结论');
        const source = meetingMessageStream(m).find(x => x.id === messageId);
        if (!source)
            throw new Error('来源消息不存在');
        const id = `conclusion-${messageId}`;
        if (m.events.some(e => e.id === id))
            return m;
        return { ...m, events: [...m.events, { id, kind: 'message', time: Date.now(), by: 'user', text: `【主持人标记为结论】\n${source.text}`, replyTo: [messageId] }] };
    });
}
function validateInput(m, ids) {
    const known = new Set(meetingMessageStream(m).map(x => x.id));
    if (ids.some(id => !known.has(id)))
        throw new Error('选中的会议消息不存在，请刷新');
}
export class ReleaseRequestRejected extends Error {
}
function releasePrecondition(fn) { try {
    return fn();
}
catch (error) {
    throw new ReleaseRequestRejected(error instanceof Error ? error.message : String(error));
} }
export async function saveReleaseDraft(meetingId, input) {
    const { id, instruction, messageIds, recipientIds, title } = releasePrecondition(() => ({ id: identifier(input.id), instruction: text(input.instruction, '本轮要求'), messageIds: stringIds(input.messageIds), recipientIds: stringIds(input.recipientIds), title: input.title ? text(input.title, '资料标题').slice(0, 100) : undefined }));
    let result;
    await mutateMeeting(stateRoot(), meetingId, m => releasePrecondition(() => {
        if (m.archivedAt)
            throw new Error('会议已归档，请先恢复');
        if (input.parentTaskId && findReleaseTask(m, input.parentTaskId)?.task.workflow)
            throw new Error('流程任务请在进程页重新执行，或以临时回应接续并计入流程额度');
        validRecipients(m, recipientIds);
        validateInput(m, messageIds);
        const assetIds = stringIds(input.assetIds ?? []);
        if (assetIds.some(id => !m.assets?.some(a => a.id === id)))
            throw new Error('选中的附件不存在');
        const old = m.releases?.find(r => r.id === id);
        const effectiveAssets = old?.status === 'released' ? [...new Set([...assetIds, ...(old.inputs ?? []).filter(x => messageIds.includes(x.id)).flatMap(x => x.assetIds ?? [])])] : assetIds;
        if (old && old.instruction === instruction && JSON.stringify(old.messageIds) === JSON.stringify(messageIds) && JSON.stringify(old.recipientIds) === JSON.stringify(recipientIds) && JSON.stringify(old.assetIds ?? []) === JSON.stringify(effectiveAssets) && (old.title ?? '') === (title ?? '') && old.parentTaskId === input.parentTaskId) {
            result = old;
            return m;
        }
        if (old?.status === 'released')
            throw new Error('已放行输入不能修改，请创建新资料包');
        if (old && input.version !== old.version)
            throw new Error('草稿已更新，请刷新后编辑');
        result = { id, version: (old?.version ?? 0) + 1, status: 'draft', instruction, messageIds, recipientIds, createdAt: old?.createdAt ?? Date.now(), tasks: [], assetIds, ...(title ? { title } : {}), ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}) };
        return { ...m, releases: [...(m.releases ?? []).filter(r => r.id !== id), result] };
    }));
    return result;
}
/** Pure preparation shared by manual releases and atomic workflow activation. Never sends. */
export function freezeRelease(m, draft) {
    validRecipients(m, draft.recipientIds);
    validateInput(m, draft.messageIds);
    const stream = meetingMessageStream(m), now = Date.now();
    const inputs = draft.messageIds.map(id => stream.find(x => x.id === id));
    const assetIds = [...new Set([...(draft.assetIds ?? []), ...inputs.flatMap(x => x.assetIds ?? [])])];
    const assets = assetIds.map(id => m.assets?.find(a => a.id === id));
    if (assets.some(a => !a))
        throw new Error('所选附件不存在');
    if (assets.filter(a => a && assetImageRef(a)).length > 4)
        throw new Error('每次放行最多4张图片');
    for (const a of assets)
        if (a)
            inputs.push({ id: a.id, time: a.createdAt, sender: 'user', kind: 'message', text: assetInputText(a, m) });
    if (JSON.stringify(inputs).length + draft.instruction.length > MAX_TEXT)
        throw new Error('所选输入过长，请拆分资料包；没有投递');
    return { ...draft, assetIds, status: 'released', releasedAt: now, meetingTitle: m.title, inputs: structuredClone(inputs), tasks: draft.recipientIds.map(toSessionId => ({ taskId: `release-task-${randomUUID()}`, toSessionId, status: 'queued', updatedAt: now, attempts: 0 })) };
}
export async function releaseDraft(_ctx, meetingId, draftId, version) {
    let result;
    await mutateMeeting(stateRoot(), meetingId, m => releasePrecondition(() => {
        const draft = m.releases?.find(r => r.id === draftId);
        if (!draft)
            throw new Error('草稿不存在');
        if (draft.status === 'released') {
            result = draft;
            return m;
        }
        if (m.releasePaused || m.archivedAt)
            throw new Error('放行队列已暂停或归档，请先恢复');
        if (draft.version !== version)
            throw new Error('草稿版本已变更，请重新预览后放行');
        result = freezeRelease(m, draft);
        return { ...m, releases: m.releases.map(r => r.id === draftId ? result : r) };
    }));
    return result;
}
export function findReleaseTask(m, taskId) {
    for (const draft of m.releases ?? []) {
        const task = draft.tasks.find(t => t.taskId === taskId);
        if (task)
            return { draft, task };
    }
    return undefined;
}
function updateTask(m, id, fn) {
    if (!findReleaseTask(m, id))
        throw new Error('会议任务不存在');
    return { ...m, releases: m.releases.map(r => ({ ...r, tasks: r.tasks.map(t => t.taskId === id ? fn(t, r) : t) })) };
}
function deliveryText(m, draft, task) {
    return `[圆桌会议「${m.title}」·手动放行]\nmeetingId=${m.meetingId}\ntaskId=${task.taskId}\n接收者=${task.toSessionId}\n放行时间=${new Date(draft.releasedAt).toISOString()}\n本轮要求：${draft.instruction}\n\n以下是主持人选定并冻结的会议资料（没有选择的消息不会自动补入）：\n${(draft.inputs ?? []).map(x => `【消息 ${x.id} · ${x.sender} · ${new Date(x.time).toISOString()}】\n${x.text}`).join('\n\n') || '（无引用资料，按本轮要求执行）'}\n\n这是原会话中的会议任务，不创建新的身份。开始时调用 meeting_task_claim(meetingId,taskId)。完成后必须调用 meeting_submit_result(meetingId,taskId,result) 将本轮正式结果提交到会议；也可用 meeting_task_complete。失败用 meeting_task_fail。只提交本轮结果，不公开其他私聊。结果回来不会自动转发给其他成员。`;
}
function matchedMessage(events, id) {
    return events.some(e => {
        const d = e.data;
        return e.type === 'agent/inbox/spliced' ? !!d.inserted?.some(m => m.id === id || m.source?.rpcId === id) : e.type === 'user/message' && ((d.message?.id ?? d.id) === id || (d.message?.source ?? d.source)?.rpcId === id);
    });
}
/** One host-scoped pump serializes delivery checks across meetings, without any LLM. */
const pumps = new WeakMap();
async function pump(ctx) {
    const root = stateRoot(), all = await listMeetings(root);
    const occupied = new Set();
    for (const m of all)
        if (!m.deletion && !m.archivedAt)
            for (const d of m.releases ?? [])
                for (const t of d.tasks)
                    if (m.memberSessionIds.includes(t.toSessionId) && ['delivering', 'uncertain', 'delivered', 'in_progress'].includes(t.status))
                        occupied.add(t.toSessionId);
    for (const snapshot of all) {
        if (snapshot.deletion || snapshot.releasePaused || snapshot.archivedAt || !workflowSupported(snapshot))
            continue;
        for (const draft of snapshot.releases ?? [])
            for (const task of draft.tasks) {
                if (task.status !== 'queued')
                    continue;
                try {
                    await withMeetingActivity(root, snapshot.meetingId, async () => {
                        const m = await requireActiveMeeting(root, snapshot.meetingId);
                        if (m.releasePaused || m.archivedAt)
                            return;
                        const fresh = findReleaseTask(m, task.taskId);
                        if (!fresh || fresh.task.status !== 'queued')
                            return;
                        if (!workflowTaskAllowed(m, fresh.task, true))
                            return;
                        if (!m.memberSessionIds.includes(task.toSessionId)) {
                            await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => ({ ...t, status: 'cancelled', updatedAt: Date.now(), error: '成员已退出，未投递' })));
                            return;
                        }
                        if (occupied.has(task.toSessionId))
                            return;
                        let agent;
                        const availability = await inspectMember(ctx, task.toSessionId), restoring = ['unloaded', 'restoring', 'restore_failed'].includes(availability.state), restorationStartedAt = Date.now();
                        try {
                            if (restoring)
                                await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => t.status === 'queued' && current.memberSessionIds.includes(t.toSessionId) ? { ...t, updatedAt: Date.now(), restoration: { state: 'restoring', startedAt: restorationStartedAt, updatedAt: Date.now(), reason: '正在恢复同一原成员会话；未另建窗口' } } : t));
                            agent = await memberForExecution(ctx, task.toSessionId);
                            if (restoring)
                                await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => t.status === 'queued' ? { ...t, updatedAt: Date.now(), restoration: { state: 'restored', startedAt: restorationStartedAt, updatedAt: Date.now(), reason: '原会话已恢复，继续本次已授权投递' } } : t));
                        }
                        catch (error) {
                            const reason = error instanceof Error ? error.message : String(error);
                            await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => t.status === 'queued' ? { ...t, status: 'offline', updatedAt: Date.now(), error: `成员原会话不可投递：${reason}`, restoration: { state: 'restore_failed', startedAt: restorationStartedAt, updatedAt: Date.now(), reason } } : t));
                            return;
                        }
                        if (agent.status === 'running' || inboxHasPending(agent.inbox) || occupied.has(task.toSessionId))
                            return;
                        // A resumed Host session can replace an Agent while the old object still exists.
                        // Never let that object append an old sequence to an already advanced durable log.
                        const persistence = ctx.get('sessionPersistence');
                        if (persistence) {
                            try {
                                const stored = await readStoredSession(ctx, task.toSessionId), last = stored.events.at(-1), live = last ? sessionHistory(agent.session).find(e => e.seq === last.seq) : undefined;
                                if (last && (!live || live.seq !== last.seq || live.type !== last.type || live.time !== last.time))
                                    throw new Error('原会话历史已前进，当前Agent状态过期');
                            }
                            catch (error) {
                                await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => t.status === 'queued' ? { ...t, status: 'offline', updatedAt: Date.now(), error: `会话状态需核对，未投递：${String(error instanceof Error ? error.message : error)}；可在会议内重试恢复` } : t));
                                return;
                            }
                        }
                        const stillCurrent = () => { const live = ctx.agents.get(SessionId(task.toSessionId)); return live === agent && !memberIsArchived(ctx, task.toSessionId) && live?.status !== 'running' && !(live ? inboxHasPending(live.inbox) : false); };
                        if (!stillCurrent())
                            return;
                        const content = deliveryText(m, fresh.draft, fresh.task), images = (fresh.draft.assetIds ?? []).map(id => { const asset = m.assets?.find(a => a.id === id); return asset ? assetImageRef(asset) : undefined; }).filter(Boolean);
                        const api = ctx.get('sessionController');
                        if (images.length) {
                            try {
                                if (!api)
                                    throw new Error('宿主图片投递接口不可用');
                                const selection = await api.projections({ sessionId: SessionId(task.toSessionId) }, new AbortController().signal);
                                const model = selection?.values.modelSelection?.next ?? selection?.values.modelSelection?.lastUsed;
                                if (!model)
                                    throw new Error('无法确认当前模型');
                                const llm = ctx.get('llm');
                                const info = await llm?.resolveModelInfo(model.provider, model.model);
                                if (!info?.inputModalities?.includes('image'))
                                    throw new Error(`模型 ${model.model} 未声明支持图片。请在原窗口切换支持图片的模型，或改用文本资料`);
                                const attachments = ctx.get('attachments');
                                if (!attachments)
                                    throw new Error('图片读取服务不可用');
                                await Promise.all(images.map(ref => attachments.readImage(ref)));
                            }
                            catch (error) {
                                await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => t.status === 'queued' ? { ...t, status: 'failed', error: `未投递：${String(error instanceof Error ? error.message : error)}`, updatedAt: Date.now() } : t));
                                return;
                            }
                        }
                        const message = createUserMessage({ content: [{ type: 'text', text: content }, ...images.map(attachment => ({ type: 'image', attachment: attachment }))], source: { kind: 'round-table', plugin: 'dsh-round-table' } });
                        let admitted = false;
                        await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => {
                            if (t.status !== 'queued' || current.releasePaused || !current.memberSessionIds.includes(t.toSessionId) || !workflowTaskAllowed(current, t, true))
                                return t;
                            admitted = true;
                            return { ...t, status: 'delivering', updatedAt: Date.now(), attempts: t.attempts + 1, hostMessageId: String(message.id), deliveryText: content };
                        }));
                        if (!admitted)
                            return;
                        occupied.add(task.toSessionId);
                        try {
                            let submitted = false;
                            // No await between final membership/status check and followup; followup queues its own turn, never steers private work.
                            await mutateMeeting(root, m.meetingId, async (current) => {
                                const t = findReleaseTask(current, task.taskId).task;
                                if (t.status !== 'delivering')
                                    return current;
                                if (current.releasePaused || !workflowTaskAllowed(current, t, true))
                                    return updateTask(current, t.taskId, x => ({ ...x, status: 'queued', updatedAt: Date.now(), attempts: Math.max(0, x.attempts - 1) }));
                                if (!current.memberSessionIds.includes(t.toSessionId))
                                    return updateTask(current, t.taskId, x => ({ ...x, status: 'cancelled', error: '成员已退出，未投递', updatedAt: Date.now() }));
                                if (!stillCurrent())
                                    return updateTask(current, t.taskId, x => ({ ...x, status: 'queued', updatedAt: Date.now(), attempts: Math.max(0, x.attempts - 1) }));
                                agent.followup(message);
                                submitted = true;
                                return current;
                            });
                            if (!submitted)
                                return;
                            const store = ctx.get('sessions');
                            if (!store || !await store.flush(agent.session))
                                throw new Error('宿主未确认消息持久化');
                            await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => t.status === 'delivering' ? { ...t, status: 'delivered', deliveredAt: Date.now(), updatedAt: Date.now() } : t));
                        }
                        catch (error) {
                            await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => ['delivering', 'delivered'].includes(t.status) ? { ...t, status: 'uncertain', error: `投递结果不确定：${String(error instanceof Error ? error.message : error)}`, updatedAt: Date.now() } : t)).catch(e => ctx.logger.warn(`会议任务投递记录失败：${String(e)}`));
                        }
                    });
                }
                catch (error) {
                    ctx.logger.warn(`会议放行处理未完成：${String(error instanceof Error ? error.message : error)}`);
                }
            }
    }
}
export async function pumpReleases(ctx) {
    const existing = pumps.get(ctx);
    if (existing)
        return existing;
    const run = pump(ctx).finally(() => { if (pumps.get(ctx) === run)
        pumps.delete(ctx); });
    pumps.set(ctx, run);
    return run;
}
export async function recoverReleases(ctx) {
    const root = stateRoot();
    for (const m of await listMeetings(root))
        if (!m.deletion && workflowSupported(m))
            for (const d of m.releases ?? [])
                for (const task of d.tasks)
                    if (task.status === 'delivering') {
                        let known = false;
                        try {
                            known = !!task.hostMessageId && matchedMessage(await readMemberHistory(ctx, task.toSessionId), task.hostMessageId);
                        }
                        catch { /* Remain uncertain, never blind retry. */ }
                        await mutateMeeting(root, m.meetingId, current => updateTask(current, task.taskId, t => t.status === 'delivering' ? { ...t, status: known ? 'delivered' : 'uncertain', updatedAt: Date.now(), ...(known ? { deliveredAt: Date.now() } : { error: '服务重启，未能证实投递结果；检查原窗口后决定是否重试' }) } : t));
                    }
}
export function attachReleaseLifecycle(ctx) {
    ctx.effect(() => {
        let stopped = false;
        const tick = () => { if (!stopped)
            void pumpReleases(ctx).catch(e => ctx.logger.warn(`会议队列检查失败：${String(e)}`)); };
        const timer = setInterval(tick, 2000);
        tick();
        return async () => { stopped = true; clearInterval(timer); await pumps.get(ctx); };
    }, 'round-table: released input queue');
}
export async function retryReleaseTask(ctx, meetingId, taskId, allowDuplicate) {
    await withMeetingActivity(stateRoot(), meetingId, async () => {
        const m = await requireActiveMeeting(stateRoot(), meetingId), found = findReleaseTask(m, taskId);
        if (!found)
            throw new Error('任务不存在');
        let known = false;
        if (found.task.status === 'uncertain' && found.task.hostMessageId) {
            try {
                known = matchedMessage(await readMemberHistory(ctx, found.task.toSessionId), found.task.hostMessageId);
            }
            catch { }
        }
        await mutateMeeting(stateRoot(), meetingId, current => updateTask(current, taskId, t => {
            if (current.releasePaused)
                throw new Error('放行队列已暂停，请先恢复');
            if (!workflowTaskAllowed(current, t, true))
                throw new Error('流程已暂停、结束或执行已被替代');
            validRecipients(current, [t.toSessionId]);
            if (t.status !== 'offline' && t.status !== 'uncertain')
                throw new Error('只有离线或不确定的投递可重试；执行失败需重新建立资料包');
            if (known) {
                const next = { ...t, status: 'delivered', updatedAt: Date.now() };
                delete next.error;
                return next;
            }
            if (t.status === 'uncertain' && !allowDuplicate)
                throw new Error('投递结果不确定，重试可能重复；请先检查原窗口并确认');
            reserveWorkflowRetry(current, t);
            const next = { ...t, status: 'queued', updatedAt: Date.now() };
            delete next.error;
            return next;
        }));
    });
    await pumpReleases(ctx);
}
export async function stopReleaseTask(meetingId, taskId) {
    await mutateMeeting(stateRoot(), meetingId, m => updateTask(m, taskId, t => {
        if (t.status === 'cancelled')
            return t;
        if (!['queued', 'offline'].includes(t.status))
            throw new Error('该任务已投递或结果不确定，不能取消原窗口；请在原窗口处理');
        return { ...t, status: 'cancelled', updatedAt: Date.now(), error: '用户停止未投递任务' };
    }));
}
async function finishTask(meetingId, taskId, actor, action, value) {
    let result;
    await mutateMeeting(stateRoot(), meetingId, async (m) => {
        const found = findReleaseTask(m, taskId);
        if (!found)
            throw new Error('会议任务不存在');
        const t = found.task;
        if (t.toSessionId !== actor)
            throw new Error('只有本任务接收成员可以回传');
        validRecipients(m, [actor]);
        if (action === 'complete' && t.status === 'completed') {
            if (t.result !== value)
                throw new Error('本任务已提交不同结果，不可覆盖');
            result = t;
            return m;
        }
        if (action === 'claim' && t.status === 'in_progress') {
            result = t;
            return m;
        }
        if (action === 'fail' && t.status === 'failed' && t.error === value) {
            result = t;
            return m;
        }
        if (!workflowTaskAllowed(m, t, false))
            throw new Error('本次流程执行已结束或被替代，不能回传');
        if (!['delivered', 'delivering', 'uncertain', 'in_progress'].includes(t.status))
            throw new Error('本任务尚未投递或已经结束');
        const now = Date.now();
        result = { ...t, updatedAt: now, status: action === 'claim' ? 'in_progress' : action === 'complete' ? 'completed' : 'failed', ...(action === 'claim' ? { claimedAt: now } : { completedAt: now }), ...(action === 'complete' ? { result: value, resultMessageId: `message-${taskId}`, resultSource: { kind: 'agent', sessionId: actor } } : {}) };
        delete result.error;
        if (action === 'fail')
            result.error = value;
        const approved = action === 'complete' ? await syncMeetingResultDocument(m, { taskId, title: found.draft.title ?? '任务成果', text: value, sessionId: actor, source: result.resultSource }) : m;
        const updated = updateTask(approved, taskId, () => result);
        if (action !== 'complete')
            return updated;
        return { ...updated, events: [...updated.events, { id: result.resultMessageId, kind: 'message', time: now, by: actor, text: value, taskId, replyTo: found.draft.messageIds, source: result.resultSource }] };
    });
    return result;
}
export const claimReleaseTask = (meetingId, taskId, actor) => finishTask(meetingId, taskId, actor, 'claim');
export const submitReleaseResult = (meetingId, taskId, actor, result) => finishTask(meetingId, taskId, actor, 'complete', text(result, '正式结果'));
export const failReleaseTask = (meetingId, taskId, actor, error) => finishTask(meetingId, taskId, actor, 'fail', text(error, '失败原因'));
/** Pausing never cancels an original session. Already delivered work may still report. */
export async function setReleasePaused(meetingId, paused) {
    await mutateMeeting(stateRoot(), meetingId, m => ({ ...m, releasePaused: paused }));
}
function candidate(event) {
    if (event.type !== 'assistant/message')
        return;
    const data = event.data;
    const body = (data?.message?.content ?? data?.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('');
    if (!body.trim() || body.length > MAX_TEXT)
        return;
    return { seq: event.seq, time: event.time, text: body, digest: createHash('sha256').update(JSON.stringify([event.seq, event.time, body])).digest('hex') };
}
export async function listPublishCandidates(ctx, meetingId, sessionId, before) {
    const m = await requireActiveMeeting(stateRoot(), meetingId);
    validRecipients(m, [sessionId]);
    const history = await readMemberHistory(ctx, sessionId), items = [];
    for (let i = history.length - 1; i >= 0 && items.length < 21; i--) {
        const e = history[i];
        if (before !== undefined && e.seq >= before)
            continue;
        const item = candidate(e);
        if (item)
            items.push(item);
    }
    return { items: items.slice(0, 20), ...(items.length > 20 ? { nextBefore: items[19].seq } : {}) };
}
export async function publishSelectedReply(ctx, meetingId, input) {
    if (input.confirmed !== true)
        throw new Error('必须预览并确认公开原回复');
    identifier(input.requestId);
    if (!Number.isInteger(input.seq) || typeof input.digest !== 'string')
        throw new Error('来源标识非法');
    return withMeetingActivity(stateRoot(), meetingId, async () => {
        const m = await requireActiveMeeting(stateRoot(), meetingId);
        validRecipients(m, [input.sessionId]);
        const event = (await readMemberHistory(ctx, input.sessionId)).find(e => e.seq === input.seq);
        const selected = event && candidate(event);
        if (!selected || selected.digest !== input.digest)
            throw new Error('原回复不存在、过长或内容已变更，请重新预览');
        const excerpt = input.excerpt === undefined ? selected.text : text(input.excerpt, '发布片段');
        if (!selected.text.includes(excerpt))
            throw new Error('发布片段必须来自原回复；补充内容请填写主持人备注');
        const body = excerpt + (input.note?.trim() ? `\n\n【主持人补充】\n${text(input.note, '备注')}` : '');
        const source = { kind: 'manual', sessionId: input.sessionId, seq: selected.seq, originalTime: selected.time, digest: selected.digest, excerpt: excerpt !== selected.text };
        return mutateMeeting(stateRoot(), meetingId, async (current) => {
            validRecipients(current, [input.sessionId]);
            const id = input.taskId ? `message-${input.taskId}` : `manual-${input.requestId}`;
            const old = current.events.find(e => e.id === id);
            if (old) {
                if (old.kind === 'message' && old.text === body && old.by === input.sessionId && old.source?.digest === selected.digest)
                    return current;
                throw new Error('已存在不同结果或来源，不可覆盖');
            }
            let updated = current;
            let replyTo;
            if (input.taskId) {
                const found = findReleaseTask(current, input.taskId);
                if (!found || found.task.toSessionId !== input.sessionId)
                    throw new Error('所选回复必须来自本任务接收成员');
                if (!workflowTaskAllowed(current, found.task, false))
                    throw new Error('本次流程执行已结束或被替代，不能补交');
                if (found.task.attempts === 0)
                    throw new Error('任务尚未投递，请复制调整后放行或结束等待');
                if (!['delivered', 'in_progress', 'uncertain', 'failed'].includes(found.task.status))
                    throw new Error('只可补交已投递但未完成的任务');
                replyTo = found.draft.messageIds;
                const approved = await syncMeetingResultDocument(current, { taskId: input.taskId, title: found.draft.title ?? '任务成果', text: body, sessionId: input.sessionId, source });
                updated = updateTask(approved, input.taskId, t => { const next = { ...t, status: 'completed', result: body, resultMessageId: id, resultSource: source, completedAt: Date.now(), updatedAt: Date.now() }; delete next.error; return next; });
            }
            return { ...updated, events: [...updated.events, { id, kind: 'message', time: Date.now(), by: input.sessionId, text: body, source, ...(input.taskId ? { taskId: input.taskId, replyTo } : {}) }] };
        });
    });
}
