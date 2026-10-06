/**
 * 会议工具：meeting_create / meeting_list / meeting_join。
 *
 * 磁盘为真相源：每个工具都经 meetings 的锁内"读 → 改 → 写"，不持有权威内存状态。
 * 工具是 agent 面的数据能力；UI（浏览器面板）走 route-meetings 的 HTTP 端点，
 * 两边共用同一套 store 函数。
 * @module dsh-round-table/tools-meeting
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createMeeting, listMeetings, readMeeting, mutateMeeting, stateRoot, type Meeting } from './meetings.ts'
import {ensureMeetingFolder,registerMeetingFolderTools} from './meeting-folder.ts'
import {registerTaskCardTools} from './task-cards.ts'
import {syncMeetingFolderInstructions} from './meeting-folder.ts'
import { getTask, transitionTask } from './tasks.ts'
import { meetingMinutesData } from './minutes.ts'
import { createSecretary } from './secretary.ts'
import { findReleaseTask, claimReleaseTask, submitReleaseResult, failReleaseTask } from './meeting-flow.ts'
import {ensureMemberBriefing} from './member-briefing.ts'
import {replyDiscussion} from './discussion.ts'
import {authenticateMeetingToolActor,authorizeMeetingToolRead,canReadToolMeeting,ownsToolMeeting} from './meeting-tool-auth.ts'
import {memberEvidence} from './member-session-state.ts'

/** 工具输出的会议视图类型（与下方 meetingSchema 的推断类型结构一致）。 */
interface MeetingView {
  meetingId: string
  title: string
  memberSessionIds: string[]
  createdAt: number
  events: {
    id: string
    kind: string
    time: number
    title?: string
    sessionId?: string
    by?: string
    text?: string
    deliveries?: { sessionId: string; status: string; error?: string }[]
  }[]
}

/** 工具输出的会议视图（events 也带上——模型要能看到投递历史）。 */
function meetingView(meeting: Meeting): MeetingView {
  return {
    meetingId: meeting.meetingId,
    title: meeting.title,
    memberSessionIds: [...meeting.memberSessionIds],
    createdAt: meeting.createdAt,
    events: meeting.events.map((event) => {
      const projected=event.kind==='message'&&event.source?{...event,source:event.source.kind,sourceSessionId:event.source.sessionId,sourceSeq:event.source.seq,sourceTime:event.source.originalTime}:event
      return Object.fromEntries(Object.entries(projected).filter(([key,value]) => key in eventSchema.properties&&value!==undefined))
    }) as MeetingView['events'],
  }
}

/** 会议事件输出规格（三态 union 的宽容投影：kind 决定可选字段含义）。 */
const eventSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    kind: { type: 'string', required: true, description: 'create | join | broadcast' },
    time: { type: 'integer', required: true },
    title: { type: 'string', description: 'create 事件的会议标题' },
    sessionId: { type: 'string', description: 'join 事件的入会会话' },
    source: { type: 'string', description: '入会来源' },
    sourceSessionId: { type:'string', description:'正式结果的原会话' },
    sourceSeq: { type:'integer', description:'人工发布的原回复序号' },
    sourceTime: { type:'number', description:'原回复时间' },
    presetId: { type: 'string', description: '预设新建来源的 preset id' },
    workspaceId: { type: 'string', description: '预设新建来源的工作区 id' },
    by: { type: 'string', description: 'broadcast 事件的发起者（user）' },
    text: { type: 'string', description: 'broadcast 事件的用户原文（投递时带会议标签前缀）' },
    deliveries: {
      type: 'array',
      description: 'broadcast 事件的逐窗口投递明细',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', required: true },
          status: { type: 'string', required: true, description: 'delivered | undelivered' },
          error: { type: 'string', description: '未送达原因' },
        },
      },
    },
    taskId: { type: 'string', description: '会议内嵌任务 id' },
    discussionId: {type:'string',description:'被明确授权的普通讨论消息编号'},
    contextTaskId: {type:'string',description:'仅作澄清关联的既有任务编号，不变更任务状态'},
    meetingId: { type: 'string', description: '任务所属会议 id' },
    meetingTitle: { type: 'string', description: '任务所属会议标题' },
    teamId: { type: 'string', description: '旧任务记录兼容字段' },
    teamName: { type: 'string', description: '旧任务记录兼容字段' },
    toSessionId: { type: 'string', description: '任务接收窗口' },
    toMember: { type: 'string', description: '旧记录兼容字段；接收窗口 id' },
    status: { type: 'string', description: '任务状态' },
    result: { type: 'string', description: '任务完成摘要' },
    error: { type: 'string', description: '任务失败/取消原因' },
    minutesId: { type: 'string', description: '纪要ID' },
    oldTitle: { type: 'string' },
    oldDescription: { type: 'string' },
    description: { type: 'string' },
    replyTo: { type: 'array', items: { type: 'string' } },
  },
} as const

const meetingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    meetingId: { type: 'string', required: true },
    title: { type: 'string', required: true },
    memberSessionIds: { type: 'array', required: true, items: { type: 'string' } },
    createdAt: { type: 'integer', required: true },
    events: { type: 'array', required: true, items: eventSchema },
  },
} as const

export function registerMeetingTools(ctx: Context): void {
  registerMeetingFolderTools(ctx)
  registerTaskCardTools(ctx)
  ctx.tools.register(defineTool({
    name:'meeting_reply_message',description:'回传主持人明确投递给你的本次普通讨论回复。仅回应该discussionId的正文和所选资料，不公开其他私聊；不会认领、完成或验收任务，不自动唤醒别人。可多次反馈；相同正文重试幂等。',
    parameters:{meetingId:{type:'string',required:true},discussionId:{type:'string',required:true},text:{type:'string',required:true},requestId:{type:'string',description:'本次回复稳定请求编号，新阶段用新编号，同次重试保持原编号与正文'}},
    output:{schema:{type:'object',additionalProperties:false,properties:{discussionId:{type:'string',required:true},messageId:{type:'string',required:true}}},render:(_args,v)=>[{type:'text',text:`讨论回复已记录：${v.messageId}`}]},
    async execute(args,exec){if(!exec.agent)throw Error('缺少真实接收成员身份');return replyDiscussion(ctx,String(args.meetingId),String(args.discussionId),exec.agent,String(args.text),args.requestId===undefined?undefined:String(args.requestId))},
  }))
  ctx.tools.register(defineTool({
    name:'meeting_submit_result',description:'将本次手动放行任务的正式最终结果提交到会议。只允许指定接收成员调用；不自动转发或触发下一轮。不要提交无关私聊内容。',
    parameters:{meetingId:{type:'string',required:true},taskId:{type:'string',required:true},result:{type:'string',required:true}},
    output:{schema:{type:'object',additionalProperties:false,properties:{taskId:{type:'string',required:true},status:{type:'string',required:true},messageId:{type:'string',required:true}}},render:(_args,v)=>[{type:'text',text:`正式结果已提交到会议：${v.messageId}`} ]},
    async execute(args,exec){const actor=await authenticateMeetingToolActor(ctx,exec?.agent);const t=await submitReleaseResult(String(args.meetingId),String(args.taskId),actor.sessionId,String(args.result));return {taskId:t.taskId,status:t.status,messageId:t.resultMessageId!}},
  }))
  ctx.tools.register(defineTool({
    name: 'meeting_minutes_data', description: '只读取得会议指定范围的簿记与成员真实发言。snapshot 为完整 JSON，不修改会议或任务状态。',
    parameters: { meetingId: { type: 'string', required: true }, scope: { type: 'string', description: 'full 或 since_last，默认 full' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { snapshot: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: value.snapshot }] },
    async execute(args,exec) { const scope = args.scope ?? 'full'; if (scope !== 'full' && scope !== 'since_last') throw new Error('scope 必须为 full 或 since_last');const id=String(args.meetingId);await authorizeMeetingToolRead(ctx,id,exec?.agent);const data=await meetingMinutesData(ctx,id,scope);await authorizeMeetingToolRead(ctx,id,exec?.agent);return { snapshot: JSON.stringify(data) } },
  }))
  ctx.tools.register(defineTool({
    name: 'meeting_create',
    description:
      '创建一个圆桌会议（聊天室）。标题必填；可通过 memberSessionIds 预置参会窗口（会话 id 列表）。' +
      '会议状态持久化到 <DSH_HOME>/round-table/ 下，重启后仍在。面板（侧边栏「圆桌」按钮）会显示该会议。',
    parameters: {
      title: { type: 'string', required: true, description: '会议标题' },
      workspaceId: { type: 'string', required: true, description: '会议默认工作区ID，秘书必须归属此工作区' },
      description: { type: 'string', description: '会议背景与目标' },
      memberSessionIds: {
        type: 'array',
        items: { type: 'string' },
        description: '可选的参会窗口会话 id 列表',
      },
    },
    output: {
      schema: meetingSchema,
      render: (_args, value) => [{ type: 'text', text: `会议「${value.title}」已创建（${value.meetingId}），${value.memberSessionIds.length} 个参会窗口` }],
    },
    async execute(args,exec) {
      const actor=await authenticateMeetingToolActor(ctx,exec?.agent)
      if(actor.sessionId.startsWith('round-table-secretary-')||(await listMeetings(stateRoot())).some(m=>m.secretary?.sessionId===actor.sessionId))throw Error('专属秘书没有创建会议或邀请成员权限')
      const title = String(args['title'] ?? '').trim()
      if (title === '') throw new Error('meeting_create: title 不能为空')
      const members = [...new Set(Array.isArray(args['memberSessionIds']) ? args['memberSessionIds'].map(String) : [])]
      for(const member of members){if(member.startsWith('round-table-secretary-')||(await listMeetings(stateRoot())).some(m=>m.secretary?.sessionId===member))throw Error('专属秘书不可作为普通参会成员邀请');const evidence=await memberEvidence(ctx,member);if(!['ready','busy','unloaded'].includes(evidence.inspection.state))throw Error(evidence.inspection.reason??'所选原成员状态无法确认')}
      const registry = ctx.get('workspaceRegistry') as { get(id:string): {id:string;path:string;status():Promise<string>}|undefined } | undefined
      const workspace = registry?.get(String(args.workspaceId))
      if (!workspace || await workspace.status() !== 'ok') throw new Error('请选择有效会议默认工作区')
      const meeting = await createMeeting(stateRoot(), title, members, String(args.description ?? ''))
      await mutateMeeting(stateRoot(),meeting.meetingId,async m=>{const current=await authenticateMeetingToolActor(ctx,exec?.agent);if(current.identity.createdAt!==actor.identity.createdAt||current.identity.cwd!==actor.identity.cwd)throw Error('创建者原身份已变化，不授予会议权限');return {...m,defaultWorkspaceId:workspace.id,toolCreatorSessionId:actor.sessionId,toolCreatorIdentity:{...actor.identity}}})
      try { await ensureMeetingFolder(ctx,meeting.meetingId);await createSecretary(ctx, stateRoot(), (await readMeeting(stateRoot(),meeting.meetingId))!, {workspaceId:workspace.id,path:workspace.path});for(const sessionId of members){const fresh=await authorizeMeetingToolRead(ctx,meeting.meetingId,exec?.agent);if(!ownsToolMeeting(fresh.meeting,fresh.actor))throw Error('原创建者身份已变化，不发送新成员简报');await ensureMemberBriefing(ctx,meeting.meetingId,sessionId,'参会成员')}return meetingView((await authorizeMeetingToolRead(ctx,meeting.meetingId,exec?.agent)).meeting) }
      catch(error){ throw new Error(`会议已创建（${meeting.meetingId}），目录、秘书或成员简报步骤未完成。请在面板恢复原会议；成员简报用 meeting_join 重试这个原meetingId，不要重新meeting_create或替换成员身份：${String(error)}`) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'meeting_list',
    description: '只列出当前真实Agent已参加、本人创建或担任专属秘书的会议及其正式事件；不公开其他会议。无副作用。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          meetings: { type: 'array', required: true, items: meetingSchema },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.meetings.length === 0
          ? '（暂无会议）'
          : value.meetings.map((m) => `「${m.title}」(${m.meetingId}) ${m.memberSessionIds.length} 窗口`).join('\n'),
      }],
    },
    async execute(_args,exec) {
      await authenticateMeetingToolActor(ctx,exec?.agent)
      const meetings = await listMeetings(stateRoot())
      const actor=await authenticateMeetingToolActor(ctx,exec?.agent),current=await Promise.all(meetings.filter(m=>canReadToolMeeting(m,actor)).map(m=>readMeeting(stateRoot(),m.meetingId)))
      if(ctx.agents.get(actor.agent.session.id)!==actor.agent)throw Error('当前真实Agent已离开，不能读取')
      return { meetings: current.filter((m):m is Meeting=>!!m&&canReadToolMeeting(m,actor)).map(meetingView) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'meeting_join',
    description: '原创建Agent可邀请指定原会话；普通成员只能幂等确认自己已经加入的会议，不能自行加入其他会议或邀请别人。历史会议成员由宿主用户面板管理。',
    parameters: {
      meetingId: { type: 'string', required: true, description: '会议 id' },
      sessionId: { type: 'string', required: true, description: '要入会的会话 id' },
    },
    output: {
      schema: meetingSchema,
      render: (_args, value) => [{ type: 'text', text: `已加入会议「${value.title}」，现有 ${value.memberSessionIds.length} 个参会窗口` }],
    },
    async execute(args,exec) {
      const sessionId = String(args['sessionId'] ?? '').trim()
      if (sessionId === '') throw new Error('meeting_join: sessionId 不能为空')
      const meetingId=String(args['meetingId'])
      const actor=await authenticateMeetingToolActor(ctx,exec?.agent),existing=await readMeeting(stateRoot(),meetingId)
      if(!existing||existing.deletion)throw Error('没有本会创建者邀请权限')
      if(!ownsToolMeeting(existing,actor)){
        if(actor.sessionId===sessionId&&existing.memberSessionIds.includes(sessionId)){const fresh=await authorizeMeetingToolRead(ctx,meetingId,exec?.agent);if(!fresh.meeting.memberSessionIds.includes(sessionId))throw Error('成员已经离会，不能自行重新加入');const pending=fresh.meeting.memberBriefings?.find(b=>b.sessionId===sessionId);if(pending&&!['delivered','cancelled'].includes(pending.status)){await ensureMemberBriefing(ctx,meetingId,sessionId,pending.role);return meetingView((await authorizeMeetingToolRead(ctx,meetingId,exec?.agent)).meeting)}return meetingView(fresh.meeting)}
        throw Error('只有原创建者可邀请；普通成员只能确认自己已加入的会议，不能自行授予权限')
      }
      const evidence=await memberEvidence(ctx,sessionId);if(!['ready','busy','unloaded'].includes(evidence.inspection.state))throw Error(evidence.inspection.reason??'原目标成员状态不可确认')
      const joined=await mutateMeeting(stateRoot(),meetingId,async m=>{
        const current=await authenticateMeetingToolActor(ctx,exec?.agent);if(!ownsToolMeeting(m,current)||m.archivedAt)throw Error('创建者身份权限已变化或会议已归档，不能邀请')
        if(m.secretary?.sessionId===sessionId||sessionId.startsWith('round-table-secretary-'))throw Error('秘书不可作为普通成员邀请')
        if(m.memberSessionIds.includes(sessionId))return m
        return syncMeetingFolderInstructions({...m,memberSessionIds:[...m.memberSessionIds,sessionId],events:[...m.events,{id:`tool-join-${sessionId}-${Date.now()}`,kind:'join',time:Date.now(),sessionId}]})
      })
      const pending=joined.memberBriefings?.find(b=>b.sessionId===sessionId),role=pending?.role??joined.memberRoles?.[sessionId]??'参会成员'
      await ensureMemberBriefing(ctx,meetingId,sessionId,role)
      return meetingView((await authorizeMeetingToolRead(ctx,meetingId,exec?.agent)).meeting)
    },
  }))

  const taskAction = (name: 'meeting_task_claim' | 'meeting_task_complete' | 'meeting_task_fail', next: 'claimed' | 'completed' | 'failed') => ctx.tools.register(defineTool({
    name,
    description: '处理派给当前圆桌成员窗口的任务；调用者必须是该任务的接收窗口。',
    parameters: { meetingId: { type: 'string', required: true }, taskId: { type: 'string', required: true }, result: { type: 'string' }, error: { type: 'string' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { taskId: { type: 'string', required: true }, status: { type: 'string', required: true }, attemptId: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: `圆桌任务 ${value.taskId}：${value.status}` }] },
    async execute(args, exec) {
      const actor=await authenticateMeetingToolActor(ctx,exec?.agent)
      const meetingId = String(args['meetingId']); const taskId = String(args['taskId'])
      const currentMeeting=await readMeeting(stateRoot(),meetingId)
      if(currentMeeting&&findReleaseTask(currentMeeting,taskId)){
        if(!exec.agent)throw new Error('缺少接收成员身份')
        const task=next==='claimed'?await claimReleaseTask(meetingId,taskId,actor.sessionId):next==='completed'?await submitReleaseResult(meetingId,taskId,actor.sessionId,String(args.result??'')):await failReleaseTask(meetingId,taskId,actor.sessionId,String(args.error??''))
        return {taskId:task.taskId,status:task.status,attemptId:task.taskId}
      }
      const task = await getTask(stateRoot(), meetingId, taskId)
      const caller = exec.agent
      if (task === undefined) throw new Error('任务不存在')
      if (caller === undefined || String(caller.session.id) !== task.toSessionId) throw new Error('只有该任务的接收会议成员可以执行此操作')
      const meeting = await readMeeting(stateRoot(), meetingId)
      if (meeting === undefined || !meeting.memberSessionIds.includes(task.toSessionId)) throw new Error('接收窗口已不在会议成员列表')
      // claim 是用户可见的一次动作，但持久化上保留 claimed 审计后立即进入 in_progress；
      // 因而 complete 只接受真正开始执行的任务，杜绝 claimed→completed 的非法跳跃。
      const moved = next === 'claimed'
        ? await transitionTask(meetingId, (await transitionTask(meetingId, taskId, 'claimed')).taskId, 'in_progress')
        : await transitionTask(meetingId, taskId, next, { ...(next === 'completed' ? { result: String(args['result'] ?? '') } : {}), ...(next === 'failed' ? { error: String(args['error'] ?? '') } : {}) })
      return { taskId: moved.taskId, status: moved.status, attemptId: moved.attemptId }
    },
  }))
  taskAction('meeting_task_claim', 'claimed')
  taskAction('meeting_task_complete', 'completed')
  taskAction('meeting_task_fail', 'failed')
}
