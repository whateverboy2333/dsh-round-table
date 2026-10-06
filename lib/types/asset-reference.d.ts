/** Pure, bounded model input. A stored file reference is never parsed binary content. */
export interface AssetInputSource {
    id: string;
    name: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    version: number;
    createdAt: number;
    text?: string;
    image?: unknown;
    referenceOnly?: boolean;
    contentKind?: 'file';
    hasImage?: boolean;
}
export interface AssetInputMeeting {
    meetingFolder?: {
        path: string;
        files: {
            id: string;
            fileId: string;
            kind: string;
            version: number;
            sha256: string;
            relativePath: string;
        }[];
    };
}
export declare const isReferenceAsset: (asset: AssetInputSource) => boolean;
export declare const assetImageRef: (asset: AssetInputSource) => unknown;
export declare function assetReferenceMetadata(asset: AssetInputSource, meeting?: AssetInputMeeting): {
    referenceOnly: boolean;
    parsed: boolean;
    fileId?: string | undefined;
    relativePath?: string | undefined;
    approvedPath?: string | undefined;
    id: string;
    name: string;
    bytes: number;
    mimeType: string;
    version: number;
    sha256: string;
};
export declare function assetInputText(asset: AssetInputSource, meeting?: AssetInputMeeting, imageIncluded?: boolean): string;
export declare const AssetInputText: typeof assetInputText;
/** Secretary/workflow copies omit image handles and opaque text/binary caches. */
export declare function assetModelSnapshot(asset: AssetInputSource, meeting?: AssetInputMeeting): {
    inputText: string;
    parsed: boolean;
    fileId?: string | undefined;
    relativePath?: string | undefined;
    approvedPath?: string | undefined;
    hasImage?: boolean | undefined;
    referenceOnly: boolean;
    contentKind?: "file" | undefined;
    id: string;
    name: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    version: number;
    createdAt: number;
} | {
    inputText: string;
    parsed: boolean;
    fileId?: string | undefined;
    relativePath?: string | undefined;
    approvedPath?: string | undefined;
    hasImage?: boolean | undefined;
    text: string;
    contentKind?: "file" | undefined;
    id: string;
    name: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    version: number;
    createdAt: number;
} | {
    inputText: string;
    parsed: boolean;
    fileId?: string | undefined;
    relativePath?: string | undefined;
    approvedPath?: string | undefined;
    hasImage?: boolean | undefined;
    contentKind?: "file" | undefined;
    id: string;
    name: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    version: number;
    createdAt: number;
};
/** Strip any accidental opaque caches before secretary JSON or model budgeting. */
export declare function sanitizeAssetReferences(value: unknown): unknown;
