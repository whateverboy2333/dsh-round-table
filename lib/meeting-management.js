import { randomUUID } from 'node:crypto';
import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm/message';
import { readMeeting, mutateMeeting, requireActiveMeeting, withMeetingLock, stateRoot, listMeetings } from "./meetings.js";
import { closeMeetingAdmission, drainMeeting, withMeetingActivity } from "./meeting-activity.js";
import { quiesceMeetingMinutes } from "./minutes.js";
import { destroyMeetingSecretary, syncSecretaryTitle } from "./secretary.js";
import { markMeetingFolderDeleted, syncMeetingFolderInstructions } from "./meeting-folder.js";
/** Walk only the exact owned directory; reject symlinks/junctions at every level. */
export async function checkedMeetingDirectory(root, id) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id))
        throw new Error('非法会议ID');
    const base = resolve(root), target = resolve(base, id), rel = relative(base, target);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel !== id)
        throw new Error('会议删除路径越界');
    const rootStat = await lstat(base).catch((e) => { if (e.code === 'ENOENT')
        return undefined; throw e; });
    if (!rootStat)
        return undefined;
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
        throw new Error('圆桌根目录不能是链接');
    const stat = await lstat(target).catch((e) => { if (e.code === 'ENOENT')
        return undefined; throw e; });
    if (!stat)
        return undefined;
    const actualBase = await realpath(base);
    async function walk(path) {
        const s = await lstat(path);
        if (s.isSymbolicLink())
            throw new Error('会议目录包含链接，拒绝递归删除');
        const actual = await realpath(path), r = relative(actualBase, actual);
        if (!r || r.startsWith('..') || isAbsolute(r))
            throw new Error('会议目录解析后越界');
        if (s.isDirectory())
            for (const entry of await readdir(path))
                await walk(join(path, entry));
    }
    if (!stat.isDirectory())
        throw new Error('会议状态不是目录');
    await walk(target);
    return target;
}
export async function editMeeting(ctx, id, title, description) {
    const root = stateRoot();
    title = title.trim();
    description = description.trim();
    if (!title)
        throw new Error('会议标题不能为空');
    return withMeetingActivity(root, id, () => withMeetingLock(`management:${root}:${id}`, async () => {
        await requireActiveMeeting(root, id);
        let changed = false;
        let meeting = await mutateMeeting(root, id, async (m) => { const events = [...m.events]; if (m.title !== title) {
            changed = true;
            events.push({ id: randomUUID(), kind: 'rename', time: Date.now(), oldTitle: m.title, title });
        } if ((m.description ?? '') !== description)
            events.push({ id: randomUUID(), kind: 'description_update', time: Date.now(), oldDescription: m.description ?? '', description }); return syncMeetingFolderInstructions({ ...m, title, description, events }); });
        if (meeting.secretary && (changed || meeting.secretaryTitleError)) {
            let error;
            try {
                await syncSecretaryTitle(ctx, root, meeting);
            }
            catch (e) {
                error = e instanceof Error ? e.message : String(e);
            }
            meeting = await mutateMeeting(root, id, m => { const updated = { ...m }; if (error)
                updated.secretaryTitleError = error;
            else
                delete updated.secretaryTitleError; return updated; });
        }
        return meeting;
    }));
}
const deletes = new Map();
export async function deleteMeeting(ctx, id, confirmed, notify = true) {
    if (confirmed !== true)
        throw new Error('永久删除必须二次确认');
    const root = stateRoot(), key = `${root}:${id}`;
    if (deletes.has(key))
        return deletes.get(key);
    const work = (async () => {
        const target = await checkedMeetingDirectory(root, id);
        if (!target)
            return { deleted: true, deliveries: [] };
        let meeting = await readMeeting(root, id);
        if (!meeting)
            throw new Error('会议记录不存在，拒绝删除不明目录');
        if (meeting.secretary) {
            for (const other of await listMeetings(root))
                if (other.meetingId !== id && other.secretary?.sessionId === meeting.secretary.sessionId)
                    throw new Error('秘书被其他会议引用，拒绝删除');
        }
        closeMeetingAdmission(root, id);
        meeting = await mutateMeeting(root, id, m => ({ ...m, deletion: m.deletion ?? { startedAt: Date.now(), notify, deliveries: [] } }), true);
        try {
            await quiesceMeetingMinutes(root, id);
            await drainMeeting(root, id);
            return await withMeetingLock(`management:${root}:${id}`, async () => {
                meeting = (await readMeeting(root, id));
                const deliveries = [...meeting.deletion.deliveries];
                if (meeting.deletion.notify)
                    for (const sid of meeting.memberSessionIds) {
                        if (deliveries.some(d => d.sessionId === sid))
                            continue;
                        // Record intent first: crashes do not duplicate dissolution notifications.
                        const delivery = { sessionId: sid, status: 'undelivered', error: '通知结果不确定，重试不重复发送' };
                        deliveries.push(delivery);
                        await mutateMeeting(root, id, m => ({ ...m, deletion: { ...m.deletion, deliveries: [...deliveries] } }), true);
                        try {
                            const agent = ctx.agents.get(SessionId(sid));
                            if (!agent)
                                throw new Error('成员离线');
                            agent.followup(createUserMessage({ content: [{ type: 'text', text: `会议「${meeting.title}」已解散。普通成员会话保留；此通知不会自动停止你正在进行的工作。` }], source: { kind: 'round-table', plugin: 'dsh-round-table' } }));
                            delivery.status = 'delivered';
                            delete delivery.error;
                        }
                        catch (e) {
                            delivery.error = String(e instanceof Error ? e.message : e);
                        }
                        await mutateMeeting(root, id, m => ({ ...m, deletion: { ...m.deletion, deliveries: [...deliveries] } }), true);
                    }
                if (!meeting.deletion.secretaryDeleted) {
                    await destroyMeetingSecretary(ctx, meeting);
                    await mutateMeeting(root, id, m => ({ ...m, deletion: { ...m.deletion, secretaryDeleted: true } }), true);
                }
                await markMeetingFolderDeleted(meeting);
                const checked = await checkedMeetingDirectory(root, id);
                if (checked)
                    await rm(checked, { recursive: true, force: false });
                return { deleted: true, deliveries };
            });
        }
        catch (error) {
            await mutateMeeting(root, id, m => ({ ...m, deletion: { ...m.deletion, error: String(error instanceof Error ? error.message : error) } }), true).catch(() => { });
            throw error;
        }
    })().finally(() => deletes.delete(key));
    deletes.set(key, work);
    return work;
}
