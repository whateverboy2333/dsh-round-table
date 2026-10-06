import {listStoredSessions,readStoredSession,settleStoredSession,locateStoredSession} from './host-runtime.ts'
import {collectSecretaryLogArtifacts,deleteSecretaryLogArtifacts} from './secretary-log-artifacts.ts'
import { withMeetingActivity } from './meeting-activity.ts';
import { requireActiveMeeting } from './meetings.ts';
/** P9-A: creation-time secretary composition; it never joins ordinary member routing. */
import { randomUUID } from 'node:crypto';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import type { Context } from '@deepseek-ai/cordis';
import { installModelSelection, type ModelSelection } from '@deepseek-ai/dsh-agent';
import { SessionId, type Session } from '@deepseek-ai/dsh-session';
import * as persona from '@deepseek-ai/dsh-persona';
import { mutateMeeting, readMeeting, listMeetings, type Meeting } from './meetings.ts';
interface SecretaryCacheTable { keys():IterableIterator<string>;delete(id:string):Promise<boolean> }
function secretaryCache(ctx:Context,required=false):SecretaryCacheTable|undefined {
 const domains=ctx.get('storageDomain') as {get(name:string):{table(name:string):SecretaryCacheTable}|undefined}|undefined
 const table=domains?.get('session_projcache')?.table('sessions')
 if(required&&ctx.get('sessionProjectionCache')&&!table)throw new Error('宿主秘书投影缓存尚未就绪，不能完成永久删除')
 return table
}
/** Remove only our orphaned cache rows; never creates storage or deletes a live log. */
export async function purgeOrphanSecretaryCache(ctx:Context,root:string):Promise<number>{
 const table=secretaryCache(ctx);if(!table)return 0
 const persistence=ctx.get('sessionPersistence') as {list():Promise<{id:string}[]>}|undefined
 const registry=ctx.get('workspaceRegistry') as {list():{sessionIds:readonly string[]}[]}|undefined
 if(!persistence||!registry)return 0
 const referenced=new Set((await listMeetings(root)).flatMap(m=>m.secretary?[m.secretary.sessionId]:[])),stored=new Set((await listStoredSessions(ctx)).map(s=>s.id)),attached=new Set(registry.list().flatMap(g=>[...g.sessionIds]))
 let removed=0
 for(const id of [...table.keys()])if(/^round-table-secretary-[0-9a-f-]{36}$/.test(id)&&!referenced.has(id)&&!stored.has(id)&&!attached.has(id)&&!ctx.agents.get(SessionId(id))){if(await table.delete(id))removed++}
 return removed
}
interface WorkspaceGroup {
    attachSession(sessionId: SessionId): Promise<void>;
}
interface Workspace {
    id: string;
    path: string;
    sessionIds: readonly SessionId[];
    attachSession(sessionId: SessionId): Promise<void>;
    status(): Promise<'ok' | 'missing-dir'>;
}
interface WorkspaceRegistry {
    get(id: string): Workspace | undefined;
}
interface SessionTitle {
    rename(session: Session, title: string): unknown;
}
const secretaryLocks = new Map<string, Promise<void>>();
const secretaryHandles = new Map<string, {
    dispose(): Promise<void>;
}>();
const protectedContexts = new WeakSet<object>();
const SECRETARY_PERSONA = '你是本会议的秘书，不参与讨论执行，只负责整理与汇报会议进展。不得修改任务、成员或项目文件。';
export async function disposeSecretaryHandles(): Promise<void> { const handles = [...secretaryHandles.values()]; secretaryHandles.clear(); const errors: unknown[] = []; for (const handle of handles) {
    try {
        await handle.dispose();
    }
    catch (error) {
        errors.push(error);
    }
} ; if (errors.length > 0)
    throw new AggregateError(errors, '秘书 handle 清理失败'); }
export function attachSecretaryLifecycle(ctx: Pick<Context, 'effect'> & Partial<Pick<Context, 'on'>>): void {
    ctx.effect(() => async () => { await disposeSecretaryHandles(); }, 'round-table: secretary handles');
    // Native web resume must not restore a secretary as a general-purpose writable agent.
    ctx.on?.('agent/created', ({ agent }) => {
        if (!String(agent.session.id).startsWith('round-table-secretary-') || protectedContexts.has(agent.ctx))
            return;
        agent.ctx.tools.restrict({ allow: [] });
        persona.apply(agent.ctx, { prefix: SECRETARY_PERSONA, suffix: '', complete: false, includeRuntimeContext: true });
        protectedContexts.add(agent.ctx);
        return undefined;
    });
}
async function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> { const previous = secretaryLocks.get(key) ?? Promise.resolve(); let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); const queued = previous.then(() => gate); secretaryLocks.set(key, queued); await previous; try {
    return await fn();
}
finally {
    release();
    if (secretaryLocks.get(key) === queued)
        secretaryLocks.delete(key);
} }
async function createSecretaryInternal(ctx: Context, root: string, meeting: Meeting, workspace: {
    workspaceId: string;
    path: string;
}): Promise<Meeting> {
    return serialized(`${root}:${meeting.meetingId}`, async () => {
        const latest = await readMeeting(root, meeting.meetingId);
        if (latest === undefined)
            throw new Error(`会议不存在：${meeting.meetingId}`);
        meeting = latest;
        if (meeting.secretary?.created && meeting.secretary.workspaceId !== workspace.workspaceId)
            throw new Error('已创建的秘书必须沿用原工作区');
        const registry = ctx.get('workspaceRegistry') as WorkspaceRegistry | undefined;
        const group = registry?.get(workspace.workspaceId);
        if (!group || group.id !== workspace.workspaceId || await group.status() !== 'ok')
            throw new Error('秘书默认工作区不可用');
        if (group.path)
            workspace = { workspaceId: group.id, path: group.path };
        if (meeting.secretary?.status === 'ready' && ctx.agents.get(SessionId(meeting.secretary.sessionId)) !== undefined && group.sessionIds.includes(SessionId(meeting.secretary.sessionId)))
            return meeting;
        // Reserve the id durably before host creation: retries never mint a second secretary.
        let retrying = meeting.secretary?.created === true;
        const reserved = meeting.secretary?.sessionId ?? `round-table-secretary-${randomUUID()}`;
        // Reconcile a crash after host creation but before the created flag was committed.
        const persistence = ctx.get('sessionPersistence') as {
            list(): Promise<{
                id: string;
            }[]>;
        } | undefined;
        if (!retrying && meeting.secretary && !ctx.agents.get(SessionId(reserved)) && persistence)
            retrying = (await listStoredSessions(ctx)).some(h => h.id === reserved);
        await mutateMeeting(root, meeting.meetingId, (current) => ({ ...current, secretary: { sessionId: reserved, workspaceId: workspace.workspaceId, status: 'initializing', created: current.secretary?.created === true } }));
        const sessionId = SessionId(reserved);
        const compose = async (agentCtx: Context): Promise<void> => {
            const defaults = ctx.get('agentDefaultModel') as {
                currentSelection(): ModelSelection;
            } | undefined;
            if (defaults)
                installModelSelection(agentCtx, { get current() { return defaults.currentSelection(); }, assembled: undefined });
            const fiber = agentCtx.plugin(persona, { prefix: SECRETARY_PERSONA, suffix: '' });
            if (fiber && typeof fiber.await === 'function')
                await fiber.await();
            agentCtx.tools.restrict({ allow: [] });
            protectedContexts.add(agentCtx);
        };
        let handle;
        let createdHandle = false;
        try {
            const live = ctx.agents.get(sessionId);
            handle = retrying && live === undefined
                ? await ctx.agents.resume({ resumeSessionId: sessionId, setup: compose })
                : live === undefined ? await ctx.agents.create({
                    sessionId,
                    meta: { cwd: workspace.path },
                    setup: compose,
                })
                    : { agent: live, dispose: async () => undefined };
            createdHandle = live === undefined;
            if (createdHandle)
                secretaryHandles.set(reserved, handle);
            await mutateMeeting(root, meeting.meetingId, (current) => ({ ...current, secretary: { sessionId: reserved, workspaceId: workspace.workspaceId, status: 'initializing', created: true } }));
            if (group === undefined || group.id !== workspace.workspaceId || await group.status() !== 'ok')
                throw new Error(`秘书会话 ${String(sessionId)} 已创建，但工作区不可用`);
            if (!group.sessionIds.includes(sessionId))
                await group.attachSession(sessionId);
            if (!group.sessionIds.includes(sessionId))
                throw new Error(`秘书会话 ${String(sessionId)} 未归属目标工作区`);
            const title = ctx.get('sessionTitle') as SessionTitle | undefined;
            if (title === undefined)
                throw new Error(`秘书会话 ${String(sessionId)} 已创建，但 sessionTitle 服务不可用`);
            title.rename(handle.agent.session, `秘书·${meeting.title}`);
        }
        catch (error) {
            await mutateMeeting(root, meeting.meetingId, (current) => ({ ...current, secretary: { sessionId: reserved, workspaceId: workspace.workspaceId, status: 'failed', created: current.secretary?.created === true, error: String(error) } }));
            throw error;
        }
        return mutateMeeting(root, meeting.meetingId, (current) => ({ ...current, defaultWorkspaceId: workspace.workspaceId, secretary: { sessionId: String(sessionId), workspaceId: workspace.workspaceId, status: 'ready', created: true }, events: current.events.some((event) => event.kind === 'join' && event.source === 'secretary' && event.sessionId === String(sessionId)) ? current.events : [...current.events, { id: randomUUID(), kind: 'join', time: Date.now(), sessionId: String(sessionId), source: 'secretary', workspaceId: workspace.workspaceId }] }));
    });
}

export async function createSecretary(...args: Parameters<typeof createSecretaryInternal>): Promise<Meeting> { return withMeetingActivity(args[1],args[2].meetingId,async()=>{await requireActiveMeeting(args[1],args[2].meetingId);return createSecretaryInternal(...args)}) }

/** User-confirmed meeting ownership is required; never select sessions by display name. */
export async function destroyMeetingSecretary(ctx:Context, meeting:Meeting):Promise<void> {
  const id=meeting.secretary?.sessionId
  if(!id)return
  if(!/^round-table-secretary-[0-9a-f-]{36}$/.test(id)||meeting.memberSessionIds.includes(id))throw new Error('秘书身份不符合会议专属会话约束，拒绝删除')
  const cache=secretaryCache(ctx,true)
  const persistence=ctx.get('sessionPersistence') as {
    list():Promise<{id:string}[]>; locate(meta:unknown):{path:string;kind:string}|undefined;
    readRaw(id:string):Promise<{meta:{id:string}}|undefined>;
    inspect(id:string):Promise<{meta:{id:string}}>;
  }|undefined
  if(!persistence)throw new Error('宿主缺少可校验的秘书日志存储，无法永久删除')
  const live=ctx.agents.get(SessionId(id))
  const handle=secretaryHandles.get(id)
  if(live&&!handle)throw new Error('秘书由宿主其他入口恢复，当前插件不拥有关闭句柄；请重启此 profile 后重试删除')
  const meta=live?.session.header??(await listStoredSessions(ctx)).find(h=>h.id===id)
  let target:string|undefined
  if(meta){
    const location=locateStoredSession(ctx,meta)
    if(!location||!['jsonl','jsonl.gz','jsonl-zstd','jsonl-gzip'].includes(location.kind))throw new Error('当前会话存储不支持安全永久删除秘书日志')
    target=location.path
    const raw=await readStoredSession(ctx,id)
    if(raw&&raw.meta.id!==id)throw new Error('秘书日志身份校验失败')
    await collectSecretaryLogArtifacts(dshHomePath(),id,target)
  }
  if(handle){await handle.dispose();secretaryHandles.delete(id)}
  if(ctx.agents.get(SessionId(id)))throw new Error('秘书仍在运行，拒绝删除日志')
  // session/disposed schedules a write-behind retirement. inspect waits for that
  // exact retirement, whereas readRaw/list only inspect files and can race it.
  if(handle||live){
    const settled=await settleStoredSession(ctx,id)
    if(settled.meta.id!==id)throw new Error('秘书持久化收尾身份校验失败')
  }
  const registry=ctx.get('workspaceRegistry') as {list():{sessionIds:readonly string[];detachSession(id:string):Promise<void>}[]}|undefined
  if(!registry)throw new Error('工作区登记服务不可用')
  for(const group of registry.list())if(group.sessionIds.includes(id))await group.detachSession(id)
  if(target){
    const raw=await readStoredSession(ctx,id)
    if(raw.meta.id!==id)throw new Error('删除前秘书日志身份校验失败')
    await deleteSecretaryLogArtifacts(dshHomePath(),id,target)
  }
  // Disposal checkpoint writes queue synchronously on the same domain chain;
  // deleting after disposal/log retirement also removes the durable cache row.
  if(cache)await cache.delete(id)
}

export async function syncSecretaryTitle(ctx:Context,root:string,meeting:Meeting):Promise<void> {
  if(!meeting.secretary)return
  const registry=ctx.get('workspaceRegistry') as WorkspaceRegistry|undefined
  const group=registry?.get(meeting.secretary.workspaceId)
  if(!group)throw new Error('秘书工作区不可用')
  await createSecretary(ctx,root,meeting,{workspaceId:group.id,path:group.path})
  const agent=ctx.agents.get(SessionId(meeting.secretary.sessionId))
  const title=ctx.get('sessionTitle') as SessionTitle|undefined
  if(!agent||!title)throw new Error('秘书标题服务不可用')
  title.rename(agent.session,`秘书·${meeting.title}`)
}
