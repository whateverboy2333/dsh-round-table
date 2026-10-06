import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
/** Explicit join authorization, serialized per meeting; no model or private-history export. */
export declare function ensureMemberBriefing(ctx: Context, mid: string, sid: string, role: string): Promise<Meeting>;
