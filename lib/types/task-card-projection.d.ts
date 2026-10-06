import type { TaskCardMeetingFields, TaskCardGeneration } from './task-card-types.ts';
/** Browser-safe projection: stored links, never parses arbitrary chat or private history. */
export interface TaskCardProjectionMeeting extends TaskCardMeetingFields {
    memberNames?: Record<string, string>;
    discussions?: {
        id: string;
        messageId: string;
        replies: {
            sessionId: string;
            messageId: string;
            text: string;
            time: number;
        }[];
        deliveries: {
            toSessionId: string;
            status: string;
            error?: string;
            updatedAt: number;
        }[];
    }[];
}
export interface TaskCardFact {
    id: string;
    time: number;
    kind: 'generation' | 'proposal' | 'edit' | 'publication';
    memberId?: string;
    cardId?: string;
    generationId?: string;
    title: string;
    text: string;
}
export declare function taskCardGenerationRequestText(m: TaskCardProjectionMeeting, g: TaskCardGeneration): string;
export declare function taskCardResponseText(m: TaskCardProjectionMeeting, g: TaskCardGeneration, sid: string): string;
export declare function projectTaskCardMessage(m: TaskCardProjectionMeeting, message: {
    id?: string;
    messageId?: string;
    discussionId?: string;
    sender?: string;
    by?: string;
    text?: string;
}): string | undefined;
export declare function taskCardFacts(m: TaskCardProjectionMeeting): TaskCardFact[];
