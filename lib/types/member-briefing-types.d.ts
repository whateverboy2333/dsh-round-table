/** A join briefing is an informational FIFO turn, never an executable task. */
export interface MemberBriefing {
    id: string;
    sessionId: string;
    role: string;
    hostMessageId: string;
    status: 'prepared' | 'ready' | 'sending' | 'unknown' | 'delivered' | 'cancelled';
    createdAt: number;
    updatedAt: number;
    text?: string;
    sessionCreatedAt?: number;
    sessionCwd?: string;
    deliveredAt?: number;
    error?: string;
}
export declare function isMemberBriefing(v: unknown): v is MemberBriefing;
