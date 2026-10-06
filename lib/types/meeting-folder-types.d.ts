/** Approved shared files are bound to the meeting ledger, never inferred from filenames. */
export type MeetingFileKind = 'asset' | 'task' | 'result' | 'minutes';
export interface MeetingFileRef {
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
    contentKind?: 'file';
    referenceOnly?: boolean;
}
export interface MeetingFolder {
    schemaVersion: 1;
    meetingId: string;
    workspaceId: string;
    workspacePath: string;
    path: string;
    createdAt: number;
    instructionsSha256: string;
    files: MeetingFileRef[];
    instructionsVersion?: number;
    instructionsRelativePath?: string;
    initialInstructionsSha256?: string;
    instructionsHistory?: {
        version: number;
        relativePath: string;
        sha256: string;
    }[];
}
export declare function isMeetingFileRef(x: unknown): x is MeetingFileRef;
export declare function isMeetingFolder(x: unknown): x is MeetingFolder;
