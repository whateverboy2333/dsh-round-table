import type {MeetingMessage} from './meeting-flow-types.ts'
export interface ImageRecipientCapability {sessionId:string;state:'supported'|'unsupported'|'unknown';reason:string}

/** GUI-only operations. Mentions are explicit session identities, never parsed from prose. */
export interface ChatInput {
  /** Absent preserves legacy send-as-task clients. New clients explicitly send messages. */
  kind?:'message'|'task'
  contextTaskId?:string
  mode:'record'|'send'|'queue'
  instruction:string
  messageIds:string[]
  assetIds:string[]
  recipientIds:string[]
  runId:string|null
  nodeId?:string
}
export interface ChatReceipt {
  discussionId?:string
  messageId:string
  releaseId?:string
  runId?:string
  nodeId?:string
  slotKey?:string
  round?:number
}
export interface ChatRequestMeta extends ChatReceipt {
  requestId:string
  requestHash:string
  mode:ChatInput['mode']
}
export interface ChatPlan {
  imageCapabilities?:ImageRecipientCapability[]
  fingerprint:string
  inputs:MeetingMessage[]
  assetIds:string[]
  recipientIds:string[]
  characters:number
  slotKey?:string
  round?:number
  nodeTitle?:string
}
