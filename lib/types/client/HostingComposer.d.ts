import type { WorkflowRun } from '../workflow-types.ts';
import type { MeetingAsset, MeetingMessage } from '../meeting-flow-types.ts';
import { type ChatDraft } from './chat-draft.ts';
type Member = {
    id: string;
    name: string;
};
interface Props {
    meetingId: string;
    run?: WorkflowRun;
    members: Member[];
    messages: MeetingMessage[];
    assets: MeetingAsset[];
    paused?: boolean;
    archived?: boolean;
    prepared?: {
        messageIds: string[];
        nonce: number;
        contextTaskId?: string;
        recipientIds?: string[];
        purpose?: 'task-card';
    };
    onPrepared?: () => void;
    onCreateTask?: (draft: ChatDraft) => void;
    onChanged: () => Promise<void>;
    onNavigate?: (page: string) => void;
    memberStatus?: Record<string, {
        connected: boolean;
        running: boolean;
        availability?: {
            state: string;
        };
    }>;
    draftRunIds?: string[];
}
export declare function HostingComposer({ meetingId, run, members, messages, assets, paused, archived, prepared, onPrepared, onChanged, onNavigate, onCreateTask, memberStatus, draftRunIds }: Props): React.ReactNode;
export {};
