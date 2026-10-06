import type { MeetingFolder } from '../meeting-folder-types.ts';
export declare function MeetingFolderPanel({ meetingId, folder, folderError, archived, onChanged }: {
    meetingId: string;
    folder?: MeetingFolder;
    folderError?: string;
    archived: boolean;
    onChanged: () => Promise<void>;
}): import("react").JSX.Element;
