import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
/** Remove only our orphaned cache rows; never creates storage or deletes a live log. */
export declare function purgeOrphanSecretaryCache(ctx: Context, root: string): Promise<number>;
export declare function disposeSecretaryHandles(): Promise<void>;
export declare function attachSecretaryLifecycle(ctx: Pick<Context, 'effect'> & Partial<Pick<Context, 'on'>>): void;
declare function createSecretaryInternal(ctx: Context, root: string, meeting: Meeting, workspace: {
    workspaceId: string;
    path: string;
}): Promise<Meeting>;
export declare function createSecretary(...args: Parameters<typeof createSecretaryInternal>): Promise<Meeting>;
/** User-confirmed meeting ownership is required; never select sessions by display name. */
export declare function destroyMeetingSecretary(ctx: Context, meeting: Meeting): Promise<void>;
export declare function syncSecretaryTitle(ctx: Context, root: string, meeting: Meeting): Promise<void>;
export {};
