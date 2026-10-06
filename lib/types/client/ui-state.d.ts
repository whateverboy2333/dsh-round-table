export type LocalPersistence = {
    available: boolean;
    reason?: string;
};
/** Opaque stable home/profile ID supplied by this plugin's authenticated host route. */
export declare function configureLocalScope(scope: string | undefined): void;
export declare const localScopeId: () => string | undefined;
export declare const localPersistenceSnapshot: () => LocalPersistence;
export declare function useLocalPersistence(): LocalPersistence;
export declare function readLocal<T>(key: string, fallback: T, expectedScope?: string | undefined): T;
export declare function writeLocal(key: string, value: unknown, expectedScope?: string | undefined): boolean;
export declare function meetingCall(meetingId: string, action: string, body?: unknown, expectedScope?: string | undefined): Promise<any>;
/** Late completions belong to their mounting instance and must never write a newer one. */
export declare function scopedLocal(scope: string | undefined): {
    readLocal: <T>(key: string, fallback: T) => T;
    writeLocal: (key: string, value: unknown) => boolean;
    meetingCall: (id: string, action: string, body?: unknown) => Promise<any>;
};
export declare function downloadText(name: string, text: string, type?: string): void;
export declare const uiButton: React.CSSProperties;
export declare const uiInput: React.CSSProperties;
