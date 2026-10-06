import type { Context } from '@deepseek-ai/cordis';
import { type Meeting, type Delivery } from './meetings.ts';
/** Walk only the exact owned directory; reject symlinks/junctions at every level. */
export declare function checkedMeetingDirectory(root: string, id: string): Promise<string | undefined>;
export declare function editMeeting(ctx: Context, id: string, title: string, description: string): Promise<Meeting>;
export interface DeleteResult {
    deleted: true;
    deliveries: Delivery[];
}
export declare function deleteMeeting(ctx: Context, id: string, confirmed: boolean, notify?: boolean): Promise<DeleteResult>;
