import type { MeetingMessage } from './meeting-flow-types.ts';
export type DiscussionDeliveryStatus = 'queued' | 'offline' | 'delivering' | 'delivered' | 'uncertain' | 'failed' | 'cancelled';
export interface DiscussionDelivery {
    toSessionId: string;
    status: DiscussionDeliveryStatus;
    hostMessageId: string;
    updatedAt: number;
    deliveredAt?: number;
    error?: string;
    sessionCreatedAt?: number;
    sessionCwd?: string;
    deliveryText?: string;
}
export interface DiscussionReply {
    sessionId: string;
    text: string;
    messageId: string;
    time: number;
    requestId?: string;
}
export interface DiscussionRecord {
    id: string;
    messageId: string;
    requestId: string;
    requestHash: string;
    instruction: string;
    recipientIds: string[];
    messageIds: string[];
    assetIds: string[];
    inputs: MeetingMessage[];
    createdAt: number;
    contextTaskId?: string;
    deliveries: DiscussionDelivery[];
    replies: DiscussionReply[];
}
export declare function isDiscussionRecord(value: unknown): value is DiscussionRecord;
