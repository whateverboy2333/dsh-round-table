/** User-side route adapter only; ordinary Agent tools cannot start or route workflows. */
import type { Context } from '@deepseek-ai/cordis';
export declare function workflowAction(ctx: Context, meetingId: string, action: string, body: Record<string, unknown>): Promise<unknown>;
