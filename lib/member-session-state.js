import { SessionId } from '@deepseek-ai/dsh-session';
import { inboxHasPending } from "./host-runtime.js";
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
const restorations = new WeakMap();
const failures = new WeakMap();
const errorText = (error) => error instanceof Error ? error.message : String(error);
function identityFile(id) { return join(dshHomePath('round-table-member-identities'), createHash('sha256').update(id).digest('hex') + '.json'); }
function identityOf(evidence) {
    if (!evidence.header || !evidence.inspection.workspaceId)
        throw Error('原会话身份与工作区无法确认，未执行');
    const h = evidence.header;
    return { version: 1, header: { id: h.id, createdAt: h.createdAt, cwd: h.cwd, parentSession: h.parentSession, isSeeded: h.isSeeded, delegationDepth: h.delegationDepth, origin: h.origin }, preset: evidence.preset, workspaceId: evidence.inspection.workspaceId };
}
async function readIdentity(id) {
    let raw;
    try {
        raw = await readFile(identityFile(id), 'utf8');
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
            return;
        throw error;
    }
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw Error('原成员持久身份记录无法确认，未恢复／未投递');
    }
    if (value?.version !== 1 || value.header?.id !== id || !Number.isFinite(value.header.createdAt) || typeof value.header.cwd !== 'string' || typeof value.workspaceId !== 'string' || (value.preset !== undefined && typeof value.preset !== 'string'))
        throw Error('原成员持久身份记录非法，未恢复／未投递');
    return value;
}
function assertIdentity(bound, evidence) {
    if (!evidence.header || !sameHeader(bound.header, evidence.header) || bound.preset !== evidence.preset || bound.workspaceId !== evidence.inspection.workspaceId)
        throw Error('原成员身份、上下文或工作区与已绑定记录不同，拒绝替代会话；可移出会议');
}
/** An execution binds the original incarnation before calling the Host. Never
 * overwrite this record, including after failure, plugin reload or Host restart.
 * An incomplete/unreadable record fails closed instead of accepting a new id. */
async function bindIdentity(id, evidence) {
    const existing = await readIdentity(id);
    if (existing) {
        assertIdentity(existing, evidence);
        return;
    }
    const expected = identityOf(evidence), directory = dshHomePath('round-table-member-identities');
    await mkdir(directory, { recursive: true });
    let handle;
    try {
        handle = await open(identityFile(id), 'wx', 0o600);
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
            const raced = await readIdentity(id);
            if (!raced)
                throw Error('原成员身份绑定未完成，未执行');
            assertIdentity(raced, evidence);
            return;
        }
        throw error;
    }
    try {
        await handle.writeFile(JSON.stringify(expected) + '\n', 'utf8');
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    // The disk record, rather than a WeakMap, guards subsequent attempts.
    const committed = await readIdentity(id);
    if (!committed)
        throw Error('原成员身份绑定未持久化，未执行');
    assertIdentity(committed, evidence);
}
function registry(ctx) {
    const value = ctx.get('workspaceRegistry');
    if (!value || !Array.isArray(value.archivedSessionIds) || typeof value.list !== 'function')
        throw Error('宿主权威归档与工作区名册不可读取，未恢复／未投递');
    return value;
}
export function memberIsArchived(ctx, id) { return registry(ctx).archivedSessionIds.includes(id); }
export function memberIsRestoring(ctx, id) { return !!restorations.get(ctx)?.has(id); }
/** Exact SDK observation; browsing this function never loads or wakes an Agent. */
export async function memberEvidence(ctx, id, includeTransient = true) {
    let observation;
    try {
        const groups = registry(ctx);
        if (groups.archivedSessionIds.includes(id))
            return { inspection: { state: 'archived', reason: '原成员会话已归档；不会自动解除归档，可在会议内移出成员' } };
        const query = ctx.get('sessionQuery');
        if (!query?.observeSession)
            throw Error('宿主只读会话状态接口不可用，无法确认原会话是否存在');
        observation = await query.observeSession(id, { projectionMode: 'all' });
        const header = observation.header;
        if (header.id !== id || !Number.isFinite(header.createdAt))
            throw Error('宿主原会话身份无法确认');
        if (header.origin === 'subagent' || (header.delegationDepth ?? 0) > 0)
            throw Error('该原会话属于子代理生命周期，不能作为普通成员自动恢复');
        if (!observation.projections)
            throw Error('宿主没有提供原会话预设投影，无法确认恢复的工具与权限');
        const originalPreset = observation.projections.values.agentPreset;
        if (originalPreset !== undefined && originalPreset !== null && typeof originalPreset !== 'string')
            throw Error('原会话预设投影格式无法确认');
        const workspace = groups.list().find(w => w.sessionIds.includes(id) && w.path === header.cwd);
        if (!workspace || !header.cwd)
            throw Error('原成员会话的工作区无法确认，不会恢复到未分区或其他目录');
        if (await workspace.status() !== 'ok')
            throw Error('原成员工作区目录不可用，未恢复／未投递');
        if (groups.archivedSessionIds.includes(id))
            return { inspection: { state: 'archived', reason: '原成员会话已归档，未恢复／未投递', workspaceId: workspace.id, cwd: header.cwd } };
        const evidence = { inspection: { state: 'unloaded', workspaceId: workspace.id, cwd: header.cwd }, header: { ...header }, preset: typeof originalPreset === 'string' ? originalPreset : undefined, workspace };
        const bound = await readIdentity(id);
        if (bound)
            assertIdentity(bound, evidence);
        const agent = ctx.agents.get(SessionId(id)), state = includeTransient && memberIsRestoring(ctx, id) ? 'restoring' : agent ? (agent.status === 'running' || inboxHasPending(agent.inbox) ? 'busy' : 'ready') : includeTransient && failures.get(ctx)?.has(id) ? 'restore_failed' : 'unloaded';
        const reason = state === 'restoring' ? '正在恢复同一原会话，完成后继续已授权操作' : state === 'restore_failed' ? failures.get(ctx)?.get(id) : state === 'unloaded' ? '原会话有效，执行时由插件恢复；查看不会唤醒' : state === 'busy' ? '原成员正在处理输入，会议操作按宿主队列等待' : undefined;
        return { ...evidence, inspection: { state, reason, workspaceId: workspace.id, cwd: header.cwd } };
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND')
            return { inspection: { state: 'deleted', reason: '宿主确认原会话已不存在／已删除，不会新建替代会话；可在会议内移出成员' } };
        return { inspection: { state: 'unknown', reason: `原会话状态无法确认：${errorText(error)}；可在会议内重试，不能视为已删除` } };
    }
    finally {
        observation?.[Symbol.dispose]();
    }
}
export async function inspectMember(ctx, id) { return (await memberEvidence(ctx, id)).inspection; }
function sameHeader(original, current) { return original.id === current.id && original.createdAt === current.createdAt && original.cwd === current.cwd && original.parentSession === current.parentSession && original.isSeeded === current.isSeeded && (original.delegationDepth ?? 0) === (current.delegationDepth ?? 0) && original.origin === current.origin; }
/** Only call after the user has authorized execution or joining. Never substitutes a new session. */
export async function memberForExecution(ctx, id) {
    const pending = restorations.get(ctx)?.get(id);
    if (pending)
        return pending;
    const run = (async () => {
        let evidence = await memberEvidence(ctx, id, false);
        if (!['ready', 'busy', 'unloaded'].includes(evidence.inspection.state))
            throw Error(evidence.inspection.reason ?? '原会话不可执行');
        await bindIdentity(id, evidence);
        // Binding involves disk I/O. Recheck archive/deletion and incarnation after
        // that boundary before returning even an already-loaded Agent.
        const current = await memberEvidence(ctx, id, false);
        if (!['ready', 'busy', 'unloaded'].includes(current.inspection.state))
            throw Error(current.inspection.reason ?? '原会话不可执行');
        assertIdentity(identityOf(evidence), current);
        const live = ctx.agents.get(SessionId(id));
        if (live) {
            if (!evidence.header || !sameHeader(evidence.header, live.session.header))
                throw Error('当前Agent与原会话身份不同，未投递');
            return live;
        }
        const api = ctx.get('sessionController');
        if (!api || typeof api.resolveAgent !== 'function' || !evidence.header || !evidence.workspace)
            throw Error('宿主仅恢复原会话的完整接口不可用，未新建替代窗口');
        failures.get(ctx)?.delete(id);
        try {
            // session.create is create-or-adopt and creates a NEW empty incarnation when
            // the original is deleted after our observation. resolveAgent only resumes
            // existing persistence and retains the Host's preset/tool/model composition.
            const response = await api.resolveAgent(SessionId(id));
            if ('error' in response) {
                if (response.error && typeof response.error === 'object' && 'code' in response.error && response.error.code === 'session/not-found')
                    throw Error('宿主确认原会话已不存在／已删除，不会新建替代会话；可在会议内移出成员');
                throw response.error;
            }
            if (response.agent.session.header.id !== id)
                throw Error('宿主恢复了不同会话身份，未投递');
            const restored = await memberEvidence(ctx, id, false), agent = ctx.agents.get(SessionId(id));
            if (!['ready', 'busy'].includes(restored.inspection.state) || !agent)
                throw Error(restored.inspection.reason ?? '原会话恢复后尚未就绪');
            if (!restored.header || !sameHeader(evidence.header, restored.header) || !sameHeader(evidence.header, agent.session.header) || evidence.preset !== restored.preset || evidence.inspection.workspaceId !== restored.inspection.workspaceId)
                throw Error('原会话身份、上下文或工作区在恢复期间已改变，未投递');
            return agent;
        }
        catch (error) {
            let table = failures.get(ctx);
            if (!table) {
                table = new Map();
                failures.set(ctx, table);
            }
            table.set(id, `恢复原会话失败：${errorText(error)}；可在会议内重试`);
            throw error;
        }
    })();
    let table = restorations.get(ctx);
    if (!table) {
        table = new Map();
        restorations.set(ctx, table);
    }
    table.set(id, run);
    try {
        return await run;
    }
    finally {
        if (table.get(id) === run)
            table.delete(id);
    }
}
