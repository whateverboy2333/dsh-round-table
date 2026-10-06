import type { WorkflowRun, WorkflowActivation } from './workflow-types.ts';
/** Shared, read-only slot math for the runtime and the chat target selector. */
export declare function latestActivation(run: WorkflowRun, slotKey: string): WorkflowActivation | undefined;
export declare function workflowSlot(run: WorkflowRun, nodeId: string, forceRound?: number): {
    loopId?: string | undefined;
    slotKey: string;
    round: number;
};
export declare function queuedWorkflowSlot(run: WorkflowRun, nodeId: string): {
    loopId?: string | undefined;
    slotKey: string;
    round: number;
} | undefined;
