import type { MeetingAsset, MeetingMessage } from '../meeting-flow-types.ts';
export interface MaterialSelection {
    messageIds: string[];
    assetIds: string[];
}
export declare const materialAssetIds: (messages: MeetingMessage[], value: MaterialSelection) => string[];
/** Transactional selection: only Confirm changes the caller's draft. No delivery or private history reads. */
export declare function MaterialPicker({ messages, assets, value, names, onApply, onCancel }: {
    messages: MeetingMessage[];
    assets: MeetingAsset[];
    value: MaterialSelection;
    names?: Record<string, string>;
    onApply: (v: MaterialSelection) => void;
    onCancel: () => void;
}): React.ReactNode;
