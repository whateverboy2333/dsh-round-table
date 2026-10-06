/** Automatic admission uses frozen graph state, never conversational intent. */
import type { Context } from '@deepseek-ai/cordis';
export declare function pumpAutomaticWorkflows(ctx: Context): Promise<void>;
export declare function attachAutomaticWorkflowLifecycle(ctx: Context): void;
export declare function extendAutomaticRounds(meetingId: string, input: {
    runId: string;
    loopId: string;
    maxRounds: number;
    expected: number;
    confirmed: boolean;
}): Promise<void>;
