export type TaskStatus = 'pending' | 'delivered' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export interface MeetingTask {
    taskId: string;
    meetingId: string;
    toSessionId: string;
    title: string;
    prompt: string;
    status: TaskStatus;
    attemptId: string;
    result?: string;
    error?: string;
    createdAt: number;
    updatedAt: number;
}
export declare function getTask(root: string, meetingId: string, taskId: string): Promise<MeetingTask | undefined>;
declare function createTaskInternal(meetingId: string, toSessionId: string, title: string, prompt: string): Promise<MeetingTask>;
declare function transitionTaskInternal(meetingId: string, taskId: string, next: TaskStatus, options?: {
    result?: string;
    error?: string;
    expectedAttemptId?: string;
}): Promise<MeetingTask>;
export declare function createTask(...args: Parameters<typeof createTaskInternal>): Promise<MeetingTask>;
export declare function transitionTask(...args: Parameters<typeof transitionTaskInternal>): Promise<MeetingTask>;
export {};
