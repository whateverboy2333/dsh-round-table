import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
import type { DraftInput, MeetingMessage, ReleaseDraft, ReleaseTask, PublishCandidate } from './meeting-flow-types.ts';
/** An explicit conference stream; never reads arbitrary private assistant replies. */
export declare function meetingMessageStream(meeting: Meeting): MeetingMessage[];
export declare function saveMeetingMessage(meetingId: string, content: string, requestId: string): Promise<Meeting>;
export declare function markMeetingConclusion(meetingId: string, messageId: string): Promise<Meeting>;
export declare class ReleaseRequestRejected extends Error {
}
export declare function saveReleaseDraft(meetingId: string, input: DraftInput): Promise<ReleaseDraft>;
/** Pure preparation shared by manual releases and atomic workflow activation. Never sends. */
export declare function freezeRelease(m: Meeting, draft: ReleaseDraft): ReleaseDraft;
export declare function releaseDraft(_ctx: Context, meetingId: string, draftId: string, version: number): Promise<ReleaseDraft>;
export declare function findReleaseTask(m: Meeting, taskId: string): {
    draft: ReleaseDraft;
    task: ReleaseTask;
} | undefined;
export declare function pumpReleases(ctx: Context): Promise<void>;
export declare function recoverReleases(ctx: Context): Promise<void>;
export declare function attachReleaseLifecycle(ctx: Context): void;
export declare function retryReleaseTask(ctx: Context, meetingId: string, taskId: string, allowDuplicate: boolean): Promise<void>;
export declare function stopReleaseTask(meetingId: string, taskId: string): Promise<void>;
export declare const claimReleaseTask: (meetingId: string, taskId: string, actor: string) => Promise<ReleaseTask>;
export declare const submitReleaseResult: (meetingId: string, taskId: string, actor: string, result: string) => Promise<ReleaseTask>;
export declare const failReleaseTask: (meetingId: string, taskId: string, actor: string, error: string) => Promise<ReleaseTask>;
/** Pausing never cancels an original session. Already delivered work may still report. */
export declare function setReleasePaused(meetingId: string, paused: boolean): Promise<void>;
export declare function listPublishCandidates(ctx: Context, meetingId: string, sessionId: string, before?: number): Promise<{
    items: PublishCandidate[];
    nextBefore?: number;
}>;
export declare function publishSelectedReply(ctx: Context, meetingId: string, input: {
    sessionId: string;
    seq: number;
    digest: string;
    requestId: string;
    confirmed: boolean;
    taskId?: string;
    excerpt?: string;
    note?: string;
}): Promise<Meeting>;
