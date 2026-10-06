import type { ReleaseTask } from '../meeting-flow-types.ts';
export declare function taskRecoveryText(task: ReleaseTask): {
    title: string;
    next: string;
} | undefined;
export declare function TaskRecovery({ task }: {
    task: ReleaseTask;
}): React.ReactNode;
