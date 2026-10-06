import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
import type { TaskCard, CardPublication } from './task-card-types.ts';
export declare class TaskCardRequestRejected extends Error {
}
export interface GenerateTaskCardsInput {
    recipientIds: string[];
    instruction?: string;
    messageIds?: string[];
    assetIds?: string[];
}
export declare const startTaskCardGeneration: (ctx: Context, mid: string, input: GenerateTaskCardsInput, rid: string) => Promise<{
    generationId: string;
    discussionId: string;
}>;
export declare function adjustTaskCard(ctx: Context, mid: string, cardId: string, input: {
    expectedVersion: number;
    note: string;
}, rid: string): Promise<{
    generationId: string;
    discussionId: string;
}>;
export interface ProposedTaskCard {
    title: string;
    body: string;
    assigneeSessionId?: string;
}
export declare function proposeTaskCards(ctx: Context, mid: string, generationId: string, discussionId: string, actor: {
    session: {
        id: unknown;
    };
}, items: ProposedTaskCard[], emptyReason: string | undefined, rid: string): Promise<{
    generationId: string;
    cardIds: string[];
}>;
export declare function editTaskCard(mid: string, cardId: string, input: {
    expectedVersion: number;
    title: string;
    body: string;
    assigneeSessionId?: string;
}, rid: string): Promise<TaskCard>;
export declare function adoptTaskCardProposal(mid: string, cardId: string, proposalId: string, expectedVersion: number, rid: string): Promise<TaskCard>;
export declare function publishTaskCards(ctx: Context, mid: string, input: {
    cards: {
        cardId: string;
        version: number;
    }[];
    execute?: boolean;
}, rid: string): Promise<CardPublication>;
export declare function registerTaskCardTools(ctx: Context): void;
export declare function listPublishedTaskCards(meeting: Meeting): {
    id: string;
    publicationId: string;
    publishedAt: number | undefined;
    messageIds: string[];
    assetIds: string[];
    fileRef: {
        fileId: string;
        relativePath: string;
        sha256: string;
        version: number;
    };
    cardId: string;
    version: number;
    title: string;
    body: string;
    generatorSessionId: string;
    generatorName?: string;
    assigneeName?: string;
    assigneeSessionId?: string;
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
