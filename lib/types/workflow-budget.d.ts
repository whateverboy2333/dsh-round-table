import type { WorkflowRun } from './workflow-types.ts';
/** Grants extend only cumulative starts. Per-member per-round retry limits stay intact. */
export declare function workflowBudget(run: WorkflowRun): {
    workAttempts: number;
    minutesStarts: number;
};
