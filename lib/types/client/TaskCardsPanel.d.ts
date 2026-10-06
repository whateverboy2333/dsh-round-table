import type { TaskCard, TaskCardGeneration, CardPublication } from '../task-card-types.ts';
import type { DiscussionRecord } from '../discussion-types.ts';
interface Props {
    meetingId: string;
    open: boolean;
    readOnly?: boolean;
    onClose: () => void;
    cards?: TaskCard[];
    generations?: TaskCardGeneration[];
    publications?: CardPublication[];
    discussions?: DiscussionRecord[];
    members: {
        id: string;
        name: string;
    }[];
    onChanged: () => Promise<void>;
    onOpenMember?: (id: string) => void;
}
/** The key fences late responses and drafts when switching meetings or DSH homes. */
export declare function TaskCardsPanel(props: Props): import("react").JSX.Element | null;
export declare function TaskCardsDialog({ meetingId, readOnly, onClose, cards, generations, publications, discussions, members, onChanged, onOpenMember }: Props): import("react").JSX.Element;
export {};
