import {taskNeedsAction,reviewState} from '../task-review.ts'
import {taskRecoveryText} from './TaskRecovery.tsx'
/**
 * 圆桌会议面板（R3 聊天室核心 + R4 派遣 + R6 辩论 + P1 选择器 + P2 成员管理）：
 * 会议列表 / 新建会议 / 会议视图。
 *
 * 数据源：
 * - 会议数据：轮询 host 路由 GET /plugins/round-table/meetings（5s，no-store，in-flight 防重叠）；
 * - 会话枚举：框架注入的 useSessions / useWorkspaces 标准 props（排除 origin==='subagent' 与已归档）；
 * - 窗口实况：session.history 只读轮询（SessionFace 快照对未打开会话不装配历史，见 notes/20）；
 * - 广播：rtCtx.sessions.scope(id) → sessionOf() → face.prompt(content, 'queue') 逐窗口投递，
 *   失败标记"未送达"（绝不静默），结果 POST 回 host 簿记。
 * 纯展示组件：不持有权威状态（磁盘是真相源，见 src/meetings.ts）。
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { useEffect, useRef, useState } from 'react'
import { ReleasePanel, type MemberStatus } from './ReleasePanel.tsx'
import {ResourcesPanel} from './ResourcesPanel.tsx'
import {WorkflowPanel} from './WorkflowPanel.tsx'
import type {WorkflowState,WorkflowNodeView} from '../workflow-types.ts'
import {readLocal,writeLocal,meetingCall,localScopeId,useLocalPersistence,scopedLocal} from './ui-state.ts'
import {memberCreationBatch,runMemberCreation,memberCreationStageText,MemberCreationStopped,type MemberCreationBatch,type MeetingCreationJournal} from './member-creation.ts'
import type { MeetingMessage, ReleaseDraft } from '../meeting-flow-types.ts'
import type {TaskCardMeetingFields} from '../task-card-types.ts'
import type {MeetingFolder} from '../meeting-folder-types.ts'
import { MinutesPanel } from './MinutesPanel.tsx'
import { MeetingManagement } from './MeetingManagement.tsx'
import { MeetingList } from './MeetingList.tsx'
import {MemberSidebar} from './MemberSidebar.tsx'
import {meetingShellStyles} from './meeting-shell-style.ts'
import {MemberTaskActions} from './MemberTaskActions.tsx'
import {LegacyDrafts} from './LegacyDrafts.tsx'
import type { MinutesRecord, MinutesJob } from '../minutes-types.ts'
import { SessionPicker } from './SessionPicker.tsx'
import { PresetKnightPicker, type KnightSelection, type WorkspaceWire } from './PresetKnightPicker.tsx'

// ── 线协议类型（与 src/meetings.ts 结构对齐；host 代码不可进 client bundle，这里结构化重写） ──

interface DeliveryWire {
  sessionId: string
  status: 'delivered' | 'undelivered'
  error?: string
}

type MeetingEventWire =
  | { id:string; kind:'message';time:number;by:string;text:string;taskId?:string;replyTo?:string[] }
  | { id: string; kind: 'create'; time: number; title: string }
  | { id: string; kind: 'minutes'; time: number; minutesId: string; title: string }
  | { id: string; kind: 'rename'; time: number; oldTitle: string; title: string }
  | { id: string; kind: 'description_update'; time: number; oldDescription: string; description: string }
  | { id: string; kind: 'join'; time: number; sessionId: string; source?: 'existing' | 'preset' | 'secretary'; presetId?: string; workspaceId?: string }
  | { id: string; kind: 'leave'; time: number; sessionId: string }
  | { id: string; kind: 'broadcast'; time: number; by: 'user' | 'secretary'; text: string; deliveries: DeliveryWire[] }
  | {
    id: string
    kind: 'task'
    time: number
    taskId: string
    teamId: string
    teamName: string
    toSessionId: string
    toMember: string
    title: string
    status: string
    result?: string
    error?: string
  }

interface MeetingWire extends TaskCardMeetingFields {
  meetingFolder?:MeetingFolder
  meetingFolderError?:string
  discussions?:import('../discussion-types.ts').DiscussionRecord[]
  workflow?: WorkflowState
  workflowViews?: WorkflowNodeView[]
  meetingId: string
  title: string
  description?: string
  defaultWorkspaceId?: string
  secretary?: { sessionId: string; workspaceId: string; status: 'ready' | 'failed' | 'initializing'; error?: string }
  minutes?: MinutesRecord[]
  minutesJob?: MinutesJob
  secretaryTitleError?: string
  deletion?: {error?: string}
  memberSessionIds: string[]
  createdAt: number
  events: MeetingEventWire[]
  messages?: MeetingMessage[]
  releases?: ReleaseDraft[]
  releasePaused?: boolean
  archivedAt?: number
  pinnedAt?: number
  workflowStatus?: 'active'|'paused'|'completed'|'stopped'
  listReadOnly?: boolean
  lastActivity?: number
  minutesSource?: 'formal'|'session'
  memberNames?: Record<string,string>
  memberStatus?: Record<string,MemberStatus>
  counts?: {pending:number;attention:number;completed:number;awaitingReview?:number;faults?:number;running?:number}
  assets?: import('../meeting-flow-types.ts').MeetingAsset[]
  templates?: {id:string;title:string;instruction:string;recipientIds:string[]}[]
}

/** useSessions 标准 props 的最小结构面（选择器钩子；框架实参结构上是其超集）。 */
interface SessionRowLike {
  displayTitle: string
  agentPreset?: string
  cwd?: string
  running: boolean
  origin?: string
  blank: boolean
  retainedBy?: Readonly<Record<string,number>>
}
interface SessionListSlice {
  ids: readonly string[]
  byId: Record<string, SessionRowLike | undefined>
  current?: string
}
export type UseSessionsLike = <T>(selector: (state: SessionListSlice) => T) => T

/** useWorkspaces 标准 props 的最小结构面（只取归档集合）。 */
export type UseWorkspacesLike = <T>(selector: (state: { archivedSessionIds: readonly string[]; phase?: 'pending'|'ready'; baselinesReady?: boolean }) => T) => T

/** 投递面的最小结构（SessionFace.prompt 子集，避免把 runtime 类型链拉进面板）。 */
interface PromptFace {
  prompt(content: { type: 'text'; text: string }[], mode: 'queue'): Promise<{ ok: true } | { ok: false; error: { message?: string; code?: string } }>
}

// ── 样式常量（与抽屉壳同款 inline 风格） ────────────────────────────────────

const textPrimary: React.CSSProperties = { color: 'var(--dsw-alias-label-primary)' }
const textSecondary: React.CSSProperties = { color: 'var(--dsw-alias-label-secondary)' }
const textTertiary: React.CSSProperties = { color: 'var(--dsw-alias-label-tertiary)' }

const buttonBase: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-base)',
  fontFamily: 'inherit',
  fontSize: 12,
  lineHeight: '20px',
  padding: '3px 10px',
  cursor: 'pointer',
  ...textPrimary,
}

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  border: 'none',
  background: 'var(--dsw-alias-state-business-primary)',
  color: 'var(--dsw-alias-label-inverse, #fff)',
}

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-base)',
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: '20px',
  padding: '6px 8px',
  outline: 'none',
  ...textPrimary,
}

// ── 数据访问 ────────────────────────────────────────────────────────────────

const MEETINGS_URL = '/plugins/round-table/meetings'

/** GET 会议列表。 */
interface MeetingsResponse { meetings: MeetingWire[] }

const meetingCache=new Map<string,{etag:string;data:MeetingsResponse}>()
async function fetchMeetings(detail?:string,scope=localScopeId()): Promise<MeetingsResponse> {
  if(!scope||scope!==localScopeId())throw new MemberCreationStopped()
  const url=`${MEETINGS_URL}?view=summary${detail?`&detail=${encodeURIComponent(detail)}`:''}`,key=`${scope}:${url}`,cached=meetingCache.get(key)
  const response = await fetch(url, {headers:cached?{'if-none-match':cached.etag}:{}})
  if(scope!==localScopeId())throw new MemberCreationStopped()
  if(response.status===304&&cached)return cached.data
  if (!response.ok) throw new Error(`读取会议列表失败（HTTP ${response.status}）`)
  const data=await response.json() as MeetingsResponse;if(scope!==localScopeId())throw new MemberCreationStopped();meetingCache.set(key,{etag:response.headers.get('etag')??'',data});return data
}

async function postJsonForScope(url: string, body: unknown,scope=localScopeId()): Promise<void> {
  if(!scope||scope!==localScopeId())throw new MemberCreationStopped()
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json','x-round-table-scope':scope },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: string } | undefined
    throw new Error(payload?.error ?? `请求失败（HTTP ${response.status}）`)
  }
  if(scope!==localScopeId())throw new MemberCreationStopped()
}

/** 会议标签协议：接收窗口凭此知道自己在开会（红线：必须带标签）。 */
export function meetingTag(title: string, text: string): string {
  return `[圆桌会议「${title}」] from 用户：${text}`
}

/** 解析窗口的投递 face；窗口不在当前会话列表（离线/已移除）时返回 undefined。 */
function resolveFace(rtCtx: ClientContext, sessionId: string): PromptFace | undefined {
  const scoped = rtCtx.sessions.scope(sessionId as never)
  if (scoped === undefined) return undefined
  return rtCtx.sessions.sessionOf(scoped) as PromptFace | undefined
}

// ── 窗口发言实况（session.history 只读轮询） ────────────────────────────────
//
// 取舍：SessionFace 快照（useSession）只在会话于 UI 打开后才装历史窗口
// （open() 是 runtime 内部入口，不在对外 face 上），对未打开的参会窗口
// nodes/partial 恒为空——R3 实测证实。因此内容实况走 session.history 只读 RPC
// 轮询（5s，in-flight 防重叠），附带好处：重启/重开页面后历史发言同样可见。
// 运行态（发言中/空闲）取 useSessions 行的 running（host 信息流全覆盖，不依赖打开）。

/** session.history 事件包络的最小结构。 */
interface HistoryEnvelope {
  event?: { type?: string; data?: { message?: { content?: readonly { type?: string; text?: string }[] } } }
}

/** 从会话历史提取最新一条助手消息的正文（text blocks 拼接）。 */
function latestReplyFromHistory(events: readonly HistoryEnvelope[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]?.event
    if (event?.type !== 'assistant/message') continue
    const text = (event.data?.message?.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim()
    if (text !== '') return text
  }
  return undefined
}

async function fetchLatestReply(sessionId: string): Promise<string | undefined> {
  const response = await fetch('/api/session.history', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `rt-${Date.now()}`,
      method: 'session.history',
      payload: { sessionId },
    }),
  })
  if (!response.ok) return undefined
  const body = await response.json() as { result?: { ok: boolean; value?: { events?: HistoryEnvelope[] } } }
  if (body.result?.ok !== true) return undefined
  return latestReplyFromHistory(body.result.value?.events ?? [])
}

// ── 组件 ────────────────────────────────────────────────────────────────────

interface PanelProps {
  rtCtx: ClientContext
  useSessions: UseSessionsLike
  useWorkspaces: UseWorkspacesLike
  connection: RoundTableConnection
}

/** 仅取公开 wire client 的会话/预设调用面；不依赖私有 seat controller。 */
export interface RoundTableConnection {
  homePath?:()=>string|undefined
  api: {
    agentPresets: { list(input: {}): Promise<{ result: ({ ok: true; value: { presets: Array<{ id: string; trust?: 'system' | 'user'; name?: string; description?: string; broken?: string }> } } | { ok: false; error: { message: string } }) }> }
    sessions: {
      create(input: { sessionId?:string;workspaceId?: string; cwd?: string; agentPreset: string }): Promise<{ result: ({ ok: true; value: { sessionId: string; agentPreset?: string } } | { ok: false; error: { message: string } }) }>
      rename(input: { sessionId: string; title: string }): Promise<{ result: ({ ok: true; value: unknown } | { ok: false; error: { message: string } }) }>
    }
    workspace: { list(input: {}): Promise<{ result: ({ ok: true; value: { items: WorkspaceWire[] } } | { ok: false; error: { message: string } }) }> }
  }
}

interface WorkspaceSnapshot { items: readonly WorkspaceWire[]; baselinesReady: boolean; state: 'idle' | 'loading' | 'error'; phase: 'pending' | 'ready'; error: unknown | null }
export function resolveKnightWorkspaces(knights: readonly KnightSelection[], snapshot: WorkspaceSnapshot, currentSessionId?: string): { ok: true; workspaceIds: string[]; currentLabel?: string } | { ok: false; error: string } {
  const items = snapshot.items
  if (snapshot.baselinesReady !== true || snapshot.phase !== 'ready' || snapshot.state === 'loading' || snapshot.state === 'error') return { ok: false, error: '工作区名册尚未就绪；请稍后重试或重新选择工作区' }
  const current = items.find((workspace) => currentSessionId !== undefined && workspace.sessionIds?.includes(currentSessionId))
  const workspaceIds: string[] = []
  for (const knight of knights) { const id = knight.workspaceId ?? current?.workspaceId; if (id === undefined || !items.some((item) => item.workspaceId === id)) return { ok: false, error: knight.workspaceId === undefined ? '“跟随当前”未能解析到有效工作区；请为每位骑士选择工作区' : '所选工作区已失效；请重新选择工作区' }; workspaceIds.push(id) }
  return { ok: true, workspaceIds, currentLabel: current?.title }
}

type PanelView = { kind: 'list' } | { kind: 'create' } | { kind: 'meeting'; meetingId: string }

export function MeetingPanel({ rtCtx, useSessions, useWorkspaces, connection }: PanelProps): React.ReactNode {
  const mountScope=useRef(localScopeId()).current
  const {readLocal,writeLocal,meetingCall}=scopedLocal(mountScope)
  const [managementNotice,setManagementNotice]=useState<string|undefined>()
  const [recoveryOpen,setRecoveryOpen]=useState(0),[draftGeneration,setDraftGeneration]=useState(0)
  const [view, setView] = useState<PanelView>(()=>readLocal('last-view',{kind:'list'} as PanelView))
  const active=useRef<string>();active.current=view.kind==='meeting'?view.meetingId:undefined
  useEffect(()=>{writeLocal('last-view',view)},[view])
  const [meetings, setMeetings] = useState<MeetingWire[] | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const recovered=(entry?:import('./legacy-draft-model.ts').RecoveryEntry)=>{setDraftGeneration(v=>v+1);if(entry?.kind==='meeting')setView({kind:'create'});else if(entry?.meetingId){if(entry.kind==='workflow')writeLocal(`tab.${entry.meetingId}`,'workflow');setView({kind:'meeting',meetingId:entry.meetingId})}}

  // 轮询会议数据（面板挂载期间；打开面板才会挂载本组件）
  useEffect(() => {
    let alive = true
    let inFlight = false
    const tick = async (): Promise<void> => {
      if (inFlight) return
      inFlight = true
      try {
        const data = await fetchMeetings(active.current,mountScope)
        if (!alive) return
        setMeetings(data.meetings)
        setLoadError(undefined)
      } catch (error: unknown) {
        if (alive) setLoadError(String(error instanceof Error ? error.message : error))
      } finally {
        inFlight = false
      }
    }
    void tick()
    const timer = setInterval(() => { void tick() }, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  const refresh = async (): Promise<void> => {
    try {
      const data = await fetchMeetings(active.current,mountScope)
      setMeetings(data.meetings)
      setLoadError(undefined)
    } catch (error: unknown) {
      setLoadError(String(error instanceof Error ? error.message : error))
    }
  }

  useEffect(()=>{void refresh()},[view.kind,view.kind==='meeting'?view.meetingId:''])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
      {loadError !== undefined && (
        <p role="alert" style={{ margin: '4px 0 8px', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }}>
          {loadError}
        </p>
      )}
      <LegacyDrafts home={connection.homePath?.()??''} profile="当前会议库" requestOpen={recoveryOpen} meetings={meetings??[]} onImported={recovered}/>
      {managementNotice && <p role="status" style={{fontSize:12,overflowWrap:'anywhere'}}>{managementNotice}</p>}
      {view.kind === 'list' && (
        <MeetingList
          meetings={meetings}
          onChanged={refresh}
          onCreate={() => { setView({ kind: 'create' }) }}
          onOpen={(meetingId) => { setView({ kind: 'meeting', meetingId }) }}
        />
      )}
      {view.kind === 'create' && (
        <CreateMeeting
          useSessions={useSessions}
          useWorkspaces={useWorkspaces}
          connection={connection}
          onCancel={() => { setView({ kind: 'list' }) }}
          onCreated={async (meetingId) => {
            await refresh()
            setView({ kind: 'meeting', meetingId })
          }}
        />
      )}
      {view.kind === 'meeting' && (
        <MeetingView
          key={`${view.meetingId}:${draftGeneration}:${!!meetings?.find(m=>m.meetingId===view.meetingId)}`}
          onRecovery={()=>setRecoveryOpen(v=>v+1)}
          onJumpMeeting={meetingId=>setView({kind:'meeting',meetingId})}
          rtCtx={rtCtx}
          useSessions={useSessions}
          useWorkspaces={useWorkspaces}
          connection={connection}
          meeting={meetings?.find((m) => m.meetingId === view.meetingId)}
          onBack={() => { setView({ kind: 'list' }) }}
          onChanged={refresh}
          onDeleted={(message)=>{setManagementNotice(message);setView({kind:'list'});void refresh()}}
        />
      )}
    </div>
  )
}

/** 窗口行查询（displayTitle/running/在场判断；不在列表返回 undefined）。 */
function useSessionRows(useSessions: UseSessionsLike): (sessionId: string) => SessionRowLike | undefined {
  const byId = useSessions((s) => s.byId)
  return (sessionId) => byId[sessionId]
}

function memberCreationResults(batch:MemberCreationBatch):React.ReactNode {
  return <ul style={{paddingLeft:18,margin:'4px 0',overflowWrap:'anywhere'}}>{batch.members.map(step=><li key={step.instanceId} data-member-creation-id={step.instanceId}><b>{step.title}</b>：{memberCreationStageText(step)}{step.error&&<p role="alert" style={{margin:'3px 0'}}>{step.error}</p>}<small>窗口 {step.sessionId}{step.workspaceId?` · 工作区 ${step.workspaceId}`:''}</small></li>)}</ul>
}

function CreateMeeting({ useSessions, useWorkspaces, connection, onCancel, onCreated }: {
  useSessions: UseSessionsLike
  useWorkspaces: UseWorkspacesLike
  connection: RoundTableConnection
  onCancel: () => void
  onCreated: (meetingId: string) => Promise<void>
}): React.ReactNode {
  const mountScope=useRef(localScopeId()).current,mountHome=useRef(connection.homePath?.()).current
  const {readLocal,writeLocal,meetingCall}=scopedLocal(mountScope)
  const isCurrent=()=>mountScope===localScopeId()&&(!connection.homePath||mountHome===connection.homePath())
  const postJson=(url:string,body:unknown)=>{if(!isCurrent())return Promise.reject(new MemberCreationStopped());return postJsonForScope(url,body,mountScope)}
  const [initial]=useState(()=>readLocal('create-draft',{} as {title?:string;description?:string;workspace?:string;checked?:string[];knights?:KnightSelection[]}))
  const [title, setTitle] = useState(initial.title??'')
  const [description, setDescription] = useState(initial.description??'')
  const [secretaryWorkspaceChoice, setSecretaryWorkspaceChoice] = useState<string | undefined>(initial.workspace)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(initial.checked??[]))
  const [knights, setKnights] = useState<KnightSelection[]>(initial.knights??[])
  useEffect(()=>{writeLocal('create-draft',{title,description,workspace:secretaryWorkspaceChoice,checked:[...checked],knights})},[title,description,secretaryWorkspaceChoice,checked,knights])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [creation,setCreation]=useState<MeetingCreationJournal|undefined>(()=>readLocal('create-progress',undefined))
  const creationRef=useRef(creation),createGuard=useRef(false)
  const persistence=useLocalPersistence()
  const [progressSaved,setProgressSaved]=useState(true)
  const saveCreation=(value:MeetingCreationJournal|undefined)=>{if(!isCurrent())throw new MemberCreationStopped();creationRef.current=value;setCreation(value);if(!writeLocal('create-progress',value??null))setProgressSaved(false)}
  const locked=busy||!!creation
  // 0 已选的建会确认（第一击武装，第二击才真创建空会议；勾选变化即复位）
  const [emptyArmed, setEmptyArmed] = useState(false)
  const rows = useSessions((s) => s.ids
    .map((id) => ({ id, row: s.byId[id] }))
    .filter((item): item is { id: string; row: SessionRowLike } => item.row !== undefined))
  const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds)
  const workspaceSnapshot = useWorkspaces((s) => s as unknown as WorkspaceSnapshot)
  const workspaces = workspaceSnapshot.items
  const currentSessionId = useSessions((s) => (s as unknown as { current?: string }).current)
  const followCurrentLabel = workspaces.find((workspace) => currentSessionId !== undefined && workspace.sessionIds?.includes(currentSessionId))?.title
  const inferredSecretaryWorkspaceId = workspaces.find((workspace) => currentSessionId !== undefined && workspace.sessionIds?.includes(currentSessionId))?.workspaceId
  const secretaryWorkspaceId = secretaryWorkspaceChoice ?? inferredSecretaryWorkspaceId

  const toggle = (id: string): void => {
    if(locked)return
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setEmptyArmed(false) // 勾选变化即解除 0 人确认态
  }

  const submit = async (): Promise<void> => {
    if (createGuard.current||(creationRef.current?.uncertain&&!creationRef.current.requestSafe)) return
    if(!isCurrent()){setError(new MemberCreationStopped().message);return}
    let journal=creationRef.current
    if(!journal){
      if (title.trim() === '') { setError('请填写会议标题'); return }
      if (description.trim() === '') { setError('请填写会议说明'); return }
      if (secretaryWorkspaceId === undefined) { setError('请选择有效当前工作区作为会议默认工作区'); return }
      if (new Set(knights.map((knight) => knight.title.trim())).size !== knights.length || knights.some((knight) => knight.title.trim() === '')) { setError('同一会议的骑士名称必须非空且不重复'); return }
      const resolved = knights.length === 0 ? undefined : resolveKnightWorkspaces(knights, workspaceSnapshot, currentSessionId)
      if (resolved !== undefined && !resolved.ok) { setError(resolved.error); return }
      if(!workspaces.some(w=>w.workspaceId===secretaryWorkspaceId)){setError('会议默认工作区已失效，请重新选择');return}
      if (checked.size === 0 && knights.length === 0 && !emptyArmed) { setEmptyArmed(true); return }
      journal={...memberCreationBatch([...checked].map(sessionId=>({sessionId,title:rows.find(x=>x.id===sessionId)?.row.displayTitle??sessionId})),knights,resolved?.ok?resolved.workspaceIds:[]),title:title.trim(),description:description.trim(),workspaceId:secretaryWorkspaceId,requestSafe:true}
      saveCreation(journal)
    }
    createGuard.current=true
    setBusy(true)
    setError(undefined)
    try {
      if(!journal.meetingId){
        try{
          const scope=mountScope;if(!scope||!isCurrent())throw new MemberCreationStopped()
          const response = await fetch(MEETINGS_URL, {method:'POST',headers:{'content-type':'application/json','x-round-table-scope':scope},body:JSON.stringify({title:journal.title,description:journal.description,secretaryWorkspaceId:journal.workspaceId,memberSessionIds:[],...(journal.requestSafe?{requestId:journal.id}:{})})})
          const payload=await response.json() as {meeting?:MeetingWire;error?:string;requestState?:string}
          if(!isCurrent())throw new MemberCreationStopped()
          if(!response.ok){if(payload.requestState==='rejected')saveCreation(undefined);throw Error(payload.error??`创建失败（HTTP ${response.status}）`)}
          if(!payload.meeting)throw Error('创建响应缺少会议身份')
          journal={...journal,meetingId:payload.meeting.meetingId,uncertain:false};saveCreation(journal)
        }catch(error){if(isCurrent()&&creationRef.current&&!creationRef.current.meetingId)saveCreation({...journal,uncertain:true});throw error}
      }
      const meetingId=journal.meetingId!
      journal=await runMemberCreation(journal,connection,step=>postJson(`${MEETINGS_URL}/${encodeURIComponent(meetingId)}/join`,{sessionId:step.sessionId,origin:step.presetId?{source:'preset',presetId:step.presetId,workspaceId:step.workspaceId}:{source:'existing'},...(step.role?{role:step.role}:{})}),saveCreation,isCurrent)
      if(journal.members.some(x=>x.stage!=='done')){setError('会议已创建；部分成员未完成，请查看逐项结果并重试。');return}
      writeLocal('create-draft',{})
      await onCreated(meetingId)
      saveCreation(undefined)
    } catch (cause: unknown) {
      setError(String(cause instanceof Error ? cause.message : cause))
    }finally{
      createGuard.current=false
      setBusy(false)
    }
  }

  return (
    <div data-round-table-create-form="" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', gap: 8 }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" style={buttonBase} onClick={onCancel}>← 返回</button>
        <span style={{ fontSize: 13, fontWeight: 500, ...textPrimary }}>新建会议</span>
      </div>
      <div data-round-table-create-scroll="" style={{flex:1,minHeight:0,minWidth:0,overflowY:'auto',overflowX:'hidden',display:'flex',flexDirection:'column',gap:10,paddingRight:4}}>
      <input
        data-round-table-title=""
        style={{ ...inputStyle, flex: 'none' }}
        aria-label="会议标题" placeholder="会议名称，例如：秋季活动方案评审"
        value={title}
        disabled={locked}
        onChange={(event) => { setTitle(event.target.value) }}
      />
      <textarea disabled={locked} data-round-table-description="" style={{ ...inputStyle, flex: 'none', resize: 'vertical' }} aria-label="会议说明（必填）" placeholder="这场会议要解决什么问题？写清目标、背景与期待产出（必填）" value={description} onChange={(event) => setDescription(event.target.value)} />
      <label style={{ flex:'none',display:'flex',flexDirection:'column',gap:4,minWidth:0,fontSize: 12, ...textSecondary }}>会议默认工作区：<select disabled={locked} style={{width:'100%',minWidth:0,boxSizing:'border-box'}} data-round-table-secretary-workspace="" value={secretaryWorkspaceId ?? ''} onChange={(event) => setSecretaryWorkspaceChoice(event.target.value === '' ? undefined : event.target.value)}><option value="">请选择工作区</option>{workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>)}</select></label>
      <p style={{fontSize:12,margin:0}}>默认工作区用于新实例与专属秘书；已有成员保留各自项目权限。</p>
      <span style={{ flex: 'none', fontSize: 12, ...textSecondary }}>邀请谁参与：选择已有窗口（{checked.size} 已选）</span>
      {!creation&&<><SessionPicker rows={rows} archivedSessionIds={archivedSessionIds} checked={checked} onToggle={toggle} />
      <details><summary>按预设新建骑士、设置职责与独立工作区（{knights.length} 已选）</summary><PresetKnightPicker api={connection.api} workspaces={workspaces} followCurrentLabel={followCurrentLabel} selected={knights} onChange={(next) => {if(locked)return;setKnights(next);setEmptyArmed(false)}} /></details></>}
      {creation&&<section aria-label="会议创建进度"><b>{creation.meetingId?`会议已创建 · ${creation.title}`:'正在创建会议'}</b>{memberCreationResults(creation)}{creation.uncertain&&<p role="alert">{creation.requestSafe?'创建结果待核实，可重试原创建请求；沿用相同请求身份，不会另建会议。':`旧创建记录没有请求身份，请返回列表确认是否已有「${creation.title}」。为避免重复创建，本次不会再次建会；创建记录已保留。`}</p>}{creation.meetingId&&<button style={buttonBase} disabled={busy} onClick={()=>{void onCreated(creation.meetingId!).catch(e=>setError(String(e)))}}>进入已创建会议</button>}</section>}
      {(!persistence.available||!progressSaved)&&<p role="alert">创建进度仅在本窗口内保留，关闭或刷新前请记下会议与窗口身份。</p>}
      {error !== undefined && (
        <p role="alert" style={{ flex: 'none', margin: 0, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }}>{error}</p>
      )}
      </div>
      <div data-round-table-create-footer="" style={{ flex: 'none',paddingTop:8,borderTop:'1px solid var(--dsw-alias-border-l2)' }}>
        <p style={{fontSize:12,margin:'0 0 8px'}}>创建后会给所选成员发送入会简报，成员可能回应；后续任务仍需你明确放行。秘书独立创建，不参与普通讨论。</p>
        {emptyArmed && checked.size === 0 && knights.length === 0 && (
          <p data-round-table-empty-warn="" style={{ margin: '0 0 4px', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-state-error-primary)' }}>
            未选择任何窗口——再点一次「确认创建空会议」将创建 0 成员会议。
          </p>
        )}
        <button type="button" data-round-table-create-submit="" style={primaryButton} disabled={busy||!!creation?.uncertain&&!creation.requestSafe} onClick={() => { void submit() }}>
          {busy ? '处理中…' : creation?.uncertain&&creation.requestSafe?'重试原创建请求':creation?'重试未完成步骤':emptyArmed && checked.size === 0 && knights.length === 0 ? '确认创建空会议' : '创建会议'}
        </button>
      </div>
    </div>
  )
}

/** Resolve only a member's own workspace; the meeting default does not imply membership. */
function memberWorkspaceInfo(sessionId:string,cwd:string|undefined,workspaces:readonly WorkspaceWire[]=[]):{label:string;path?:string} {
  const normalize=(path:string):string=>{
    const normalized=path.replace(/\\/g,'/').replace(/\/+$/,'')
    return /^[a-z]:[\\/]|^\\\\|^\/\//i.test(path)?normalized.toLowerCase():normalized
  }
  const actual=cwd?.trim()?cwd:undefined
  const workspace=workspaces.find(w=>w.sessionIds?.includes(sessionId)&&(!actual||normalize(w.path)===normalize(actual)))
  const path=actual??workspace?.path
  if(!path)return {label:'宿主未提供'}
  const title=workspace?.title.trim()
  const parts=path.split(/[\\/]+/).filter(Boolean)
  const short=/^(?:[a-z]:[\\/]*|\/+)$/i.test(path)?path:parts.slice(-2).join('/')||path
  return {label:title&&normalize(title)!==normalize(path)&&!(/^[a-z]:[\\/]|^[\\/]/i.test(title))?title:short,path}
}

/** 原会话状态与主要操作常显；完整路径、权限说明和最近回复收在详情中。 */
function MemberLive({ nameOf, sessionId, running, present, meetingId, onChanged, onRemove, onOpen,cwd,workspaces=[],releases=[],discussions=[],workflow,availability }: {
  nameOf: (sessionId: string) => string
  sessionId: string
  running: boolean
  present: boolean
  meetingId: string
  onChanged: () => Promise<void>
  onRemove: (sessionId: string) => Promise<void>
  onOpen: (sessionId: string) => void
  cwd?: string
  workspaces?: readonly WorkspaceWire[]
  releases?:ReleaseDraft[]
  discussions?:import('../discussion-types.ts').DiscussionRecord[]
  workflow?:import('../workflow-types.ts').WorkflowState
  availability?:{state:string;reason?:string}
}): React.ReactNode {
  const label = nameOf(sessionId)
  const workspace=memberWorkspaceInfo(sessionId,cwd,workspaces)
  const [reply, setReply] = useState<string | undefined>(undefined)
  const [privatePreview,setPrivatePreview]=useState(false),[recoveryError,setRecoveryError]=useState(''),[recovering,setRecovering]=useState(false)
  const {meetingCall}=scopedLocal(useRef(localScopeId()).current)
  const affectedTasks=releases.flatMap(r=>r.tasks.filter(t=>t.toSessionId===sessionId&&!['completed','failed','cancelled'].includes(t.status)).map(t=>r.title??r.instruction.slice(0,60)))
  const affectedDiscussion=discussions.filter(d=>d.deliveries.some(v=>v.toSessionId===sessionId&&v.status!=='cancelled')).map(d=>`普通讨论：${d.instruction.slice(0,60)}`)
  const affectedNodes=[...(workflow?.draft?.nodes??[]),...(workflow?.runs.filter(r=>r.status==='active').flatMap(r=>r.definition.nodes)??[])].filter(n=>n.memberIds.includes(sessionId)).map(n=>`仍依赖此成员的环节：${n.title}`)
  const affected=[...affectedTasks,...affectedDiscussion]
  // 移除：二次确认（第一击武装，第二击执行；切换他键即复位）
  const [removeArmed, setRemoveArmed] = useState(false)


  // 内容实况：session.history 只读轮询（5s，in-flight 防重叠；重启后历史同样可读）
  useEffect(() => {
    if (!present||!privatePreview) return undefined
    let alive = true
    let inFlight = false
    const tick = async (): Promise<void> => {
      if (inFlight) return
      inFlight = true
      try {
        const latest = (await meetingCall(meetingId,'member-reply',{sessionId})).text as string|undefined
        if (alive && latest !== undefined) setReply(latest)
      } catch { /* 下一tick重试 */ } finally {
        inFlight = false
      }
    }
    void tick()
    const timer = setInterval(() => { void tick() }, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [sessionId, present,privatePreview])

  return (
    <section data-round-table-member={sessionId} style={{
      border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
        <span
          title={!present ? '原窗口未连接' : running ? '原窗口忙碌' : '可投递'}
          style={{
            flex: 'none', width: 8, height: 8, borderRadius: '50%',
            background: !present
              ? 'var(--dsw-alias-state-error-primary)'
              : running ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-caption)',
          }}
        />
        <span title={label} style={{ fontSize: 12, fontWeight: 500, flex: '1 1 90px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...textPrimary }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap', ...textTertiary }}>
          {availability?.state==='archived'?'原会话已归档':availability?.state==='deleted'?'原会话已删除':availability?.state==='unknown'?'原会话状态待确认':!present?'确认执行后自动恢复':running?'原窗口忙碌':'已就绪'}
        </span>
        <button type="button" data-round-table-open-session={sessionId} style={{ ...buttonBase, flex: 'none', whiteSpace: 'nowrap', padding: '0 6px', fontSize: 11, lineHeight: '16px' }} onClick={() => onOpen(sessionId)}>打开会话</button>
        <button
          type="button"
          data-round-table-remove-member={sessionId}
          data-armed={removeArmed || undefined}
          style={{
            ...buttonBase, flex: 'none', whiteSpace: 'nowrap', padding: '0 6px', fontSize: 11, lineHeight: '16px',
            ...(removeArmed ? { borderColor: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-state-error-primary)' } : {}),
          }}
          onClick={() => {
            if (!removeArmed) { setRemoveArmed(true); return }
            setRemoveArmed(false)
            void onRemove(sessionId)
          }}
        >
          {removeArmed ? '确认移除？' : '移除'}
        </button>
      </header>
      {availability?.reason&&<p role={['archived','deleted','unknown','restore_failed'].includes(availability.state)?'alert':'status'}>{availability.reason}</p>}
      {!present&&!['archived','deleted'].includes(availability?.state??'')&&<button style={buttonBase} disabled={recovering} onClick={()=>{setRecovering(true);void meetingCall(meetingId,'member-retry',{sessionId,confirmed:true}).then(()=>onChanged()).catch(e=>setRecoveryError(String(e instanceof Error?e.message:e))).finally(()=>setRecovering(false))}}>{recovering?'恢复原会话中…':'在会议内重试恢复'}</button>}
      {recoveryError&&<p role="alert">{recoveryError}</p>}
      {removeArmed&&<div role="alertdialog" aria-label="确认移出会议"><p>将「{label}」移出本会，结束 {affected.length} 项未完成等待；原会话、历史发言和已提交结果保留。仍依赖此成员的环节需要重新安排，不会视作完成。</p>{affectedNodes.length>0&&<ul>{[...new Set(affectedNodes)].map(title=><li key={title}>{title}</li>)}</ul>}{affected.length>0&&<ul>{affected.map((title,i)=><li key={i}>{title}</li>)}</ul>}<button style={buttonBase} onClick={()=>setRemoveArmed(false)}>取消移除</button></div>}
      <div style={{display:'flex',alignItems:'baseline',gap:4,minWidth:0,fontSize:12,...textSecondary}}>
        <span style={{flex:'none'}}>原工作区：</span>
        <span data-round-table-workspace-label={sessionId} title={workspace.path} tabIndex={0} aria-label={`原工作区：${workspace.label}${workspace.path?`，完整路径：${workspace.path}`:''}`} style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{workspace.label}</span>
      </div>
      <details data-round-table-member-details={sessionId} onToggle={e=>setPrivatePreview(e.currentTarget.open)} style={{minWidth:0,fontSize:12}}>
        <summary style={{cursor:'pointer',width:'fit-content',...textSecondary}}>会话详情</summary>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6,minWidth:0}}>
          {workspace.path&&<div><small style={textTertiary}>完整工作区路径</small><p data-round-table-workspace-full={sessionId} style={{margin:0,overflowWrap:'anywhere',whiteSpace:'pre-wrap',userSelect:'text'}}>{workspace.path}</p></div>}
          <p style={{margin:0,...textTertiary}}>文件权限沿用原会话设置。</p>
          <small>原会话最近回复预览（可能包含其他工作，不自动发布）</small>
          <p style={{
            margin: 0, fontSize: 12, lineHeight: '18px', ...textSecondary,
            display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 4, overflow: 'hidden',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {!present ? '窗口不在当前会话列表（离线或已移除）' : (reply ?? '（暂无发言）')}
          </p>
        </div>
      </details>
    </section>
  )
}

/** 任务状态条的中文标签（与 flat-teams TaskStatus 对齐）。 */
const TASK_STATUS_LABEL: Readonly<Record<string, string>> = {
  pending: '待投递',
  delivered: '已派发',
  claimed: '已认领',
  in_progress: '进行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  timeout: '超时',
}

function taskStatusColor(status: string): string {
  if (status === 'completed') return 'var(--dsw-alias-state-business-primary)'
  if (status === 'failed' || status === 'cancelled' || status === 'timeout') return 'var(--dsw-alias-state-error-primary)'
  return 'var(--dsw-alias-label-tertiary)'
}

/** @提及的草稿尾 token（只在光标位于文末时识别；R4 简化，报告中说明）。 */
function mentionTokenAtEnd(text: string, caret: number): { start: number; query: string } | undefined {
  if (caret !== text.length) return undefined
  const match = /(^|\s)@([^\s@]*)$/.exec(text)
  if (match === null) return undefined
  return { start: match.index + (match[1] ?? '').length, query: match[2] ?? '' }
}

function MeetingView({ rtCtx, useSessions, useWorkspaces, connection, meeting, onBack, onChanged, onDeleted,onJumpMeeting,onRecovery }: {
  rtCtx: ClientContext
  useSessions: UseSessionsLike
  useWorkspaces: UseWorkspacesLike
  connection: RoundTableConnection
  meeting: MeetingWire | undefined
  onBack: () => void
  onChanged: () => Promise<void>
  onDeleted?: (message:string)=>void
  onRecovery?:()=>void
  onJumpMeeting?: (id:string)=>void
}): React.ReactNode {
  const mountScope=useRef(localScopeId()).current,mountHome=useRef(connection.homePath?.()).current
  const {readLocal,writeLocal,meetingCall}=scopedLocal(mountScope)
  const isCurrent=()=>mountScope===localScopeId()&&(!connection.homePath||mountHome===connection.homePath())
  const postJson=(url:string,body:unknown)=>{if(!isCurrent())return Promise.reject(new MemberCreationStopped());return postJsonForScope(url,body,mountScope)}
  const [draft, setDraft] = useState(()=>readLocal(`message-draft.${meeting?.meetingId}`,'') as string)
  const [focusTask,setFocusTask]=useState<{id:string;nonce:number}>()
  const [tab,setTab]=useState(()=>{const saved=readLocal(`tab.${meeting?.meetingId}`,'discussion') as string;return ['members','tasks'].includes(saved)?'discussion':saved})
  const [sidebarOpen,setSidebarOpen]=useState(false),[selectedMember,setSelectedMember]=useState<string|null>(null),[taskModal,setTaskModal]=useState(false),[overview,setOverview]=useState(false)
  const [immediateConfirm,setImmediateConfirm]=useState(false)
  useEffect(()=>{if(meeting){writeLocal(`message-draft.${meeting.meetingId}`,draft);writeLocal(`tab.${meeting.meetingId}`,tab)}},[draft,tab,meeting?.meetingId])
  const messageRequest=useRef<{text:string;id:string}|undefined>()
  const saveBusy=useRef(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | undefined>(undefined)
  // @派遣：target = 已选中的派遣对象；mentionQuery 非 null = 候选列表开着
  const [target, setTarget] = useState<{ sessionId: string; label: string } | undefined>(undefined)
  const [mention, setMention] = useState<{ start: number; query: string } | undefined>(undefined)
  // 添加成员：展开态 + 选择器勾选 + 忙态
  const [addOpen, setAddOpen] = useState(()=>!!readLocal(`member-create.${meeting?.meetingId}`,undefined))
  const [addChecked, setAddChecked] = useState<ReadonlySet<string>>(new Set())
  const [addTab, setAddTab] = useState<'existing' | 'preset'>('existing')
  const [addKnights, setAddKnights] = useState<KnightSelection[]>([])
  const [addBusy, setAddBusy] = useState(false)
  const [addBatch,setAddBatch]=useState<MemberCreationBatch|undefined>(()=>readLocal(`member-create.${meeting?.meetingId}`,undefined))
  const addBatchRef=useRef(addBatch),addGuard=useRef(false)
  const persistence=useLocalPersistence(),[memberProgressSaved,setMemberProgressSaved]=useState(true)
  const saveAddBatch=(value:MemberCreationBatch|undefined)=>{if(!isCurrent())throw new MemberCreationStopped();addBatchRef.current=value;setAddBatch(value);if(!writeLocal(`member-create.${meeting?.meetingId}`,value??null))setMemberProgressSaved(false)}
  const [secretaryBusy, setSecretaryBusy] = useState(false)
  const [secretaryWorkspaceChoice, setSecretaryWorkspaceChoice] = useState('')
  const rowOf = useSessionRows(useSessions)
  const allRows = useSessions((s) => s.ids
    .map((id) => ({ id, row: s.byId[id] }))
    .filter((item): item is { id: string; row: SessionRowLike } => item.row !== undefined))
  const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds)
  const workspaceSnapshot = useWorkspaces((s) => s as unknown as WorkspaceSnapshot)
  const workspaces = workspaceSnapshot.items
  const currentSessionId = useSessions((s) => (s as unknown as { current?: string }).current)
  const followCurrentLabel = workspaces.find((workspace) => currentSessionId !== undefined && workspace.sessionIds?.includes(currentSessionId))?.title
  const retrySecretary = async (): Promise<void> => { if (meeting === undefined) return; const id = meeting.secretary?.workspaceId ?? (secretaryWorkspaceChoice || meeting.defaultWorkspaceId || ''); if (id === '' || secretaryBusy) { setSendError('请选择有效秘书工作区'); return }; setSecretaryBusy(true); try { await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/retry-secretary`, { secretaryWorkspaceId: id }); await onChanged() } catch (error) { setSendError(String(error)) } finally { setSecretaryBusy(false) } }
  const nameOf = (sessionId: string): string => rowOf(sessionId)?.displayTitle ?? meeting?.memberNames?.[sessionId] ?? `${sessionId.slice(0, 18)}…`
  const nameStamp=meeting?.memberSessionIds.map(id=>`${id}:${rowOf(id)?.displayTitle??''}`).join('|')
  useEffect(()=>{if(!meeting||meeting.archivedAt)return;const names=Object.fromEntries(meeting.memberSessionIds.filter(id=>rowOf(id)?.displayTitle&&meeting.memberNames?.[id]!==rowOf(id)?.displayTitle).map(id=>[id,rowOf(id)!.displayTitle]));if(Object.keys(names).length)void meetingCall(meeting.meetingId,'member-names',{names}).then(onChanged).catch(()=>{})},[nameStamp])
  const memberLabel = (sessionId: string): string => { const row = rowOf(sessionId); return row?.agentPreset === undefined ? nameOf(sessionId) : `${nameOf(sessionId)} · ${row.agentPreset}` }

  if (meeting === undefined) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" style={{ ...buttonBase, alignSelf: 'flex-start' }} onClick={onBack}>← 返回</button>
        <p style={{ margin: 0, fontSize: 12, ...textTertiary }}>会议不存在或已删除，请返回列表。</p>
      </div>
    )
  }

  /** 添加成员选择器的行：全局会话减去已在会成员（归档/subagent 由 SessionPicker 分层排除）。 */
  const nonMemberRows = allRows.filter(({ id }) => !meeting.memberSessionIds.includes(id))

  /** 移除成员（MemberLive 二次确认后调用）；@候选与广播名单随轮询自动同步。 */
  const removeMember = async (sessionId: string): Promise<void> => {
    setSendError(undefined)
    try {
      await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/leave`, { sessionId })
      await onChanged()
    } catch (cause: unknown) {
      setSendError(String(cause instanceof Error ? cause.message : cause))
    }
  }

  /** 添加成员：逐个走现有 join 端点（幂等）。 */
  const addMembers = async (): Promise<void> => {
    if (addGuard.current || (!addBatchRef.current&&(addTab === 'existing' ? addChecked.size === 0 : addKnights.length === 0))) return
    addGuard.current=true
    setAddBusy(true)
    setSendError(undefined)
    try {
      if(!isCurrent())throw new MemberCreationStopped()
      let batch=addBatchRef.current
      if(!batch){
        if (addTab === 'preset' && (new Set(addKnights.map((knight) => knight.title.trim())).size !== addKnights.length || addKnights.some((knight) => knight.title.trim() === ''))) throw new Error('同一会议的骑士名称必须非空且不重复')
        const resolved = resolveKnightWorkspaces(addTab==='preset'?addKnights:[], workspaceSnapshot, currentSessionId)
        if(addTab==='preset'&&!resolved.ok)throw Error(resolved.error)
        batch=memberCreationBatch(addTab==='existing'?[...addChecked].map(sessionId=>({sessionId,title:nameOf(sessionId)})):[],addTab==='preset'?addKnights:[],resolved.ok?resolved.workspaceIds:[])
        saveAddBatch(batch)
      }
      batch=await runMemberCreation(batch,connection,step=>postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/join`,{sessionId:step.sessionId,origin:step.presetId?{source:'preset',presetId:step.presetId,workspaceId:step.workspaceId}:{source:'existing'},...(step.role?{role:step.role}:{})}),saveAddBatch,isCurrent)
      if(batch.members.some(x=>x.stage!=='done'))setSendError('部分成员未完成；已加入的成员不会重复创建或再次简报。请查看逐项结果。')
      else{setAddChecked(new Set());setAddKnights([])}
      await onChanged()
    } catch (cause: unknown) {
      setSendError(String(cause instanceof Error ? cause.message : cause))
    } finally {
      addGuard.current=false
      setAddBusy(false)
    }
  }

  /** 广播核心（输入框与"结论发到会议"共用同一条投递通道——红线：不新造投递路径）。 */
  const broadcastText = async (text: string): Promise<boolean> => {
    if (text === '' || sending) return false
    setSending(true)
    setSendError(undefined)
    const tagged = meetingTag(meeting.title, text)
    const deliveries: DeliveryWire[] = []
    for (const sessionId of meeting.memberSessionIds) {
      const face = resolveFace(rtCtx, sessionId)
      if (face === undefined) {
        deliveries.push({ sessionId, status: 'undelivered', error: '窗口不在当前会话列表（离线或已移除）' })
        continue
      }
      try {
        const result = await face.prompt([{ type: 'text', text: tagged }], 'queue')
        if (result.ok) {
          deliveries.push({ sessionId, status: 'delivered' })
        } else {
          deliveries.push({ sessionId, status: 'undelivered', error: result.error.message ?? String(result.error.code ?? '拒绝接收') })
        }
      } catch (cause: unknown) {
        deliveries.push({ sessionId, status: 'undelivered', error: String(cause instanceof Error ? cause.message : cause) })
      }
    }
    try {
      await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/broadcast`, { text, deliveries })
      await onChanged()
      return true
    } catch (cause: unknown) {
      setSendError(String(cause instanceof Error ? cause.message : cause))
      return false
    } finally {
      setSending(false)
    }
  }

  const broadcast = async (): Promise<void> => {
    const text = draft.trim()
    if (await broadcastText(text)) setDraft('')
  }

  /** 辩论结论发到会议（复用广播通道）。 */
  const publishConclusion = async (text: string): Promise<void> => {
    await broadcastText(text)
  }

  /** 辩论结论派给成员（复用 R4 dispatch 端点）。 */
  const dispatchConclusion = async (toSessionId: string, title: string, text: string): Promise<void> => {
    setSendError(undefined)
    try {
      await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/dispatch`, { toSessionId, title, text })
      await onChanged()
    } catch (cause: unknown) {
      setSendError(String(cause instanceof Error ? cause.message : cause))
    }
  }

  /** @派遣：host 端点内嵌圆桌任务投递。 */
  const dispatch = async (): Promise<void> => {
    const text = draft.trim()
    if (text === '' || sending || target === undefined) return
    setSending(true)
    setSendError(undefined)
    try {
      await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/dispatch`, {
        toSessionId: target.sessionId,
        title: text.length > 24 ? `${text.slice(0, 24)}…` : text,
        text,
      })
      setDraft('')
      setTarget(undefined)
      await onChanged()
    } catch (cause: unknown) {
      // 显示会议端点返回的具体失败原因，便于核对成员与输入。
      setSendError(String(cause instanceof Error ? cause.message : cause))
    } finally {
      setSending(false)
    }
  }

  const send = (): void => {
    void saveMessage()
  }
  const saveMessage=async():Promise<void>=>{
    const text=draft.trim();if(!text||saveBusy.current)return
    saveBusy.current=true;setSending(true);setSendError(undefined)
    if(messageRequest.current?.text!==text)messageRequest.current={text,id:crypto.randomUUID()}
    try{await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/message`,{text,requestId:messageRequest.current.id});setDraft('');messageRequest.current=undefined;await onChanged()}
    catch(error){setSendError(error instanceof Error?error.message:String(error))}finally{saveBusy.current=false;setSending(false)}
  }

  // @候选：只能是本会参会窗口（红线）
  const candidates = mention === undefined ? [] : meeting.memberSessionIds
    .map((sessionId) => ({ sessionId, label: nameOf(sessionId) }))
    .filter((item) => mention.query === '' || item.label.includes(mention.query))

  const pickMention = (sessionId: string, label: string): void => {
    if (mention === undefined) return
    // 摘掉草稿尾的 @query token，派遣对象改由 chip 承载
    setDraft((value) => `${value.slice(0, mention.start)}${value.slice(mention.start + 1 + mention.query.length)}`)
    setTarget({ sessionId, label })
    setMention(undefined)
  }

  const history = meeting.events.filter((event) => event.kind !== 'create'&&(tab!=='tasks'||event.kind==='task'))
  const taskAttention=meeting.releases?.flatMap(r=>r.tasks).filter(t=>taskNeedsAction(meeting,t))??[]
  const faults=meeting.counts?.faults??taskAttention.filter(t=>['offline','uncertain','failed'].includes(t.status)).length
  const awaitingReview=meeting.counts?.awaitingReview??taskAttention.filter(t=>t.status==='completed'&&t.review!=='accepted').length
  const running=(meeting.counts?.running??taskAttention.filter(t=>['delivering','delivered','in_progress'].includes(t.status)).length)+taskAttention.filter(t=>t.status==='queued').length
  const workflowRun=meeting.workflow?.runs.find(r=>r.status==='active')??meeting.workflow?.runs.at(-1)
  const latestMinutes=meeting.minutes?.at(-1)
  const nextAction=meeting.archivedAt?{page:'settings',label:'查看归档与恢复设置'}:faults?{page:'tasks',label:`核实 ${faults} 项投递或执行异常`}:awaitingReview?{page:'tasks',label:`验收 ${awaitingReview} 项已提交结果`}:meeting.memberSessionIds.length===0?{page:'members',label:'添加参会成员，开始这场会议'}:meeting.secretary?.status!=='ready'?{page:'settings',label:meeting.secretary?'重试秘书初始化':'配置秘书，准备整理纪要'}:workflowRun?.status==='active'&&workflowRun.paused?{page:'workflow',label:'查看暂停原因与继续条件'}:latestMinutes?.integrity&&!latestMinutes.integrity.reviewedAt?{page:'minutes',label:'核对最新纪要，再决定是否分享'}:workflowRun?.status==='completed'&&!latestMinutes?{page:'minutes',label:'流程已完成，整理会议纪要'}:running?{page:'tasks',label:`查看 ${running} 项等待／执行中的任务`}:workflowRun?.status==='completed'?{page:'workflow',label:'本次运行已结束，查看记录或准备下一轮'}:{page:'discussion',label:'记录会议内容，或 @ 成员提出问题'}
  const management=<MeetingManagement meeting={meeting} onChanged={onChanged} onDeleted={onDeleted??(()=>onBack())}/>
  const addPanel=(addOpen && (
        <section data-round-table-add-panel="" style={{
          flex: 'none', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10,
          padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto',
        }}>
          {!addBatch&&<div style={{ display: 'flex', gap: 5 }}><button type="button" disabled={addBusy} style={buttonBase} aria-pressed={addTab === 'existing'} onClick={() => setAddTab('existing')}>选择已有窗口</button><button type="button" disabled={addBusy} style={buttonBase} aria-pressed={addTab === 'preset'} onClick={() => setAddTab('preset')}>按预设新建</button></div>}
          {!addBatch&&addTab === 'existing' && <><span style={{ fontSize: 12, ...textSecondary }}>勾选窗口加入会议（{addChecked.size} 已选）</span><SessionPicker
            rows={nonMemberRows}
            archivedSessionIds={archivedSessionIds}
            checked={addChecked}
            onToggle={(id) => {
              if(addBusy)return
              setAddChecked((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })
            }}
          /></>}
          {!addBatch&&addTab === 'preset' && <PresetKnightPicker api={connection.api} workspaces={workspaces} followCurrentLabel={followCurrentLabel} selected={addKnights} onChange={next=>{if(!addBusy)setAddKnights(next)}} />}
          {addBatch&&<section aria-label="成员创建进度">{memberCreationResults(addBatch)}{addBatch.members.every(x=>x.stage==='done')&&<p role="status">本批成员已全部加入。</p>}</section>}
          {(!persistence.available||!memberProgressSaved)&&<p role="alert">创建进度仅在本窗口内保留，关闭或刷新前请记下窗口身份。</p>}
          <button
            type="button"
            data-round-table-add-submit=""
            style={{ ...primaryButton, alignSelf: 'flex-start' }}
            disabled={addBusy || (!addBatch&&(addTab === 'existing' ? addChecked.size === 0 : addKnights.length === 0))}
            onClick={() => {if(addBatch?.members.every(x=>x.stage==='done'))saveAddBatch(undefined);else void addMembers()}}
          >
            {addBusy ? '加入中…' : addBatch?addBatch.members.every(x=>x.stage==='done')?'继续添加成员':'重试未完成步骤':addTab === 'existing' ? '加入所选' : '创建并加入'}
          </button>
        </section>
      ))
  const openMember=(id?:string,taskId?:string)=>{setSidebarOpen(true);setSelectedMember(id??null);if(taskId)setFocusTask({id:taskId,nonce:Date.now()})}
  const navigate=(page:string)=>{if(page==='members'){openMember();return}if(page==='tasks'){setTaskModal(true);return}setTab(page)}
  if(meeting.deletion)return <div style={{display:'flex',flexDirection:'column',gap:8}}><button style={buttonBase} onClick={onBack}>返回会议列表</button>{management}<button style={buttonBase} onClick={onRecovery}>找回旧草稿</button></div>

  return (
    <div className="rt-meeting-shell" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 4 }}>

      <style>{meetingShellStyles}</style>
      <header className="rt-meeting-header" aria-label="会议管理">
        <div className="rt-meeting-title-row"><button style={buttonBase} onClick={onBack}>← 返回</button><b title={meeting.title}>{meeting.title}</b><span data-meeting-status="">{meeting.archivedAt?'已归档':meeting.releasePaused?'暂停投递':workflowRun?.status==='completed'?'本次运行已结束':workflowRun?.paused?'流程暂停':'会议讨论'}</span><button style={buttonBase} aria-expanded={overview} onClick={()=>setOverview(v=>!v)}>会议概况</button><button style={buttonBase} onClick={()=>{openMember();setAddOpen(true)}} disabled={!!meeting.archivedAt}>添加成员</button></div>
        <div className="rt-meeting-summary-row"><button style={buttonBase} onClick={()=>openMember()} aria-expanded={sidebarOpen}>成员</button><span>{meeting.memberSessionIds.length}人 · {faults}项异常 · {awaitingReview}项待验收</span><button data-meeting-next-action="" style={buttonBase} onClick={()=>nextAction.page==='tasks'?openMember(taskAttention[0]?.toSessionId,taskAttention[0]?.taskId):navigate(nextAction.page)}>下一步：{nextAction.label}</button></div>
        {overview&&<section className="rt-meeting-overview"><p>{meeting.description||'尚未填写会议说明'}</p><p>秘书：{meeting.secretary?.status==='ready'?'就绪':'待配置'} · {running}项等待／执行中</p>{taskAttention.map(t=><button key={t.taskId} style={buttonBase} onClick={()=>openMember(t.toSessionId,t.taskId)}>{nameOf(t.toSessionId)} · {t.status==='completed'?reviewState(meeting,t):taskRecoveryText(t)?.title??t.status} → 工作日志</button>)}</section>}
      </header>
      <nav className="rt-meeting-nav" aria-label="会议功能">{[['discussion','讨论'],['workflow','进程'],['resources','资料'],['minutes','纪要'],['settings','设置']].map(([id,label])=><button key={id} type="button" style={{...buttonBase,fontWeight:tab===id?700:400,borderBottom:tab===id?'2px solid var(--dsw-alias-state-business-primary)':undefined,background:tab===id?'var(--dsw-alias-interactive-bg-hover)':undefined}} aria-pressed={tab===id} onClick={()=>navigate(id!)}>{label}</button>)}<button style={buttonBase} onClick={()=>setTaskModal(true)}>任务卡</button></nav>
      <div className="rt-meeting-body" data-meeting-body="" style={{flex:1,minHeight:0,display:'flex',position:'relative'}}><div className="rt-meeting-content" style={{flex:1,minWidth:0,minHeight:0,overflowY:tab==='discussion'?'hidden':'auto',display:'flex',flexDirection:'column',gap:8}}><div style={{display:tab==='settings'?'contents':'none'}}>{management}<button style={buttonBase} onClick={onRecovery}>找回旧草稿</button></div>
      <div style={{display:tab==='settings'?'contents':'none'}}>
      <section data-round-table-secretary="" style={{ flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 7, fontSize: 12, ...textSecondary }}>秘书 · {meeting.secretary?.status === 'ready' ? '就绪' : meeting.secretary === undefined ? '尚未配置' : meeting.secretary.status === 'initializing' ? '正在初始化…' : '初始化失败'}{meeting.secretary?.error !== undefined ? `：${meeting.secretary.error}` : ''}{meeting.secretary?.status !== 'ready' && meeting.secretary?.status !== 'initializing' && <div><>{meeting.secretary === undefined && <><p style={{margin:0}}>此会议尚未配置秘书。请选择工作区补建；不会重新创建会议或影响普通成员。</p><select aria-label="秘书默认工作区" value={secretaryWorkspaceChoice || meeting.defaultWorkspaceId || ''} onChange={(e)=>setSecretaryWorkspaceChoice(e.target.value)}><option value="">选择默认工作区</option>{workspaces.map((w)=><option key={w.workspaceId} value={w.workspaceId}>{w.title}</option>)}</select></>}</><button type="button" disabled={secretaryBusy} onClick={()=>{void retrySecretary()}}>{secretaryBusy?'正在配置…':meeting.secretary?'重试秘书初始化':'补建会议秘书'}</button></div>}</section>

      </div>


      
        <div style={{display:taskModal||['discussion','tasks'].includes(tab)?'contents':'none'}}><ReleasePanel key={meeting.meetingId} taskCards={meeting.taskCards} taskCardGenerations={meeting.taskCardGenerations} cardPublications={meeting.cardPublications} focusTask={focusTask} meetingId={meeting.meetingId} workflow={meeting.workflow} messages={meeting.messages} releases={meeting.releases} paused={meeting.releasePaused} archived={!!meeting.archivedAt} assets={meeting.assets} memberStatus={meeting.memberStatus} view={tab} discussions={meeting.discussions} onViewChange={navigate} taskModal={taskModal} onCloseTask={()=>setTaskModal(false)} onOpenMember={openMember} onOpenSession={id=>rtCtx.uiWorkspace.openSession(id as never)} onJumpMeeting={onJumpMeeting} names={meeting.memberNames} members={meeting.memberSessionIds.map(id=>({id,name:nameOf(id)}))} onChanged={onChanged}/></div>
        {tab==='workflow'&&<WorkflowPanel key={meeting.meetingId} onNavigate={navigate} meeting={meeting} members={meeting.memberSessionIds.map(id=>({id,name:nameOf(id)}))} onChanged={onChanged} onOpenSession={id=>rtCtx.uiWorkspace.openSession(id as never)}/>}
        {tab==='resources'&&<ResourcesPanel key={meeting.meetingId} meetingId={meeting.meetingId} assets={meeting.assets} folder={meeting.meetingFolder} folderError={meeting.meetingFolderError} archived={!!meeting.archivedAt} onChanged={onChanged}/>}
        {tab==='minutes'&&<MinutesPanel meetingId={meeting.meetingId} members={meeting.memberSessionIds.map(id=>({id,name:nameOf(id)}))} ready={meeting.secretary?.status === 'ready'&&!meeting.archivedAt} minutes={meeting.minutes} publishedIds={(meeting.messages??[]).filter(m=>!!m.minutesId&&!m.previewOnly).map(m=>m.minutesId!)} job={meeting.minutesJob} formalOnly={meeting.minutesSource!=='session'} onChanged={onChanged} />}
        {tab==='settings'&&history.length > 0 && (<details><summary>历史广播与旧任务</summary>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, ...textSecondary }}>会议记录</span>
            {history.map((event) => {
              if(event.kind==='rename')return <p key={event.id} style={{fontSize:11,...textTertiary}}>会议改名：{event.oldTitle} → {event.title}</p>
              if(event.kind==='description_update')return <p key={event.id} style={{fontSize:11,...textTertiary}}>会议说明已更新</p>
              if (event.kind === 'join' || event.kind === 'leave') {
                return (
                  <p key={event.id} style={{ margin: 0, fontSize: 11, ...textTertiary }}>
                    {new Date(event.time).toLocaleTimeString()} {nameOf(event.sessionId)} {event.kind === 'join' ? `加入会议（${event.source === 'secretary' ? '会议秘书' : event.source === 'preset' ? `预设新建：${event.presetId ?? '未知预设'}${event.workspaceId === undefined ? '' : `，工作区 ${event.workspaceId}`}` : '已有窗口'}）` : '退出会议'}
                  </p>
                )
              }
              if (event.kind === 'task') {
                return (
                  <article key={event.id} data-round-table-task={event.taskId} data-round-table-task-status={event.status} style={{
                    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '6px 10px',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', ...textPrimary }}>
                      任务：{event.title}
                    </p>
                    <footer style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 11 }}>
                      <span style={{
                        lineHeight: '16px', padding: '0 6px', borderRadius: 999,
                        border: '1px solid var(--dsw-alias-border-l2)', color: taskStatusColor(event.status),
                      }}>
                        {TASK_STATUS_LABEL[event.status] ?? event.status}
                      </span>
                      <span style={textTertiary}>→ {event.toMember}（{event.teamName}）</span>
                    </footer>
                    {event.status === 'completed' && event.result !== undefined && (
                      <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...textSecondary }}>
                        结果：{event.result}
                      </p>
                    )}
                    {event.error !== undefined && (
                      <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }}>
                        {event.error}
                      </p>
                    )}
                  </article>
                )
              }
              if (event.kind === 'minutes') return <p key={event.id} style={{fontSize:11, margin:0, ...textTertiary}}>{new Date(event.time).toLocaleTimeString()} 秘书已生成纪要（在上方预览）</p>
              if (event.kind !== 'broadcast') return null
              return (
                <article key={event.id} data-round-table-broadcast={event.id} style={{
                  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '6px 10px',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...textPrimary }}>
                    {event.text}
                  </p>
                  <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {event.deliveries.map((delivery) => (
                      <span
                        key={delivery.sessionId}
                        data-round-table-delivery={delivery.status}
                        title={delivery.error ?? delivery.status}
                        style={{
                          fontSize: 11, lineHeight: '16px', padding: '0 6px', borderRadius: 999,
                          border: '1px solid var(--dsw-alias-border-l2)',
                          color: delivery.status === 'delivered' ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-state-error-primary)',
                        }}
                      >
                        {delivery.status === 'delivered' ? '✓' : '✗ 未送达'} {nameOf(delivery.sessionId)}
                      </span>
                    ))}
                  </footer>
                </article>
              )
            })}
          </section></details>
        )}


      </div><MemberSidebar open={sidebarOpen} meeting={meeting} members={[...new Set([...meeting.memberSessionIds,...Object.keys(meeting.memberNames??{}),...(meeting.releases??[]).flatMap(r=>r.tasks.map(t=>t.toSessionId)),...(meeting.discussions??[]).flatMap(d=>d.recipientIds)])].filter(id=>!['user','secretary',meeting.secretary?.sessionId].includes(id)).map(id=>({id,name:nameOf(id),historical:!meeting.memberSessionIds.includes(id),connected:meeting.memberStatus?.[id]?.connected,running:meeting.memberStatus?.[id]?.running,statusLabel:!meeting.memberSessionIds.includes(id)?'已离会 · 历史记录':meeting.memberStatus?.[id]?.availability?.reason??(meeting.memberStatus?.[id]?.connected?'已就绪':'尚未加载'),workspaceLabel:memberWorkspaceInfo(id,rowOf(id)?.cwd,workspaces).label}))} selectedMemberId={selectedMember} onSelectMember={setSelectedMember} onClose={()=>setSidebarOpen(false)} focusTaskId={focusTask?.id} onNavigateTask={taskId=>{const task=meeting.releases?.flatMap(r=>r.tasks).find(t=>t.taskId===taskId);if(task)openMember(task.toSessionId,taskId)}} renderManagement={()=>addPanel} renderMemberDetails={id=>!meeting.memberSessionIds.includes(id)?<p>这位成员已离会，历史发言、任务结果与修改记录仍可在会议工作日志查看。</p>:<MemberLive key={id} nameOf={nameOf} sessionId={id} running={meeting.memberStatus?.[id]?.running??false} present={meeting.memberStatus?.[id]?.connected??false} cwd={rowOf(id)?.cwd} workspaces={workspaces} meetingId={meeting.meetingId} onChanged={onChanged} onRemove={removeMember} onOpen={sessionId=>rtCtx.uiWorkspace.openSession(sessionId as never)} releases={meeting.releases} discussions={meeting.discussions} workflow={meeting.workflow} availability={meeting.memberStatus?.[id]?.availability}/>} renderTaskActions={id=><MemberTaskActions key={id} meetingId={meeting.meetingId} memberId={id} memberName={nameOf(id)} discussions={meeting.discussions??[]} releases={meeting.releases??[]} onChanged={onChanged} focusTaskId={focusTask?.id}/>}/>
      </div>

      {sendError !== undefined && (
        <p role="alert" style={{ flex: 'none', margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }}>{sendError}</p>
      )}
      {tab==='settings'&&<details style={{flex:'none',fontSize:12}}><summary>立即操作（会唤醒成员，不受放行队列暂停约束）</summary><textarea aria-label="立即发送内容" rows={3} style={inputStyle} value={draft} placeholder="输入要立即发送的内容" onChange={e=>setDraft(e.target.value)}/><select aria-label="立即发送对象" style={inputStyle} value={target?.sessionId??''} onChange={e=>setTarget(e.target.value?{sessionId:e.target.value,label:nameOf(e.target.value)}:undefined)}><option value="">全员广播</option>{meeting.memberSessionIds.map(id=><option key={id} value={id}>{nameOf(id)}</option>)}</select><button type="button" style={buttonBase} disabled={sending||!!meeting.archivedAt||!draft.trim()||!meeting.memberSessionIds.length} onClick={()=>setImmediateConfirm(true)}>{target?`立即派遣给 ${target.label}`:'立即广播全员'}…</button>{immediateConfirm&&<div role="alertdialog" aria-label="确认立即唤醒"><p>将立即发送给{target?.label??`${meeting.memberSessionIds.length} 位成员`}。原窗口可能开始工作并消耗 Token。</p><button style={buttonBase} disabled={sending} onClick={()=>{setImmediateConfirm(false);if(target)void dispatch();else void broadcast()}}>确认立即发送</button><button style={buttonBase} onClick={()=>setImmediateConfirm(false)}>取消</button></div>}</details>}
    </div>
  )
}

