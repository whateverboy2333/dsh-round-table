import type { ReleaseDraft } from '../meeting-flow-types.ts';
export declare function PublishPanel({ meetingId, members, releases, onChanged, initialTarget, open: controlledOpen, onClose }: {
    meetingId: string;
    members: {
        id: string;
        name: string;
    }[];
    releases: ReleaseDraft[];
    onChanged: () => Promise<void>;
    initialTarget?: {
        taskId: string;
        sessionId: string;
    };
    open?: boolean;
    onClose?: () => void;
}): React.ReactNode;
