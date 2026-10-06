import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
import { type MinutesOutput, type MinutesScope } from './minutes-types.ts';
import { approvedMeetingFileSources } from './meeting-files-sync.ts';
export { isMinutesOutput } from './minutes-types.ts';
export type { MinutesOutput } from './minutes-types.ts';
export interface HistoryEvent {
    seq: number;
    time: number;
    type: string;
    data: unknown;
}
export interface MinutesData {
    meetingFiles?: Awaited<ReturnType<typeof approvedMeetingFileSources>>;
    source?: 'formal' | 'session';
    meetingId: string;
    title: string;
    description: string;
    scope: MinutesScope;
    requestedScope: MinutesScope;
    cutoff: number;
    events: unknown[];
    taskSnapshot?: unknown[];
    taskChanges?: {
        addedTaskIds: string[];
        updatedTaskIds: string[];
    };
    members: {
        sessionId: string;
        role: string;
        messages: {
            seq: number;
            time: number;
            text: string;
        }[];
    }[];
    missing: {
        sessionId: string;
        error: string;
    }[];
    cursors: Record<string, number>;
    eventVersions: Record<string, string>;
    previous?: MinutesOutput;
}
/** Same read paths as session.history, never mutating load/repair. */
export declare function readMemberHistory(ctx: Context, id: string, signal?: AbortSignal): Promise<readonly HistoryEvent[]>;
export declare function collectMinutesData(meeting: Meeting, requestedScope: MinutesScope, read: (id: string) => Promise<readonly HistoryEvent[]>, cutoff?: number): Promise<MinutesData>;
export declare function meetingMinutesData(ctx: Context, meetingId: string, scope: MinutesScope, signal?: AbortSignal): Promise<MinutesData>;
export declare function splitMinutesInput(text: string, size?: number): string[];
export interface WorkflowMinutesBinding {
    runId: string;
    activationId: string;
    jobId: string;
}
export declare function startMinutes(ctx: Context, meetingId: string, scope: MinutesScope, workflow?: WorkflowMinutesBinding): Promise<{
    jobId: string;
}>;
export declare function waitMinutes(meetingId: string): Promise<void>;
export declare function cancelMinutes(meetingId: string, expectedJobId?: string): Promise<void>;
export declare function attachMinutesLifecycle(ctx: Context): void;
export declare function recoverMinutesJobs(root: string): Promise<void>;
export declare function minutesText(m: MinutesOutput): string;
export declare function sendMinutes(ctx: Context, meetingId: string, minutesId: string): Promise<Meeting>;
export declare function quiesceMeetingMinutes(root: string, id: string): Promise<void>;
