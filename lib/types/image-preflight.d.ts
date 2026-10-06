import type { Context } from '@deepseek-ai/cordis';
import type { Meeting } from './meetings.ts';
import type { ImageRecipientCapability } from './chat-types.ts';
/** Read model projections only. Checking an image never wakes an Agent or sends text. */
export declare function imageRecipientCapabilities(ctx: Context, m: Meeting, ids: string[], assetIds: string[]): Promise<ImageRecipientCapability[]>;
export declare function assertImageRecipients(ctx: Context, m: Meeting, ids: string[], assetIds: string[]): Promise<ImageRecipientCapability[]>;
