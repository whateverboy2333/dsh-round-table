import { withMeetingActivity } from "./meeting-activity.js";
import { requireActiveMeeting } from "./meetings.js";
/** 会议归属任务：磁盘为真相源，状态迁移严格且每代都有 attemptId。 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appendTaskEvent, readMeeting, stateRoot, mutateMeeting } from "./meetings.js";
import { syncMeetingResultDocument } from "./meeting-files-sync.js";
const NEXT = { pending: ['delivered', 'cancelled'], delivered: ['claimed', 'cancelled'], claimed: ['in_progress', 'cancelled'], in_progress: ['completed', 'failed', 'cancelled'], completed: [], failed: [], cancelled: [] };
const locks = new Map();
function file(root, meetingId, taskId) { return join(root, meetingId, 'tasks', `${taskId}.json`); }
async function locked(key, action) { const prior = locks.get(key) ?? Promise.resolve(); let release; const mine = new Promise((resolve) => { release = resolve; }); locks.set(key, prior.then(() => mine)); await prior; try {
    return await action();
}
finally {
    release();
    if (locks.get(key) === mine)
        locks.delete(key);
} }
async function write(path, value) { await mkdir(join(path, '..'), { recursive: true }); const temp = `${path}.${randomUUID()}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await rename(temp, path); }
export async function getTask(root, meetingId, taskId) { try {
    const value = JSON.parse(await readFile(file(root, meetingId, taskId), 'utf8'));
    if (typeof value !== 'object' || value === null || value.taskId !== taskId)
        throw new Error(`任务 ${taskId} 数据非法`);
    return value;
}
catch (e) {
    if (e.code === 'ENOENT')
        return undefined;
    throw e;
} }
async function createTaskInternal(meetingId, toSessionId, title, prompt) { const root = stateRoot(); const meeting = await readMeeting(root, meetingId); if (meeting === undefined)
    throw new Error('会议不存在'); if (!meeting.memberSessionIds.includes(toSessionId))
    throw new Error('只能派遣给本会参会窗口'); const now = Date.now(); const task = { taskId: `task-${randomUUID()}`, meetingId, toSessionId, title, prompt, status: 'pending', attemptId: randomUUID(), createdAt: now, updatedAt: now }; await write(file(root, meetingId, task.taskId), task); try {
    await appendTaskEvent(root, meetingId, { taskId: task.taskId, meetingId, meetingTitle: meeting.title, toSessionId, toMember: toSessionId, title, status: 'pending' });
    return task;
}
catch (e) {
    await rm(file(root, meetingId, task.taskId), { force: true });
    throw e;
} }
async function transitionTaskInternal(meetingId, taskId, next, options = {}) {
    const root = stateRoot();
    return locked(`${meetingId}:${taskId}`, async () => {
        const current = await getTask(root, meetingId, taskId);
        if (!current)
            throw Error('任务不存在');
        if (options.expectedAttemptId !== undefined && options.expectedAttemptId !== current.attemptId)
            throw Error('任务已更新，请刷新后重试');
        if (!NEXT[current.status].includes(next))
            throw Error(`任务状态不能从 "${current.status}" 迁移到 "${next}"`);
        const updated = { ...current, status: next, attemptId: randomUUID(), updatedAt: Date.now(), ...(next === 'completed' && options.result !== undefined ? { result: options.result } : {}), ...((next === 'failed' || next === 'cancelled') && options.error !== undefined ? { error: options.error } : {}) };
        let taskWritten = false;
        try {
            await mutateMeeting(root, meetingId, async (m) => {
                const synced = next === 'completed' && options.result !== undefined ? await syncMeetingResultDocument(m, { taskId, title: current.title, text: options.result, sessionId: current.toSessionId, attemptId: current.attemptId }) : m;
                await write(file(root, meetingId, taskId), updated);
                taskWritten = true;
                return { ...synced, events: synced.events.map(event => event.kind === 'task' && event.taskId === taskId ? { ...event, status: next, ...(options.result !== undefined ? { result: options.result } : {}), ...(options.error !== undefined ? { error: options.error } : {}) } : event) };
            });
            return updated;
        }
        catch (error) {
            if (taskWritten)
                await write(file(root, meetingId, taskId), current);
            throw error;
        }
    });
}
export async function createTask(...args) { return withMeetingActivity(stateRoot(), args[0], async () => { await requireActiveMeeting(stateRoot(), args[0]); return createTaskInternal(...args); }); }
export async function transitionTask(...args) { return withMeetingActivity(stateRoot(), args[0], async () => { await requireActiveMeeting(stateRoot(), args[0]); return transitionTaskInternal(...args); }); }
