import { withMeetingActivity } from './meeting-activity.ts'
import { requireActiveMeeting } from './meetings.ts'
/** 三段式：任务落盘 → 收件箱持久副本 → 尽力 followup；失败仍保留 delivered。 */
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { readMeeting, stateRoot } from './meetings.ts'
import { createTask, transitionTask, type MeetingTask } from './tasks.ts'
function text(title: string, task: MeetingTask): string { return `[圆桌会议「${title}」] 用户指派：${task.prompt}\n\n（圆桌任务 #${task.taskId}：请先 meeting_task_claim；完成后 meeting_task_complete；失败用 meeting_task_fail。）` }
async function dispatchMeetingTaskInternal(ctx: Context, meetingId: string, toSessionId: string, title: string, prompt: string): Promise<MeetingTask> { const root = stateRoot(); const meeting = await readMeeting(root, meetingId); if (meeting === undefined) throw new Error('会议不存在'); const task = await createTask(meetingId, toSessionId, title, prompt); const inbox = join(root, meetingId, 'inbox', `${toSessionId}.jsonl`); await mkdir(join(root, meetingId, 'inbox'), { recursive: true }); await appendFile(inbox, `${JSON.stringify({ taskId: task.taskId, title, prompt, ts: Date.now() })}\n`, 'utf8'); const delivered = await transitionTask(meetingId, task.taskId, 'delivered'); const agent = ctx.agents.get(SessionId(toSessionId)); if (agent !== undefined) agent.followup(createUserMessage({ content: [{ type: 'text', text: text(meeting.title, delivered) },], source: { kind: 'round-table', plugin: 'dsh-round-table' } })); return delivered }

export async function dispatchMeetingTask(...args: Parameters<typeof dispatchMeetingTaskInternal>): Promise<MeetingTask> { return withMeetingActivity(stateRoot(), args[1], async () => { await requireActiveMeeting(stateRoot(),args[1]); return dispatchMeetingTaskInternal(...args) }) }
