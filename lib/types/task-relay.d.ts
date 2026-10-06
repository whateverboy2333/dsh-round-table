import type { Context } from '@deepseek-ai/cordis';
import { type MeetingTask } from './tasks.ts';
declare function dispatchMeetingTaskInternal(ctx: Context, meetingId: string, toSessionId: string, title: string, prompt: string): Promise<MeetingTask>;
export declare function dispatchMeetingTask(...args: Parameters<typeof dispatchMeetingTaskInternal>): Promise<MeetingTask>;
export {};
