import { type Meeting } from './meetings.ts';
import { type WorkflowActivation, type WorkflowRun } from './workflow-types.ts';
export interface TemporaryInput {
    title: string;
    instruction: string;
    messageIds: string[];
    assetIds: string[];
    recipientIds: string[];
}
export declare function previewTemporary(m: Meeting, r: WorkflowRun, input: TemporaryInput): {
    fingerprint: string;
    characters: number;
    inputs: import("./meeting-flow-types.ts").MeetingMessage[] | undefined;
    assetIds: string[] | undefined;
    recipientIds: string[];
};
export declare function startTemporary(meetingId: string, runId: string, input: TemporaryInput, fingerprint: string, requestId: string): Promise<WorkflowActivation>;
/** Caller holds the meeting lock; permits an atomic chat receipt alongside the activation. */
export declare function startTemporaryInMeeting(m: Meeting, runId: string, input: TemporaryInput, fingerprint: string, requestId: string): WorkflowActivation;
