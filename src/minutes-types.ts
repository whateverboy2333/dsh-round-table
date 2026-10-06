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
export interface MinutesFacts {scopeLabel:string;taskScope?:{mode:'full'|'since_last'|'workflow';changedTaskIds:string[];addedTaskIds?:string[]};members:string[];tasks:{id:string;member:string;title:string;status:string;review:string;result?:string;kind:string;source:string}[];counts:{total:number;submitted:number;accepted:number;changesRequested:number;awaitingReview:number;open:number};decisions:{source:string;text:string}[];sourceDigest:string}
export interface MinutesIntegrity {state:'conflict'|'needs_review';warnings:string[];facts:MinutesFacts;checkedAt:number;coverage:string;reviewedAt?:number;acknowledgedConflicts?:boolean}
export interface MinutesRecord extends MinutesOutput {
    integrity?:MinutesIntegrity;
    workflow?: {runId:string;activationId:string;jobId:string;messageIds:string[];assetIds:string[]};
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
    workflow?: {runId:string;activationId:string};
    id: string;
    scope: MinutesScope;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: number;
    modelCalls: number;
    error?: string;
    minutesId?: string;
}
export function isMinutesOutput(value: unknown): value is MinutesOutput {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const v = value as Record<string, unknown>;
    return Object.keys(v).every(k => ['keyDecisions', 'taskProgress', 'openItems', 'summary'].includes(k))
        && typeof v.summary === 'string' && v.summary.trim().length > 0
        && ['keyDecisions', 'taskProgress', 'openItems'].every(k => Array.isArray(v[k]) && (v[k] as unknown[]).every(x => typeof x === 'string'));
}
export function isMinutesRecord(value: unknown): value is MinutesRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const v = value as MinutesRecord;
    return typeof v.id === 'string' && (v.scope === 'full' || v.scope === 'since_last')
        && isMinutesOutput({ summary: v.summary, keyDecisions: v.keyDecisions, taskProgress: v.taskProgress, openItems: v.openItems })
        && Number.isFinite(v.generatedAt) && Number.isInteger(v.modelCalls) && v.modelCalls >= 0
        && (v.integrity===undefined||(!!v.integrity&&['conflict','needs_review'].includes(v.integrity.state)&&Array.isArray(v.integrity.warnings)&&v.integrity.warnings.every(s=>typeof s==='string')&&!!v.integrity.facts&&Array.isArray(v.integrity.facts.tasks)&&Array.isArray(v.integrity.facts.members)&&!!v.integrity.facts.counts&&Object.values(v.integrity.facts.counts).every(n=>Number.isSafeInteger(n)&&n>=0)&&typeof v.integrity.facts.scopeLabel==='string'&&typeof v.integrity.facts.sourceDigest==='string'&&Number.isFinite(v.integrity.checkedAt)&&(v.integrity.reviewedAt===undefined||Number.isFinite(v.integrity.reviewedAt))))
        && (v.cursors === undefined || (v.cursors !== null && typeof v.cursors === 'object' && Object.values(v.cursors).every(n => Number.isInteger(n) && n >= -1)))
        && (v.deliveries === undefined || (Array.isArray(v.deliveries) && v.deliveries.every(d => d && typeof d.sessionId === 'string' && (d.status === 'delivered' || d.status === 'undelivered'))));
}
