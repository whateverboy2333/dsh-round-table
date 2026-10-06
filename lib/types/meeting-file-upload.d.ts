import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
import type { MeetingAsset } from './meeting-flow-types.ts';
import { openOwnedFile } from './meeting-file-io.ts';
export declare const MAX_FILE_BYTES: number;
export declare const FILE_CHUNK_BYTES: number;
export declare class FileUploadRejected extends Error {
    readonly requestState = "rejected";
    readonly retryable = false;
    readonly code: string;
    constructor(code: string, message?: string);
}
type AssetVersionInput = Pick<MeetingAsset, 'id' | 'name' | 'mimeType' | 'bytes' | 'sha256' | 'contentKind' | 'referenceOnly'>;
type AssetVersionReservation = AssetVersionInput & Pick<MeetingAsset, 'version' | 'createdAt'>;
/** One durable allocator for both ordinary text/image and opaque file references. */
export declare function reserveMeetingAssetVersion(mid: string, input: AssetVersionInput): Promise<AssetVersionReservation>;
export declare function beginFileUpload(_ctx: Context, mid: string, input: {
    requestId: string;
    name: string;
    mimeType: string;
    totalBytes: number;
}): Promise<{
    assetId?: string | undefined;
    uploadId: string;
    offset: number;
    totalBytes: number;
    status: "cancelled" | "uploading" | "finishing" | "finished";
}>;
export declare function appendFileUpload(_ctx: Context, mid: string, input: {
    uploadId: string;
    offset: number;
    data: string;
}): Promise<{
    assetId?: string | undefined;
    uploadId: string;
    offset: number;
    totalBytes: number;
    status: "cancelled" | "uploading" | "finishing" | "finished";
}>;
export declare function projectFileAssetLocation(m: Meeting, asset: MeetingAsset): MeetingAsset;
export declare function finishFileUpload(_ctx: Context, mid: string, input: {
    uploadId: string;
}): Promise<MeetingAsset>;
export declare function cancelFileUpload(_ctx: Context, mid: string, input: {
    uploadId: string;
}): Promise<{
    cancelled: true;
    approvedAssetId: string;
} | {
    cancelled: true;
    approvedAssetId?: undefined;
}>;
/** Trusted Host HTTP only. Activity remains admitted until the safe descriptor's stream closes. */
export declare function openMeetingAssetDownload(mid: string, assetId: string): Promise<{
    asset: MeetingAsset;
    stream: ReturnType<Awaited<ReturnType<typeof openOwnedFile>>["createReadStream"]>;
}>;
export {};
