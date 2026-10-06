import type { ReleaseTask } from '../meeting-flow-types.ts';
/** Shared by discussion, task and workflow. Opening/editing/previewing never sends. */
export declare function RevisionPanel({ meetingId, task, memberName, onChanged, onClose }: {
    meetingId: string;
    task: ReleaseTask;
    memberName: string;
    onChanged: () => Promise<void>;
    onClose: () => void;
}): React.ReactNode;
