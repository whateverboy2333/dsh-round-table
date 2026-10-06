import type { ReleaseDraft, ReleaseTask } from './meeting-flow-types.ts';
type MeetingTasks = {
    releases?: ReleaseDraft[];
};
export declare function revisionChild(m: MeetingTasks, t: ReleaseTask): ReleaseDraft | undefined;
export declare function effectiveTask(m: MeetingTasks, t: ReleaseTask, seen?: Set<string>): ReleaseTask;
export declare const effectiveReleaseTasks: (m: MeetingTasks, r: ReleaseDraft) => ReleaseTask[];
export declare function taskNeedsAttention(m: MeetingTasks, t: ReleaseTask): boolean;
export declare function taskNeedsAction(m: MeetingTasks, t: ReleaseTask): boolean;
export declare function reviewState(m: MeetingTasks, t: ReleaseTask): string;
export declare function resultIsUsable(t: ReleaseTask, requireReview?: boolean): boolean;
export {};
