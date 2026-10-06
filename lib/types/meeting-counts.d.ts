import type { ReleaseDraft } from './meeting-flow-types.ts';
/** Projection only: reviewing history is distinct from an execution failure. */
export declare function meetingTaskCounts(m: {
    releases?: ReleaseDraft[];
}): {
    pending: number;
    attention: number;
    completed: number;
    awaitingReview: number;
    faults: number;
    running: number;
};
