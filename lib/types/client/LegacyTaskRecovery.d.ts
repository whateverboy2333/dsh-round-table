/** Only a previously authorized frozen request may use the removed manual path. */
export declare function LegacyTaskRecovery({ meetingId, onChanged, readOnly }: {
    meetingId: string;
    onChanged: () => Promise<void>;
    readOnly?: boolean;
}): import("react").JSX.Element | null;
