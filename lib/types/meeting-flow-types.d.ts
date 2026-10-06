/** Wire-safe contracts for manual input release. No host imports. */
export interface ResultSource {
    kind: 'manual' | 'agent';
    sessionId: string;
    seq?: number;
    originalTime?: number;
    digest?: string;
    excerpt?: boolean;
}
export interface MeetingAsset {
    id: string;
    name: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    version: number;
    createdAt: number;
    text?: string;
    image?: unknown;
    contentKind?: 'file';
    referenceOnly?: boolean;
    fileReference?: {
        fileId: string;
        relativePath: string;
        folderPath?: string;
    };
    storageLocation?: 'meeting-folder' | 'internal-assets';
    contentNote?: string;
}
export interface PublishCandidate {
    seq: number;
    time: number;
    text: string;
    digest: string;
}
export interface MeetingMessage {
    id: string;
    time: number;
    sender: string;
    text: string;
    kind: 'message' | 'broadcast' | 'result' | 'minutes';
    taskId?: string;
    replyTo?: string[];
    source?: ResultSource;
    assetIds?: string[];
    releaseId?: string;
    recipientIds?: string[];
    discussionId?: string;
    contextTaskId?: string;
    minutesId?: string;
    recordOnly?: boolean;
    /** Generated minutes remain available to bound workflow nodes, not to public chat. */
    previewOnly?: boolean;
    deliveries?: {
        sessionId: string;
        status: 'delivered' | 'undelivered';
        error?: string;
    }[];
}
export type ReleaseTaskStatus = 'queued' | 'offline' | 'delivering' | 'uncertain' | 'delivered' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export interface ReleaseTask {
    taskId: string;
    toSessionId: string;
    status: ReleaseTaskStatus;
    restoration?: {
        state: 'restoring' | 'restored' | 'restore_failed';
        startedAt: number;
        updatedAt: number;
        reason?: string;
    };
    updatedAt: number;
    attempts: number;
    hostMessageId?: string;
    deliveryText?: string;
    deliveredAt?: number;
    claimedAt?: number;
    completedAt?: number;
    result?: string;
    error?: string;
    resultMessageId?: string;
    resultSource?: ResultSource;
    closedAt?: number;
    closedReason?: string;
    review?: 'accepted' | 'changes_requested';
    reviewNote?: string;
    reviewHistory?: {
        id: string;
        time: number;
        review: 'accepted' | 'changes_requested';
        note: string;
    }[];
    workflow?: import('./workflow-types.ts').WorkflowBinding;
}
export interface ReleaseDraft {
    id: string;
    version: number;
    status: 'draft' | 'released';
    instruction: string;
    messageIds: string[];
    recipientIds: string[];
    createdAt: number;
    releasedAt?: number;
    meetingTitle?: string;
    inputs?: MeetingMessage[];
    tasks: ReleaseTask[];
    title?: string;
    parentTaskId?: string;
    revisionNote?: string;
    assetIds?: string[];
    chat?: import('./chat-types.ts').ChatRequestMeta;
}
export interface DraftInput {
    id: string;
    version?: number;
    instruction: string;
    messageIds: string[];
    recipientIds: string[];
    title?: string;
    parentTaskId?: string;
    assetIds?: string[];
}
export declare function isReleaseDraft(value: unknown): value is ReleaseDraft;
