import { SessionId } from '@deepseek-ai/dsh-session';
import { memberEvidence } from "./member-session-state.js";
import { readMeeting, stateRoot } from "./meetings.js";
/** Current SDK incarnation only: metadata observation never restores or binds a session. */
export async function authenticateMeetingToolActor(ctx, value) {
    const actor = value, id = actor?.session?.id;
    if (!id || ctx.agents.get(SessionId(id)) !== value)
        throw Error('缺少当前真实Agent身份，不能调用会议工具');
    const evidence = await memberEvidence(ctx, id);
    if (!['ready', 'busy'].includes(evidence.inspection.state) || !evidence.header || !evidence.header.cwd)
        throw Error(evidence.inspection.reason ?? '原Agent状态或档案不可确认');
    const agent = ctx.agents.get(SessionId(id));
    if (!agent || agent !== value)
        throw Error('当前Agent已被移除或替代');
    const expected = evidence.header, current = agent.session.header;
    if (['id', 'createdAt', 'cwd', 'parentSession', 'origin', 'isSeeded'].some(k => expected[k] !== current[k]) || (expected.delegationDepth ?? 0) !== (current.delegationDepth ?? 0))
        throw Error('当前Agent与原会话档案身份不同');
    return { sessionId: id, agent, identity: { createdAt: expected.createdAt, cwd: expected.cwd } };
}
export function ownsToolMeeting(m, actor) { return m.toolCreatorSessionId === actor.sessionId && m.toolCreatorIdentity?.createdAt === actor.identity.createdAt && m.toolCreatorIdentity.cwd === actor.identity.cwd; }
export function canReadToolMeeting(m, actor) { if (m.toolCreatorSessionId === actor.sessionId && !ownsToolMeeting(m, actor))
    return false; return !m.deletion && (m.memberSessionIds.includes(actor.sessionId) || m.secretary?.sessionId === actor.sessionId || ownsToolMeeting(m, actor)); }
export async function authorizeMeetingToolRead(ctx, meetingId, value) { const actor = await authenticateMeetingToolActor(ctx, value), meeting = await readMeeting(stateRoot(), meetingId); if (!meeting || !canReadToolMeeting(meeting, actor))
    throw Error('没有本会成员或创建者读取权限'); return { actor, meeting }; }
