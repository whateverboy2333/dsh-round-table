import type { WorkflowState, WorkflowNodeView } from '../workflow-types.ts';
import type { MeetingMessage, MeetingAsset, ReleaseDraft } from '../meeting-flow-types.ts';
interface WorkflowMeeting {
    meetingId: string;
    workflow?: WorkflowState;
    workflowViews?: WorkflowNodeView[];
    messages?: MeetingMessage[];
    assets?: MeetingAsset[];
    releases?: ReleaseDraft[];
    releasePaused?: boolean;
    archivedAt?: number;
}
export declare function WorkflowPanel({ meeting, members, onChanged, onOpenSession, onNavigate }: {
    onNavigate?: (page: string) => void;
    meeting: WorkflowMeeting;
    members: {
        id: string;
        name: string;
    }[];
    onChanged: () => Promise<void>;
    onOpenSession: (id: string) => void;
}): React.ReactNode;
export {};
