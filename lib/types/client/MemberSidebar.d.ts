import { type MemberLogMeeting } from './member-work-log.ts';
export interface SidebarMember {
    id: string;
    name: string;
    statusLabel?: string;
    workspaceLabel?: string;
    connected?: boolean;
    running?: boolean;
    historical?: boolean;
}
export interface MemberSidebarProps {
    open: boolean;
    meeting: MemberLogMeeting;
    members: SidebarMember[];
    selectedMemberId?: string | null;
    onSelectMember?: (id: string | null) => void;
    onClose: () => void;
    onNavigateTask?: (taskId: string) => void;
    focusTaskId?: string;
    renderManagement?: () => React.ReactNode;
    renderMemberDetails?: (memberId: string) => React.ReactNode;
    renderTaskActions?: (memberId: string) => React.ReactNode;
}
/** Local side-panel navigation does not navigate or replace the mounted discussion. */
export declare function MemberSidebar({ open, meeting, members, selectedMemberId, onSelectMember, onClose, onNavigateTask, focusTaskId, renderManagement, renderMemberDetails, renderTaskActions }: MemberSidebarProps): React.ReactNode;
