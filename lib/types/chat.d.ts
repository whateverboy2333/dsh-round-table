import { type Meeting } from './meetings.ts';
import type { ChatInput, ChatPlan, ChatReceipt } from './chat-types.ts';
import type { Context } from '@deepseek-ai/cordis';
/** Only failures before writing state are definite rejections; storage/transport failures stay uncertain. */
export declare class ChatConflict extends Error {
}
export declare function previewChat(m: Meeting, input: ChatInput): ChatPlan;
export declare function commitChat(meetingId: string, input: ChatInput, fingerprint: string, requestId: string, ctx?: Context): Promise<ChatReceipt>;
export declare function publishChatMinutes(meetingId: string, minutesId: string): Promise<void>;
