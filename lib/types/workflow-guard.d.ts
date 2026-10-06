import type { Meeting } from './meetings.ts';
import type { ReleaseTask } from './meeting-flow-types.ts';
export declare function workflowTaskAllowed(m: Meeting, t: ReleaseTask, delivery: boolean): boolean;
/** Called in the same meeting transaction as a retry. A known receipt never spends again. */
export declare function reserveWorkflowRetry(m: Meeting, t: ReleaseTask): void;
