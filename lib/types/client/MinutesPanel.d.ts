import type { MinutesJob, MinutesRecord } from '../minutes-types.ts';
export declare function MinutesPanel({ meetingId, ready, minutes, job, onChanged, formalOnly, publishedIds, members }: {
    members?: {
        id: string;
        name: string;
    }[];
    formalOnly?: boolean;
    publishedIds?: string[];
    meetingId: string;
    ready: boolean;
    minutes?: MinutesRecord[];
    job?: MinutesJob;
    onChanged: () => Promise<void>;
}): React.ReactNode;
