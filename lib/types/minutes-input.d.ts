import type { Meeting } from './meetings.ts';
import type { MinutesData } from './minutes.ts';
import type { MinutesOutput } from './minutes-types.ts';
export declare function createMinutesNaming(meeting: Meeting, data: MinutesData, currentTitle?: (id: string) => string | undefined): {
    serialize(value: unknown): string;
    assertOutput(output: MinutesOutput): void;
};
