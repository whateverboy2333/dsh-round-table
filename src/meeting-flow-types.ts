/** Wire-safe contracts for manual input release. No host imports. */
export interface ResultSource { kind:'manual'|'agent'; sessionId:string; seq?:number; originalTime?:number; digest?:string; excerpt?:boolean }
export interface MeetingAsset {id:string;name:string;mimeType:string;bytes:number;sha256:string;version:number;createdAt:number;text?:string;image?:unknown;contentKind?:'file';referenceOnly?:boolean;fileReference?:{fileId:string;relativePath:string;folderPath?:string};storageLocation?:'meeting-folder'|'internal-assets';contentNote?:string}
export interface PublishCandidate {seq:number; time:number; text:string; digest:string}
export interface MeetingMessage {
  id: string
  time: number
  sender: string
  text: string
  kind: 'message' | 'broadcast' | 'result' | 'minutes'
  taskId?: string
  replyTo?: string[]
  source?: ResultSource
  assetIds?: string[]
  releaseId?: string
  recipientIds?: string[]
  discussionId?:string
  contextTaskId?:string
  minutesId?: string
  recordOnly?: boolean
  /** Generated minutes remain available to bound workflow nodes, not to public chat. */
  previewOnly?: boolean
  deliveries?: {sessionId:string;status:'delivered'|'undelivered';error?:string}[]
}
export type ReleaseTaskStatus = 'queued' | 'offline' | 'delivering' | 'uncertain' | 'delivered' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
export interface ReleaseTask {
  taskId: string
  toSessionId: string
  status: ReleaseTaskStatus
  restoration?:{state:'restoring'|'restored'|'restore_failed';startedAt:number;updatedAt:number;reason?:string}
  updatedAt: number
  attempts: number
  hostMessageId?: string
  deliveryText?: string
  deliveredAt?: number
  claimedAt?: number
  completedAt?: number
  result?: string
  error?: string
  resultMessageId?: string
  resultSource?: ResultSource
  closedAt?: number
  closedReason?: string
  review?: 'accepted'|'changes_requested'
  reviewNote?: string
  reviewHistory?:{id:string;time:number;review:'accepted'|'changes_requested';note:string}[]
  workflow?: import('./workflow-types.ts').WorkflowBinding
}
export interface ReleaseDraft {
  id: string
  version: number
  status: 'draft' | 'released'
  instruction: string
  messageIds: string[]
  recipientIds: string[]
  createdAt: number
  releasedAt?: number
  meetingTitle?: string
  inputs?: MeetingMessage[]
  tasks: ReleaseTask[]
  title?: string
  parentTaskId?: string
  revisionNote?: string
  assetIds?: string[]
  chat?: import('./chat-types.ts').ChatRequestMeta
}
export interface DraftInput { id: string; version?: number; instruction: string; messageIds: string[]; recipientIds: string[]; title?:string;parentTaskId?:string;assetIds?:string[] }
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(v=>typeof v==='string')
export function isReleaseDraft(value: unknown): value is ReleaseDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r=value as ReleaseDraft
  return typeof r.id==='string' && Number.isInteger(r.version) && r.version>0 && ['draft','released'].includes(r.status)
    && typeof r.instruction==='string' && strings(r.messageIds) && strings(r.recipientIds) && Number.isFinite(r.createdAt)
    && Array.isArray(r.tasks) && r.tasks.every(t=>t && typeof t.taskId==='string' && typeof t.toSessionId==='string'
      && ['queued','offline','delivering','uncertain','delivered','in_progress','completed','failed','cancelled'].includes(t.status)
      && Number.isFinite(t.updatedAt) && Number.isInteger(t.attempts) && t.attempts>=0)
    && (r.inputs===undefined || (Array.isArray(r.inputs) && r.inputs.every(m=>m && typeof m.id==='string' && typeof m.text==='string' && typeof m.sender==='string' && Number.isFinite(m.time))))
}
