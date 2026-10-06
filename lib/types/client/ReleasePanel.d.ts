import type { MeetingMessage, ReleaseDraft, MeetingAsset } from '../meeting-flow-types.ts';
import type { WorkflowState } from '../workflow-types.ts';
import type { TaskCardMeetingFields } from '../task-card-types.ts';
export interface MemberStatus {
    connected: boolean;
    running: boolean;
    pending: boolean;
    blockers: {
        meetingId: string;
        title: string;
        taskId: string;
        instruction: string;
    }[];
    availability?: {
        state: string;
        reason?: string;
        workspaceId?: string;
        cwd?: string;
    };
}
interface Props extends TaskCardMeetingFields {
    meetingId: string;
    messages?: MeetingMessage[];
    releases?: ReleaseDraft[];
    paused?: boolean;
    archived?: boolean;
    members: {
        id: string;
        name: string;
    }[];
    workflow?: WorkflowState;
    names?: Record<string, string>;
    memberStatus?: Record<string, MemberStatus>;
    assets?: MeetingAsset[];
    templates?: {
        id: string;
        title: string;
        instruction: string;
        recipientIds: string[];
    }[];
    view?: string;
    focusTask?: {
        id: string;
        nonce: number;
    };
    onChanged: () => Promise<void>;
    onViewChange?: (v: string) => void;
    onOpenSession?: (id: string) => void;
    onJumpMeeting?: (id: string) => void;
    discussions?: import('../discussion-types.ts').DiscussionRecord[];
    taskModal?: boolean;
    onCloseTask?: () => void;
    onOpenMember?: (id?: string, taskId?: string) => void;
}
export declare function ReleasePanel({ meetingId, messages, releases, paused, archived, members, workflow, names, memberStatus, assets, view, focusTask, onChanged, onViewChange, onOpenSession, onJumpMeeting, discussions, taskModal, onCloseTask, onOpenMember, taskCards, taskCardGenerations, cardPublications }: Props): import("react").JSX.Element;
export {};
