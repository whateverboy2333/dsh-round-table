/**
 * 会议持久化：`<DSH_HOME>/round-table/<meetingId>/meeting.json`。
 *
 * 磁盘是真相源：所有变更都在 promise 链锁内完成"读 → 改 → 原子写"，
 * 写盘成功后才把新状态返回给调用方；插件不持有权威内存副本。
 * （模式照抄 dsh-flat-teams 的 registry，本插件不依赖它。）
 *
 * 消息记录的取舍：meeting.json 的 events 只存"会议事件"——创建、入会将、
 * 广播投递（谁被投递了什么、送达/未送达）。完整对话内容以各窗口会话自身的
 * 日志为准（会话存储本来就在 DSH_HOME 全局共享），会议簿记不复制对话正文。
 * @module dsh-round-table/meetings
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { isMinutesRecord } from "./minutes-types.js";
import { isMeetingClosing } from "./meeting-activity.js";
import { isReleaseDraft } from "./meeting-flow-types.js";
import { isWorkflowState, isWorkflowMeetingLinks, assertWorkflowWritable } from "./workflow-state.js";
import { isDiscussionRecord } from "./discussion-types.js";
import { isMeetingFolder } from "./meeting-folder-types.js";
import { isMemberBriefing } from "./member-briefing-types.js";
import { isTaskCardMeetingFields } from "./task-card-types.js";
/** DSH_HOME 下的状态目录名。 */
export const STATE_DIR = 'round-table';
/** 全局状态根（<DSH_HOME>/round-table）：按调用解析（env 可变）。 */
export function stateRoot() {
    return dshHomePath(STATE_DIR);
}
// ── 形状校验（磁盘数据不可信，读入一律过校验） ──────────────────────────────
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function isDelivery(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const v = value;
    return typeof v['sessionId'] === 'string'
        && (v['status'] === 'delivered' || v['status'] === 'undelivered')
        && (v['error'] === undefined || typeof v['error'] === 'string');
}
const TASK_STATUSES = new Set([
    'pending', 'delivered', 'claimed', 'in_progress', 'completed', 'failed', 'cancelled', 'timeout',
]);
function isMeetingEvent(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const v = value;
    if (typeof v['id'] !== 'string' || typeof v['time'] !== 'number')
        return false;
    if (v['kind'] === 'message')
        return typeof v['by'] === 'string' && typeof v['text'] === 'string' && (v['taskId'] === undefined || typeof v['taskId'] === 'string') && (v['replyTo'] === undefined || isStringArray(v['replyTo']));
    if (v['kind'] === 'create')
        return typeof v['title'] === 'string';
    if (v['kind'] === 'rename')
        return typeof v['title'] === 'string' && typeof v['oldTitle'] === 'string';
    if (v['kind'] === 'description_update')
        return typeof v['description'] === 'string' && typeof v['oldDescription'] === 'string';
    if (v['kind'] === 'minutes')
        return typeof v['minutesId'] === 'string' && typeof v['title'] === 'string';
    if (v['kind'] === 'join')
        return typeof v['sessionId'] === 'string'
            && (v['source'] === undefined || v['source'] === 'existing' || v['source'] === 'preset' || v['source'] === 'secretary')
            && (v['presetId'] === undefined || typeof v['presetId'] === 'string')
            && (v['workspaceId'] === undefined || typeof v['workspaceId'] === 'string');
    if (v['kind'] === 'leave')
        return typeof v['sessionId'] === 'string';
    if (v['kind'] === 'broadcast') {
        return (v['by'] === 'user' || v['by'] === 'secretary') && typeof v['text'] === 'string'
            && Array.isArray(v['deliveries']) && v['deliveries'].every(isDelivery);
    }
    if (v['kind'] === 'task') {
        // 新任务记录用 meetingId/meetingTitle；R4 旧落盘 teamId/teamName 仍可读。
        const ownerOk = (typeof v['meetingId'] === 'string' && typeof v['meetingTitle'] === 'string')
            || (typeof v['teamId'] === 'string' && typeof v['teamName'] === 'string');
        return typeof v['taskId'] === 'string' && ownerOk
            && typeof v['toSessionId'] === 'string'
            && typeof v['toMember'] === 'string' && typeof v['title'] === 'string'
            && typeof v['status'] === 'string' && TASK_STATUSES.has(v['status'])
            && (v['result'] === undefined || typeof v['result'] === 'string')
            && (v['error'] === undefined || typeof v['error'] === 'string');
    }
    if (v['kind'] === 'debate') {
        return typeof v['topic'] === 'string' && typeof v['sponsorSessionId'] === 'string'
            && (v['status'] === 'running' || v['status'] === 'converged' || v['status'] === 'failed')
            && typeof v['rounds'] === 'number' && isStringArray(v['perspectiveLabels'])
            && Array.isArray(v['turns']) && typeof v['calls'] === 'number'
            && (v['conclusion'] === undefined || typeof v['conclusion'] === 'object')
            && (v['conclusionStopReason'] === undefined || typeof v['conclusionStopReason'] === 'string')
            && (v['error'] === undefined || typeof v['error'] === 'string');
    }
    return false;
}
export function isMeeting(value, meetingId) {
    if (typeof value !== 'object' || value === null)
        return false;
    const v = value;
    return v['meetingId'] === meetingId
        && (v['toolCreatorSessionId'] === undefined || typeof v['toolCreatorSessionId'] === 'string' && v['toolCreatorSessionId'].length > 0)
        && (v['toolCreatorIdentity'] === undefined || !!v['toolCreatorIdentity'] && typeof v['toolCreatorIdentity'] === 'object' && typeof v['toolCreatorSessionId'] === 'string' && Number.isFinite(v['toolCreatorIdentity'].createdAt) && typeof v['toolCreatorIdentity'].cwd === 'string' && !!v['toolCreatorIdentity'].cwd)
        && typeof v['title'] === 'string'
        && (v['description'] === undefined || typeof v['description'] === 'string')
        && (v['memberRoles'] === undefined || typeof v['memberRoles'] === 'object')
        && (v['briefedSessionIds'] === undefined || isStringArray(v['briefedSessionIds']))
        && (v['memberBriefings'] === undefined || Array.isArray(v['memberBriefings']) && v['memberBriefings'].every(isMemberBriefing) && new Set(v['memberBriefings'].map((b) => b.sessionId)).size === v['memberBriefings'].length)
        && (v['secretary'] === undefined || (typeof v['secretary'] === 'object' && v['secretary'] !== null))
        && (v['minutes'] === undefined || (Array.isArray(v['minutes']) && v['minutes'].every(isMinutesRecord)))
        && (v['releases'] === undefined || (Array.isArray(v['releases']) && v['releases'].every(isReleaseDraft)))
        && (v['discussions'] === undefined || (Array.isArray(v['discussions']) && v['discussions'].every(isDiscussionRecord)))
        && (v['meetingFolder'] === undefined || isMeetingFolder(v['meetingFolder']))
        && isTaskCardMeetingFields(v)
        && (v['workflow'] === undefined || isWorkflowState(v['workflow']))
        && (v['releasePaused'] === undefined || typeof v['releasePaused'] === 'boolean')
        && (v['pinnedAt'] === undefined || typeof v['pinnedAt'] === 'number' && Number.isFinite(v['pinnedAt']) && v['pinnedAt'] > 0)
        && isStringArray(v['memberSessionIds'])
        && typeof v['createdAt'] === 'number'
        && Array.isArray(v['events']) && v['events'].every(isMeetingEvent)
        && isWorkflowMeetingLinks(value);
}
// ── promise 链锁（参照 flat-teams registry / agent-teams withTeamLock） ─────
const locks = new Map();
export async function withMeetingLock(key, fn) {
    const previous = locks.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    locks.set(key, previous.then(() => gate));
    await previous;
    try {
        return await fn();
    }
    finally {
        release();
    }
}
function meetingLockKey(root, meetingId) {
    return `round-table:${root}:${meetingId}`;
}
// ── 原子写（Windows EPERM 重试 + 直写降级，同 flat-teams 策略） ─────────────
const ATOMIC_RENAME_RETRIES = 3;
const ATOMIC_RENAME_RETRY_DELAY_MS = 50;
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EEXIST', 'ENOTEMPTY']);
function isRetryableRenameError(error) {
    return error instanceof Error
        && 'code' in error
        && RETRYABLE_RENAME_CODES.has(error.code ?? '');
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 用同目录临时文件 + rename 原子替换目标文件；Windows 上目标被短暂占用
 * （无 FILE_SHARE_DELETE 打开）时 rename 抛 EPERM，重试几次后降级为直接覆写
 * （此时内容已完整落在临时文件，直写是内容等价的降级路径）。
 */
export async function atomicWriteText(file, content) {
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    }
    catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
    }
    for (let attempt = 0;; attempt += 1) {
        try {
            await rename(temporary, file);
            return;
        }
        catch (error) {
            if (isRetryableRenameError(error) && attempt < ATOMIC_RENAME_RETRIES) {
                await sleep(ATOMIC_RENAME_RETRY_DELAY_MS);
                continue;
            }
            let fallbackError;
            try {
                await writeFile(file, content, 'utf8');
            }
            catch (writeError) {
                fallbackError = writeError;
            }
            await rm(temporary, { force: true }).catch(() => undefined);
            if (fallbackError !== undefined) {
                throw new AggregateError([error, fallbackError], `failed to replace "${file}" atomically (${String(error)}) or by direct write (${String(fallbackError)})`);
            }
            return;
        }
    }
}
// ── 读写 API ────────────────────────────────────────────────────────────────
/** 读取会议记录；不存在返回 undefined；形状非法抛错。 */
export async function readMeeting(root, meetingId) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(meetingId))
        throw new Error('非法会议ID');
    let raw;
    try {
        raw = await readFile(join(root, meetingId, 'meeting.json'), 'utf8');
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
    const value = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    if (!isMeeting(value, meetingId)) {
        throw new Error(`round-table: 会议「${meetingId}」的 meeting.json 数据非法`);
    }
    return value;
}
/** 列出状态根下全部会议（按创建时间升序）；状态根不存在时为空。 */
export async function listMeetings(root) {
    let ids;
    try {
        const entries = await readdir(root, { withFileTypes: true });
        ids = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const meetings = [];
    for (const id of ids) {
        const meeting = await readMeeting(root, id);
        if (meeting !== undefined)
            meetings.push(meeting);
    }
    return meetings.sort((a, b) => a.createdAt - b.createdAt);
}
/** 新会议 id：时间序前缀 + 随机尾（目录名安全）。 */
function newMeetingId() {
    return `mt-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
/**
 * 创建会议（锁内落盘初始记录 + create 事件）。
 * 成员列表去重；空标题/非法成员由调用方（工具/路由）先行拒绝。
 */
export async function createMeeting(root, title, memberSessionIds, description = '', request) {
    if (request && (!/^[a-zA-Z0-9_-]{1,100}$/.test(request.requestId) || !request.workspaceId))
        throw Error('非法建会请求ID或工作区');
    const fingerprint = request ? createHash('sha256').update(JSON.stringify({ title, description, workspaceId: request.workspaceId, memberSessionIds: [...new Set(memberSessionIds)].sort() })).digest('hex') : undefined;
    const meetingId = request ? `mt-request-${createHash('sha256').update(request.requestId).digest('hex')}` : newMeetingId();
    return withMeetingLock(meetingLockKey(root, meetingId), async () => {
        if (request) {
            const old = await readMeeting(root, meetingId);
            if (old) {
                if (old.creationRequest?.requestId !== request.requestId || old.creationRequest.fingerprint !== fingerprint)
                    throw Error('建会请求ID已用于其他内容，请核对原会议');
                if (old.deletion || old.archivedAt)
                    throw Error('原创建请求对应的会议已归档或正在删除');
                return old;
            }
        }
        const now = Date.now();
        const meeting = {
            meetingId,
            title,
            description,
            ...(request ? { creationRequest: { requestId: request.requestId, fingerprint: fingerprint }, defaultWorkspaceId: request.workspaceId } : {}),
            memberRoles: {},
            briefedSessionIds: [],
            memberSessionIds: [...new Set(memberSessionIds)],
            createdAt: now,
            events: [{ id: randomUUID(), kind: 'create', time: now, title }],
        };
        const dir = join(root, meetingId);
        await mkdir(dir, { recursive: true });
        await atomicWriteText(join(dir, 'meeting.json'), `${JSON.stringify(meeting, null, 2)}\n`);
        return meeting;
    });
}
/**
 * 锁内"读 → 改 → 写"一个会议：mutate 返回**新的** Meeting 对象（纯函数风格），
 * 磁盘先更新，写盘成功后返回最新记录。会议不存在抛错；mutate 抛错时不写盘。
 */
export async function mutateMeeting(root, meetingId, mutate, management = false) {
    return withMeetingLock(meetingLockKey(root, meetingId), async () => {
        const meeting = await readMeeting(root, meetingId);
        if (meeting === undefined) {
            throw new Error(`会议不存在：${meetingId}`);
        }
        if (!management && (meeting.deletion || isMeetingClosing(root, meetingId)))
            throw new Error('会议已删除或正在删除');
        assertWorkflowWritable(meeting);
        const updated = await mutate(meeting);
        if (updated.pinnedAt !== undefined && (!Number.isFinite(updated.pinnedAt) || updated.pinnedAt <= 0))
            throw new Error('置顶状态非法');
        if (updated.workflow && !isWorkflowState(updated.workflow))
            throw new Error('拒绝保存损坏的流程状态');
        if (!isWorkflowMeetingLinks(updated))
            throw new Error('拒绝保存损坏的任务／流程绑定');
        if (!isTaskCardMeetingFields(updated))
            throw new Error('拒绝保存损坏的任务卡版本或发布记录');
        if (updated.meetingFolder && (!isMeetingFolder(updated.meetingFolder) || updated.meetingFolder.meetingId !== updated.meetingId))
            throw new Error('拒绝保存损坏的会议目录绑定');
        await atomicWriteText(join(root, meetingId, 'meeting.json'), `${JSON.stringify(updated, null, 2)}\n`);
        return updated;
    });
}
export async function requireActiveMeeting(root, meetingId) {
    const meeting = await readMeeting(root, meetingId);
    if (!meeting)
        throw new Error('会议不存在或已删除');
    if (meeting.deletion || isMeetingClosing(root, meetingId))
        throw new Error('会议已删除或正在删除');
    assertWorkflowWritable(meeting);
    return meeting;
}
export async function joinMeeting(root, meetingId, sessionId, origin) {
    return mutateMeeting(root, meetingId, (meeting) => {
        if (sessionId.startsWith('round-table-secretary-') || meeting.secretary?.sessionId === sessionId)
            throw new Error('秘书不可作为普通成员加入');
        if (meeting.memberSessionIds.includes(sessionId))
            return meeting;
        return {
            ...meeting,
            memberSessionIds: [...meeting.memberSessionIds, sessionId],
            events: [...meeting.events, { id: randomUUID(), kind: 'join', time: Date.now(), sessionId, ...(origin === undefined ? {} : origin) }],
        };
    });
}
/** 移除参会窗口（不在会则抛错；记 leave 事件）。 */
export async function leaveMeeting(root, meetingId, sessionId) {
    return mutateMeeting(root, meetingId, (meeting) => {
        if (!meeting.memberSessionIds.includes(sessionId)) {
            throw new Error(`窗口不在会议中：${sessionId}`);
        }
        return {
            ...meeting,
            memberSessionIds: meeting.memberSessionIds.filter((id) => id !== sessionId),
            releases: meeting.releases?.map(r => ({ ...r, tasks: r.tasks.map(t => t.toSessionId === sessionId && !['completed', 'failed', 'cancelled'].includes(t.status) ? { ...t, status: 'cancelled', closedAt: Date.now(), updatedAt: Date.now(), error: '成员已退会；结束等待，不停止原会话' } : t) })),
            discussions: meeting.discussions?.map(d => ({ ...d, deliveries: d.deliveries.map(x => x.toSessionId === sessionId && !['failed', 'cancelled'].includes(x.status) ? { ...x, status: 'cancelled', updatedAt: Date.now(), error: '成员已退会，结束本会等待；历史发言保留' } : x) })),
            events: [...meeting.events, { id: randomUUID(), kind: 'leave', time: Date.now(), sessionId }],
        };
    });
}
/** 记录一次广播投递（含每个成员的送达/未送达明细）。 */
export async function appendBroadcast(root, meetingId, text, deliveries) {
    return mutateMeeting(root, meetingId, (meeting) => ({
        ...meeting,
        events: [...meeting.events, { id: randomUUID(), kind: 'broadcast', time: Date.now(), by: 'user', text, deliveries }],
    }));
}
/** 记录一次任务派遣（初始状态 delivered/pending，后续由事件回流更新）。 */
export async function appendTaskEvent(root, meetingId, task) {
    return mutateMeeting(root, meetingId, (meeting) => ({
        ...meeting,
        events: [...meeting.events, { id: randomUUID(), kind: 'task', time: Date.now(), ...task }],
    }));
}
/**
 * 回流更新会议内某任务事件的状态（按 taskId 匹配；状态不变则不写盘）。
 * completed 带 result 摘要；failed/cancelled/timeout 带 error。
 * 会议内无此 taskId 时返回 undefined（不报错——任务可能与本会议无关）。
 */
export async function updateTaskStatus(root, meetingId, taskId, status, detail) {
    return withMeetingLock(meetingLockKey(root, meetingId), async () => {
        const meeting = await readMeeting(root, meetingId);
        if (meeting === undefined)
            return undefined;
        assertWorkflowWritable(meeting);
        if (!meeting.events.some((event) => event.kind === 'task' && event.taskId === taskId))
            return undefined;
        const updated = {
            ...meeting,
            events: meeting.events.map((event) => {
                if (event.kind !== 'task' || event.taskId !== taskId)
                    return event;
                if (event.status === status && detail === undefined)
                    return event;
                return {
                    ...event,
                    status,
                    ...(detail?.result !== undefined ? { result: detail.result } : {}),
                    ...(detail?.error !== undefined ? { error: detail.error } : {}),
                };
            }),
        };
        await atomicWriteText(join(root, meetingId, 'meeting.json'), `${JSON.stringify(updated, null, 2)}\n`);
        return updated;
    });
}
