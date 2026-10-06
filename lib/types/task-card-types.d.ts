/** User-approved cards are separate from execution and ordinary replies. */
export interface TaskCardVersion {
    version: number;
    title: string;
    body: string;
    assigneeSessionId?: string;
    source: 'generator' | 'user' | 'adjustment';
    sourceRequestId: string;
    createdAt: number;
}
export interface TaskCardProposal {
    id: string;
    generationId: string;
    baseVersion: number;
    title: string;
    body: string;
    assigneeSessionId?: string;
    createdAt: number;
    adoptedVersion?: number;
}
export interface TaskCard {
    id: string;
    generationId: string;
    generatorSessionId: string;
    createdAt: number;
    version: number;
    title: string;
    body: string;
    assigneeSessionId?: string;
    versions: TaskCardVersion[];
    proposals: TaskCardProposal[];
    operations: {
        requestId: string;
        hash: string;
        version: number;
    }[];
}
export interface TaskCardGeneration {
    id: string;
    requestId: string;
    requestHash: string;
    discussionId: string;
    kind: 'generate' | 'adjust';
    recipientIds: string[];
    instruction: string;
    userInstruction?: string;
    adjustmentNote?: string;
    messageIds: string[];
    assetIds: string[];
    assetVersions?: {
        id: string;
        version: number;
        sha256: string;
    }[];
    createdAt: number;
    cardId?: string;
    baseVersion?: number;
    responses: {
        sessionId: string;
        requestId: string;
        hash: string;
        cardIds: string[];
        emptyReason?: string;
        createdAt: number;
    }[];
}
export interface CardPublication {
    id: string;
    requestId: string;
    requestHash: string;
    createdAt: number;
    execute: boolean;
    status: 'prepared' | 'published';
    cards: {
        cardId: string;
        version: number;
        title: string;
        body: string;
        generatorSessionId: string;
        generatorName?: string;
        assigneeName?: string;
        assigneeSessionId?: string;
        messageIds?: string[];
        assetIds?: string[];
        assetVersions?: {
            id: string;
            version: number;
            sha256: string;
        }[];
        fileId?: string;
        relativePath?: string;
        sha256?: string;
        releaseId?: string;
    }[];
    publishedAt?: number;
}
export interface TaskCardMeetingFields {
    taskCardGenerations?: TaskCardGeneration[];
    taskCards?: TaskCard[];
    cardPublications?: CardPublication[];
}
export declare function isTaskCardGeneration(v: unknown): v is TaskCardGeneration;
export declare function isTaskCard(v: unknown): v is TaskCard;
export declare function isCardPublication(v: unknown): v is CardPublication;
/** Reject broken generation/card/version links before treating the disk as approved evidence. */
export declare function isTaskCardMeetingFields(v: TaskCardMeetingFields): boolean;
