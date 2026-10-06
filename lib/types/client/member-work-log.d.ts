import { type TaskCardProjectionMeeting } from '../task-card-projection.ts';
import type { MeetingAsset, MeetingMessage, ReleaseDraft } from '../meeting-flow-types.ts';
export interface MemberLogDiscussion {
    id: string;
    messageId: string;
    instruction: string;
    recipientIds: string[];
    createdAt: number;
    contextTaskId?: string;
    messageIds: string[];
    assetIds: string[];
    inputs?: MeetingMessage[];
    deliveries: {
        toSessionId: string;
        status: string;
        updatedAt: number;
        deliveredAt?: number;
        error?: string;
    }[];
    replies: {
        sessionId: string;
        text: string;
        messageId: string;
        time: number;
    }[];
}
export interface MemberLogEvent {
    id: string;
    kind: string;
    time: number;
    sessionId?: string;
    toSessionId?: string;
    taskId?: string;
    status?: string;
    title?: string;
    text?: string;
    result?: string;
    error?: string;
    by?: string;
    deliveries?: {
        sessionId: string;
        status: string;
        error?: string;
    }[];
}
export interface MemberLogMeeting extends TaskCardProjectionMeeting {
    meetingId: string;
    title?: string;
    messages?: MeetingMessage[];
    releases?: ReleaseDraft[];
    assets?: MeetingAsset[];
    events?: MemberLogEvent[];
    discussions?: MemberLogDiscussion[];
}
export interface MemberWorkLogEntry {
    id: string;
    kind: 'request' | 'delivery' | 'reply' | 'result' | 'review' | 'revision' | 'membership';
    time: number;
    title: string;
    text: string;
    taskId?: string;
    messageId?: string;
    source?: string;
}
export interface MemberWorkLogItem {
    id: string;
    kind: 'discussion' | 'task' | 'participation';
    title: string;
    taskId?: string;
    parentTaskId?: string;
    status: string;
    entries: MemberWorkLogEntry[];
    materials: {
        id: string;
        name: string;
        text?: string;
    }[];
}
/** Only this meeting's persisted records are inputs; no raw Session history or model summary. */
export declare function memberWorkLog(meeting: MemberLogMeeting, memberId: string): MemberWorkLogItem[];
