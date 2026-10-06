import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
import type { MeetingAsset } from './meeting-flow-types.ts';
export declare const unfinished: (status: string) => boolean;
export declare function activityTime(m: Meeting): number;
export declare function taskCounts(m: Meeting): {
    pending: number;
    attention: number;
    completed: number;
    awaitingReview: number;
    faults: number;
    running: number;
};
export declare function liveStatus(ctx: Context, m: Meeting, all: Meeting[]): {
    [k: string]: {
        connected: boolean;
        running: boolean;
        pending: boolean;
        blockers: {
            meetingId: string;
            title: string;
            taskId: string;
            instruction: string;
        }[];
    };
};
/** Async authority enriches the legacy live projection without restoring or waking any member. */
export declare function liveStatusAsync(ctx: Context, m: Meeting, all: Meeting[]): Promise<any>;
export declare function manageMeeting(meetingId: string, action: string, body: Record<string, unknown>): Promise<Meeting>;
export declare function addMeetingAsset(ctx: Context, meetingId: string, body: Record<string, unknown>): Promise<MeetingAsset>;
export declare function readMeetingAsset(meetingId: string, id: string): Promise<{
    data: string;
    id: string;
    name: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    version: number;
    createdAt: number;
    text?: string;
    image?: unknown;
    contentKind?: "file";
    referenceOnly?: boolean;
    fileReference?: {
        fileId: string;
        relativePath: string;
        folderPath?: string;
    };
    storageLocation?: "meeting-folder" | "internal-assets";
    contentNote?: string;
} | {
    referenceOnly: boolean;
    contentNote: string;
    id: string;
    name: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    version: number;
    createdAt: number;
    text?: string;
    image?: unknown;
    contentKind?: "file";
    fileReference?: {
        fileId: string;
        relativePath: string;
        folderPath?: string;
    };
    storageLocation?: "meeting-folder" | "internal-assets";
}>;
/** Narrow recovery for an unsupported image submitted by this plugin; preserves immutable audit history. */
export declare function repairUnsupportedImage(ctx: Context, meetingId: string, taskId: string, confirmed: boolean): Promise<{
    replacedSeq: import("@deepseek-ai/dsh-session").SessionSeq;
    replacementSeq: number;
}>;
export declare function exportMeeting(m: Meeting): string;
