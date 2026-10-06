import { type WorkflowState } from './workflow-types.ts';
import type { ReleaseDraft } from './meeting-flow-types.ts';
import type { MinutesRecord, MinutesJob } from './minutes-types.ts';
export declare function isWorkflowState(value: unknown): value is WorkflowState;
export declare function workflowSupported(m: {
    workflow?: WorkflowState;
}): boolean;
/** Validate both directions so a lost task binding cannot bypass workflow admission. */
export declare function isWorkflowMeetingLinks(m: {
    workflow?: WorkflowState;
    releases?: ReleaseDraft[];
    minutes?: MinutesRecord[];
    minutesJob?: MinutesJob;
}): boolean;
export declare function assertWorkflowWritable(m: {
    workflow?: WorkflowState;
}): void;
