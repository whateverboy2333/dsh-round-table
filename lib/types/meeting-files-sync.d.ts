import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
import type { MeetingAsset, ResultSource } from './meeting-flow-types.ts';
import type { MinutesRecord } from './minutes-types.ts';
/** All sync helpers are filesystem-only and safe inside one caller-owned meeting mutation. */
export declare function syncMeetingAssetDocument(m: Meeting, asset: MeetingAsset, bytes: Uint8Array): Promise<Meeting>;
/** Stream-only archive copy; the incoming path is service-generated under DSH_HOME, never an HTTP path. */
export declare function syncMeetingAssetFile(m: Meeting, asset: MeetingAsset, path: string): Promise<Meeting>;
/** Backfill only ledger-approved assets, never discover or approve workspace files. No nested meeting lock. */
export declare function syncApprovedMeetingAssets(current: Meeting): Promise<Meeting>;
export interface MeetingResultDocument {
    taskId: string;
    title: string;
    text: string;
    sessionId: string;
    source?: ResultSource;
    attemptId?: string;
    historicalImport?: boolean;
}
export declare function syncMeetingResultDocument(m: Meeting, result: MeetingResultDocument): Promise<Meeting>;
export declare function syncMeetingMinutesDocument(m: Meeting, record: MinutesRecord): Promise<Meeting>;
/** Verified filesystem evidence injected into a tool-disabled secretary. It never grants write access. */
export declare function approvedMeetingFileSources(m: Meeting, cutoff?: number, selection?: {
    assetIds?: string[];
    taskIds?: string[];
}): Promise<{
    path: string;
    instructionsPath: string;
    instructionsText: string | undefined;
    readRule: string;
    files: ({
        text: string;
        fileId: string;
        id: string;
        kind: import("./meeting-folder-types.ts").MeetingFileKind;
        version: number;
        name: string;
        relativePath: string;
        sha256: string;
        mimeType: string | undefined;
        metadata: Record<string, string | number | boolean | null> | undefined;
        referenceOnly: boolean | undefined;
        contentKind: "file" | undefined;
    } | {
        evidence: string;
        fileId: string;
        id: string;
        kind: import("./meeting-folder-types.ts").MeetingFileKind;
        version: number;
        name: string;
        relativePath: string;
        sha256: string;
        mimeType: string | undefined;
        metadata: Record<string, string | number | boolean | null> | undefined;
        referenceOnly: boolean | undefined;
        contentKind: "file" | undefined;
    })[];
} | undefined>;
/** Explicit old-meeting adoption; filesystem copies preserve existing history and never publish/execute. */
export declare function connectExistingMeetingFiles(ctx: Context, meetingId: string, confirmed: boolean): Promise<Meeting>;
/** Calling UI/CLI must have obtained explicit confirmation before invoking this adapter. */
export declare const connectMeetingFolder: (ctx: Context, meetingId: string) => Promise<Meeting>;
/** Precise existing reference read, used by routing or generation input without arbitrary paths. */
export declare function readApprovedMeetingAsset(m: Meeting, assetId: string): Promise<{
    ref: import("./meeting-folder-types.ts").MeetingFileRef;
    referenceOnly: true;
    bytes: undefined;
    text: undefined;
} | {
    text?: string | undefined;
    ref: import("./meeting-folder-types.ts").MeetingFileRef;
    referenceOnly: false;
    bytes: Buffer<ArrayBufferLike>;
}>;
