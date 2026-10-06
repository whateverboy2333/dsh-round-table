import type { ChatDraft } from './chat-draft.ts';
interface Request {
    requestId: string;
    recipientIds: string[];
    instruction: string;
    messageIds: string[];
    assetIds: string[];
    stage?: 'accepted' | 'rejected';
}
/** The server receipt means accepted, not that every original member received it. */
export declare function useCardGeneration(meetingId: string, onChanged: () => Promise<void>, onOpen: () => void): {
    pending: Request | undefined;
    busy: boolean;
    error: string;
    notice: string;
    begin: (draft: ChatDraft) => void;
    retry: () => undefined;
};
export {};
