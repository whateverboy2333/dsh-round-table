import type { Context } from '@deepseek-ai/cordis';
import { type Meeting } from './meetings.ts';
export interface MeetingToolActor {
    sessionId: string;
    agent: NonNullable<ReturnType<Context['agents']['get']>>;
    identity: {
        createdAt: number;
        cwd: string;
    };
}
/** Current SDK incarnation only: metadata observation never restores or binds a session. */
export declare function authenticateMeetingToolActor(ctx: Context, value: unknown): Promise<MeetingToolActor>;
export declare function ownsToolMeeting(m: Meeting, actor: MeetingToolActor): boolean;
export declare function canReadToolMeeting(m: Meeting, actor: MeetingToolActor): boolean;
export declare function authorizeMeetingToolRead(ctx: Context, meetingId: string, value: unknown): Promise<{
    actor: MeetingToolActor;
    meeting: Meeting;
}>;
