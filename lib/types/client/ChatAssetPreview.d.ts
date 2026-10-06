import type { MeetingAsset } from '../meeting-flow-types.ts';
export declare function ChatAssetPreview({ meetingId, assets, assetIds, onRemove, disabled, compact }: {
    meetingId: string;
    assets: MeetingAsset[];
    assetIds: string[];
    onRemove?: (id: string) => void;
    disabled?: boolean;
    compact?: boolean;
}): React.ReactNode;
