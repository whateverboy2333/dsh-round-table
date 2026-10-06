import type { MinutesOutput, MinutesRecord, MinutesFacts } from './minutes-types.ts';
/** Frozen structured evidence. Text is never mined to invent task status or people. */
export declare function minutesFacts(data: {
    scope: string;
    members: {
        sessionId: string;
    }[];
    events: unknown[];
    taskSnapshot?: unknown[];
    taskChanges?: {
        addedTaskIds: string[];
        updatedTaskIds: string[];
    };
}, name: (id: string) => string): MinutesFacts;
export declare function checkMinutesFacts(output: MinutesOutput, facts: MinutesFacts): {
    state: "conflict" | "needs_review";
    warnings: string[];
    facts: MinutesFacts;
    checkedAt: number;
    coverage: string;
};
export declare function assertMinutesShareable(record: MinutesRecord): void;
export declare function minutesEvidenceText(record: MinutesRecord): string;
