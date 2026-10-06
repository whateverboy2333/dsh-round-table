import type { MeetingAsset } from '../meeting-flow-types.ts';
import type { MeetingFolder } from '../meeting-folder-types.ts';
export declare function ResourcesPanel({ meetingId, assets, templates, folder, folderError, archived, onChanged }: {
    meetingId: string;
    assets?: MeetingAsset[];
    templates?: {
        id: string;
        title: string;
    }[];
    folder?: MeetingFolder;
    folderError?: string;
    archived?: boolean;
    onChanged: () => Promise<void>;
}): React.ReactNode;
