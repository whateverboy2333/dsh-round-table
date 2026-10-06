export declare const activityKey: (root: string, id: string) => string;
export declare function isMeetingClosing(root: string, id: string): boolean;
export declare function closeMeetingAdmission(root: string, id: string): void;
export declare function drainMeeting(root: string, id: string): Promise<void>;
export declare function withMeetingActivity<T>(root: string, id: string, fn: () => Promise<T>): Promise<T>;
