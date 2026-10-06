import { type MeetingListItem } from './meeting-list-state.ts';
export declare function MeetingList({ meetings, onCreate, onOpen, onChanged }: {
    meetings: MeetingListItem[] | undefined;
    onCreate: () => void;
    onOpen: (id: string) => void;
    onChanged: () => Promise<void>;
}): React.ReactNode;
