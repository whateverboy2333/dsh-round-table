import type { ReleaseDraft } from '../meeting-flow-types.ts';
import type { DiscussionRecord } from '../discussion-types.ts';
/** Execution controls belong to the selected member's meeting work log. */
export declare function MemberTaskActions({ meetingId, memberId, memberName, releases, discussions, onChanged, focusTaskId }: {
    meetingId: string;
    memberId: string;
    memberName: string;
    releases: ReleaseDraft[];
    discussions?: DiscussionRecord[];
    onChanged: () => Promise<void>;
    focusTaskId?: string;
}): React.ReactNode;
