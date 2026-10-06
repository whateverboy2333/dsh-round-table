import type { MeetingAsset } from '../meeting-flow-types.ts';
export declare const MAX_REFERENCE_BYTES: number, REFERENCE_CHUNK_BYTES: number;
type Call = (meetingId: string, action: string, body: unknown) => Promise<any>;
export declare function uploadFileReference(call: Call, meetingId: string, file: File, requestId: string, cancelled: () => boolean, progress?: (loaded: number, total: number) => void): Promise<MeetingAsset | undefined>;
export declare function downloadMeetingAsset(meetingId: string, asset: MeetingAsset, scope: string | undefined, current: () => boolean): Promise<void>;
export {};
