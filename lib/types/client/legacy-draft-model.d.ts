export interface RecoveryMeeting {
    meetingId: string;
    title: string;
    memberNames?: Record<string, string>;
}
export interface RecoveryEntry {
    id: string;
    kind: 'meeting' | 'message' | 'task' | 'workflow' | 'revision' | 'pending';
    meetingId?: string;
    meetingTitle: string;
    label: string;
    text: string;
    recipientNames: string[];
    values: {
        key: string;
        value: unknown;
    }[];
    pending: boolean;
    outcome?: 'unknown' | 'completed' | 'rejected';
    knownMeeting: boolean;
    recoveryBlocked?: string;
}
type Store = Pick<Storage, 'length' | 'key' | 'getItem'>;
export declare function recoveryContent(value: unknown): string;
export declare function collectLegacyDrafts(storage: Store, meetings: RecoveryMeeting[]): RecoveryEntry[];
export {};
