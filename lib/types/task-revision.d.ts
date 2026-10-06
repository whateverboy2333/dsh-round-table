import { type Meeting } from './meetings.ts';
/** Only pre-commit validation uses this error; storage/transport failures remain uncertain. */
export declare class RevisionStartRejected extends Error {
    readonly requestState = "rejected";
    constructor(message: string);
}
export declare function previewTaskRevision(m: Meeting, taskId: string, note: string): {
    taskId: string;
    recipientId: string;
    title: string;
    instruction: string;
    messageIds: string[];
    assetIds: string[];
    originalResult: string;
    note: string;
    fingerprint: string;
    ready: boolean;
    missing: string[];
};
export declare function startTaskRevision(meetingId: string, input: {
    taskId: string;
    note: string;
    fingerprint: string;
    requestId: string;
    confirmed: boolean;
}): Promise<undefined>;
