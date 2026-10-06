import type { Context } from '@deepseek-ai/cordis';
export type MemberAvailability = 'ready' | 'busy' | 'unloaded' | 'archived' | 'deleted' | 'unknown' | 'restoring' | 'restore_failed';
export interface MemberInspection {
    state: MemberAvailability;
    reason?: string;
    workspaceId?: string;
    cwd?: string;
}
interface OriginalHeader {
    id: string;
    createdAt: number;
    cwd?: string;
    parentSession?: string;
    isSeeded?: boolean;
    delegationDepth?: number;
    origin?: string;
}
interface Workspace {
    id: string;
    path: string;
    sessionIds: readonly string[];
    status(): Promise<string>;
}
export interface MemberEvidence {
    inspection: MemberInspection;
    header?: OriginalHeader;
    preset?: string;
    workspace?: Workspace;
}
export declare function memberIsArchived(ctx: Context, id: string): boolean;
export declare function memberIsRestoring(ctx: Context, id: string): boolean;
/** Exact SDK observation; browsing this function never loads or wakes an Agent. */
export declare function memberEvidence(ctx: Context, id: string, includeTransient?: boolean): Promise<MemberEvidence>;
export declare function inspectMember(ctx: Context, id: string): Promise<MemberInspection>;
/** Only call after the user has authorized execution or joining. Never substitutes a new session. */
export declare function memberForExecution(ctx: Context, id: string): Promise<import("@deepseek-ai/dsh-agent").Agent>;
export {};
