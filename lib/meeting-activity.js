/** Reentrant admission gate: deleting meetings reject new work and drain admitted operations. */
import { AsyncLocalStorage } from 'node:async_hooks';
const scope = new AsyncLocalStorage();
const closed = new Set();
const active = new Map();
export const activityKey = (root, id) => `${root}:${id}`;
export function isMeetingClosing(root, id) { return closed.has(activityKey(root, id)); }
export function closeMeetingAdmission(root, id) { closed.add(activityKey(root, id)); }
export async function drainMeeting(root, id) { await Promise.all([...active.get(activityKey(root, id)) ?? []]); }
export async function withMeetingActivity(root, id, fn) {
    const key = activityKey(root, id);
    if (scope.getStore()?.has(key))
        return fn();
    if (closed.has(key))
        throw new Error('会议已删除或正在删除');
    let release;
    const done = new Promise(resolve => { release = resolve; });
    const set = active.get(key) ?? new Set();
    active.set(key, set);
    set.add(done);
    try {
        return await scope.run(new Set([...(scope.getStore() ?? []), key]), fn);
    }
    finally {
        release();
        set.delete(done);
        if (!set.size)
            active.delete(key);
    }
}
