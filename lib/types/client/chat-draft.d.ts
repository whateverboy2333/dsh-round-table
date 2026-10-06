export interface ChatDraft {
    intent: 'record' | 'response' | 'work';
    instruction: string;
    recipientIds: string[];
    messageIds: string[];
    assetIds: string[];
    contextTaskId?: string;
}
export declare const emptyChatDraft: () => ChatDraft;
export declare function restoreChatDraft(value: unknown): ChatDraft;
export declare function mentionAt(text: string, caret: number): {
    start: number;
    end: number;
    query: string;
} | undefined;
