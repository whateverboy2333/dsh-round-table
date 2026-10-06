/** Host storage seams for the desktop runtime; reads never resume an Agent. */
import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
interface StoredHeader {
    id: string;
    cwd?: string;
    createdAt?: number;
    [key: string]: unknown;
}
export interface StoredInspection {
    meta: StoredHeader;
    events: readonly SessionEvent[];
    inheritedEventCount?: number;
}
/** Retain complete seq/time/data/source envelopes; unsupported seams fail loudly. */
export declare function sessionHistory(session: Session): readonly SessionEvent[];
/** Pending next-step input also blocks an independently queued meeting turn. */
export declare function inboxHasPending(inbox: unknown): boolean;
/** rc.2 lists snapshots, while rc.6 lists headers directly. */
export declare function listStoredSessions(ctx: Context, signal?: AbortSignal): Promise<StoredHeader[]>;
/** Durable history, independent of the attached Agent's own in-memory snapshot. */
export declare function readStoredSession(ctx: Context, id: string, signal?: AbortSignal): Promise<StoredInspection>;
/** Live or loaded snapshots preserve buffered input; cold reads use a read handle. */
export declare function readSessionHistory(ctx: Context, id: string, signal?: AbortSignal): Promise<readonly SessionEvent[]>;
/** Caller must await its Agent handle's disposal first; this adds the durability barrier. */
export declare function settleStoredSession(ctx: Context, id: string): Promise<StoredInspection>;
export declare function locateStoredSession(ctx: Context, meta: unknown): {
    path: string;
    kind: string;
} | undefined;
export {};
