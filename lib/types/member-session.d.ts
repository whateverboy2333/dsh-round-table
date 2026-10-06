import type { Context } from '@deepseek-ai/cordis';
export { inspectMember, memberForExecution, memberIsArchived, memberIsRestoring } from './member-session-state.ts';
export type { MemberInspection, MemberAvailability } from './member-session-state.ts';
/** User-authorized join only: restore the same existing session through the host's complete composition. */
export declare function memberForBriefing(ctx: Context, id: string): Promise<import("@deepseek-ai/dsh-agent").Agent>;
