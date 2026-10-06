import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
import type { DiscussionRecord } from './discussion-types.ts';
export declare function newDiscussion(m: Meeting, input: {
    instruction: string;
    recipientIds: string[];
    messageIds: string[];
    contextTaskId?: string;
}, plan: {
    inputs: DiscussionRecord['inputs'];
    assetIds: string[];
}, requestId: string, requestHash: string): DiscussionRecord;
export declare function pumpDiscussions(ctx: Context): Promise<void>;
export declare function recoverDiscussions(ctx: Context): Promise<void>;
export declare function retryDiscussionDelivery(ctx: Context, meetingId: string, discussionId: string, sessionId: string): Promise<void>;
export declare function closeDiscussionDelivery(meetingId: string, discussionId: string, sessionId: string, confirmed: boolean): Promise<void>;
export declare function replyDiscussion(ctx: Context, meetingId: string, discussionId: string, actor: {
    session: {
        id: unknown;
    };
}, text: string, requestId?: string): Promise<{
    discussionId: string;
    messageId: string;
}>;
export declare function attachDiscussionLifecycle(ctx: Context): void;
