/** Small list projection; never imports host modules or infers an Agent's state. */
export interface MeetingListItem {
    meetingId: string;
    title: string;
    description?: string;
    createdAt: number;
    lastActivity?: number;
    memberSessionIds: string[];
    pinnedAt?: number;
    archivedAt?: number;
    releasePaused?: boolean;
    deletion?: {
        error?: string;
    };
    listReadOnly?: boolean;
    workflowStatus?: 'active' | 'paused' | 'completed' | 'stopped';
    counts?: {
        pending: number;
        attention: number;
        completed: number;
        awaitingReview?: number;
        faults?: number;
        running?: number;
    };
    secretary?: {
        status: 'ready' | 'initializing' | 'failed';
    };
}
export declare function sortedMeetings<T extends MeetingListItem>(meetings: readonly T[], query: string, archived: boolean): T[];
export declare function meetingListStatus(m: MeetingListItem): {
    label: string;
    tone: 'neutral' | 'warning' | 'active' | 'done' | 'review';
};
export declare function matchesMeetingState(m: MeetingListItem, type: string): boolean;
