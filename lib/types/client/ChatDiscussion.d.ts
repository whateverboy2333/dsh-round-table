import type { MeetingMessage, ReleaseDraft, ReleaseTask, MeetingAsset } from '../meeting-flow-types.ts';
import type { WorkflowRun } from '../workflow-types.ts';
import type { MemberStatus } from './ReleasePanel.tsx';
interface Props {
    discussions?: import('../discussion-types.ts').DiscussionRecord[];
    onOpenMember?: (id?: string, taskId?: string) => void;
    onCreateTask?: (draft: import('./chat-draft.ts').ChatDraft) => void;
    meetingId: string;
    messages: MeetingMessage[];
    releases: ReleaseDraft[];
    members: {
        id: string;
        name: string;
    }[];
    assets: MeetingAsset[];
    names: Record<string, string>;
    memberStatus: Record<string, MemberStatus>;
    run?: WorkflowRun;
    paused: boolean;
    archived: boolean;
    onChanged: () => Promise<void>;
    onNavigate?: (page: string) => void;
    onOpenSession?: (id: string) => void;
    onPrepareTask: (message: MeetingMessage) => void;
    onSupplement: (task: ReleaseTask) => void;
    onPublish: () => void;
    draftRunIds?: string[];
}
export declare function ChatDiscussion({ meetingId, messages, releases, members, assets, names, memberStatus, run, paused, archived, onChanged, onNavigate, onOpenSession, onPrepareTask, onSupplement, onPublish, draftRunIds, discussions, onOpenMember, onCreateTask }: Props): React.ReactNode;
export {};
