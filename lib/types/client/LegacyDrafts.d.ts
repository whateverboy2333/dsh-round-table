import { type RecoveryEntry, type RecoveryMeeting } from './legacy-draft-model.ts';
export declare function LegacyDrafts({ onImported, meetings: provided, requestOpen }: {
    home: string;
    profile: string;
    onImported: (entry?: RecoveryEntry) => void;
    meetings?: RecoveryMeeting[];
    requestOpen?: number;
}): React.ReactNode;
