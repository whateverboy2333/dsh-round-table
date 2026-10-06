import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
import { type MeetingFolder, type MeetingFileRef, type MeetingFileKind } from './meeting-folder-types.ts';
export type { MeetingFolder, MeetingFileRef, MeetingFileKind } from './meeting-folder-types.ts';
type FolderMeeting = Meeting & {
    meetingFolder?: MeetingFolder;
};
export interface MeetingDocumentInput {
    id: string;
    kind: MeetingFileKind;
    version: number;
    name: string;
    text?: string;
    bytes?: Uint8Array;
    fromPath?: string;
    mimeType?: string;
    metadata?: Record<string, string | number | boolean | null>;
    contentKind?: 'file';
    referenceOnly?: boolean;
}
/** Filesystem only. Safe to call inside the caller's existing meeting mutation; no nested lock. */
export declare function prepareMeetingFolder(ctx: Context, m: FolderMeeting): Promise<MeetingFolder>;
/** Explicit management changes create a new immutable instruction version; no nested meeting lock. */
export declare function syncMeetingFolderInstructions(m: FolderMeeting): Promise<FolderMeeting>;
/** Call outside a mutation. Existing meetings must explicitly opt in; this never executes/imports history. */
export declare function ensureMeetingFolder(ctx: Context, meetingId: string): Promise<MeetingFolder>;
export declare function attachMeetingDocument(m: FolderMeeting, ref: MeetingFileRef): FolderMeeting;
/** A presentation index is regenerated from the ledger; it is never an authority to approve files. */
export declare function syncMeetingFolderIndex(m: FolderMeeting): Promise<void>;
/** Meeting argument: filesystem-only; caller must attach the returned ref in its existing lock.
 * ID argument: outside-lock convenience, commits approval ledger after the file is durably written.
 */
export declare function writeMeetingDocument(value: FolderMeeting | string, input: MeetingDocumentInput): Promise<MeetingFileRef>;
export declare function readMeetingDocument(value: FolderMeeting | string, fileId: string, options?: {
    metadataOnly?: boolean;
}): Promise<{
    ref: MeetingFileRef;
    referenceOnly: true;
    bytes: undefined;
    text: undefined;
} | {
    text?: string | undefined;
    ref: MeetingFileRef;
    referenceOnly: false;
    bytes: Buffer<ArrayBufferLike>;
}>;
/** Host-only download uses an already-open verified fd; no arbitrary model path is accepted. */
export declare function openMeetingDocumentDownload(value: FolderMeeting | string, fileId: string): Promise<{
    ref: MeetingFileRef;
    stream: import("fs").ReadStream;
}>;
export declare function readMeetingInstructions(value: FolderMeeting | string): Promise<{
    path: string;
    version: number;
    sha256: string;
    text: string;
}>;
export declare function meetingFolderSnapshot(value: FolderMeeting | string): Promise<{
    meetingId: string;
    title: string;
    path: string;
    instructionsPath: string;
    instructionsVersion: number;
    instructionsText: string | undefined;
    indexPath: string;
    members: {
        sessionId: string;
        name: string;
        role: string;
    }[];
    integrity: "ok" | "invalid";
    errors: string[];
    files: ({
        text?: string | undefined;
        status: "ok";
        fileId: string;
        id: string;
        kind: MeetingFileKind;
        version: number;
        name: string;
        relativePath: string;
        sha256: string;
        size: number;
        createdAt: number;
        mimeType?: string;
        metadata?: Record<string, string | number | boolean | null>;
        contentKind?: "file";
        referenceOnly?: boolean;
    } | {
        status: "missing" | "invalid";
        error: string;
        fileId: string;
        id: string;
        kind: MeetingFileKind;
        version: number;
        name: string;
        relativePath: string;
        sha256: string;
        size: number;
        createdAt: number;
        mimeType?: string;
        metadata?: Record<string, string | number | boolean | null>;
        contentKind?: "file";
        referenceOnly?: boolean;
    })[];
}>;
export declare function markMeetingFolderDeleted(m: FolderMeeting): Promise<void>;
export declare function registerMeetingFolderTools(ctx: Context): void;
