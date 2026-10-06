interface Delivery {
    sessionId: string;
    status: 'delivered' | 'undelivered';
    error?: string;
}
export type MinutesScope = 'full' | 'since_last';
export interface MinutesOutput {
    keyDecisions: string[];
    taskProgress: string[];
    openItems: string[];
    summary: string;
}
export interface MinutesFacts {
    scopeLabel: string;
    taskScope?: {
        mode: 'full' | 'since_last' | 'workflow';
        changedTaskIds: string[];
        addedTaskIds?: string[];
    };
    members: string[];
    tasks: {
        id: string;
        member: string;
        title: string;
        status: string;
        review: string;
        result?: string;
        kind: string;
        source: string;
    }[];
    counts: {
        total: number;
        submitted: number;
        accepted: number;
        changesRequested: number;
        awaitingReview: number;
        open: number;
    };
    decisions: {
        source: string;
        text: string;
    }[];
    sourceDigest: string;
}
export interface MinutesIntegrity {
    state: 'conflict' | 'needs_review';
    warnings: string[];
    facts: MinutesFacts;
    checkedAt: number;
    coverage: string;
    reviewedAt?: number;
    acknowledgedConflicts?: boolean;
}
export interface MinutesRecord extends MinutesOutput {
    integrity?: MinutesIntegrity;
    workflow?: {
        runId: string;
        activationId: string;
        jobId: string;
        messageIds: string[];
        assetIds: string[];
    };
    source?: 'formal' | 'session';
    id: string;
    scope: MinutesScope;
    requestedScope?: MinutesScope;
    generatedAt: number;
    cutoff?: number;
    modelCalls: number;
    /** Actual step/start events; absent when provider cannot expose request count. */
    requestCount?: number;
    missingSessionIds?: string[];
    missing?: {
        sessionId: string;
        error: string;
    }[];
    cursors?: Record<string, number>;
    eventVersions?: Record<string, string>;
    sourceCount?: number;
    sent?: boolean;
    deliveries?: Delivery[];
    sending?: boolean;
}
export interface MinutesJob {
    workflow?: {
        runId: string;
        activationId: string;
    };
    id: string;
    scope: MinutesScope;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: number;
    modelCalls: number;
    error?: string;
    minutesId?: string;
}
export declare function isMinutesOutput(value: unknown): value is MinutesOutput;
export declare function isMinutesRecord(value: unknown): value is MinutesRecord;
export {};
