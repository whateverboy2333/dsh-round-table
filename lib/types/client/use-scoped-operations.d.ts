/** An async operation keeps its original owner through waits and component disposal. */
export declare function useScopedOperations(): {
    meetingCall: (id: string, action: string, body?: unknown) => Promise<any>;
    isCurrent: () => boolean;
};
