import type { RoundTableConnection } from './MeetingPanel.tsx';
import type { KnightSelection } from './PresetKnightPicker.tsx';
export type MemberCreationStage = 'create' | 'rename' | 'verify' | 'join' | 'done';
export interface MemberCreationStep {
    instanceId: string;
    sessionId: string;
    title: string;
    stage: MemberCreationStage;
    error?: string;
    presetId?: string;
    workspaceId?: string;
    role?: string;
}
export interface MemberCreationBatch {
    id: string;
    members: MemberCreationStep[];
}
export interface MeetingCreationJournal extends MemberCreationBatch {
    title: string;
    description: string;
    workspaceId: string;
    meetingId?: string;
    uncertain?: boolean;
    requestSafe?: boolean;
}
export declare class MemberCreationStopped extends Error {
    constructor();
}
export declare const memberCreationStageText: (step: MemberCreationStep) => string;
export declare function memberCreationBatch(existing: readonly {
    sessionId: string;
    title: string;
}[], knights: readonly KnightSelection[], workspaceIds: readonly string[]): MemberCreationBatch;
/** Persist identity before the first remote call. Official session.create adopts that same ID after response loss. */
export declare function runMemberCreation<T extends MemberCreationBatch>(batch: T, connection: RoundTableConnection, join: (step: MemberCreationStep) => Promise<void>, save: (batch: T) => void, isCurrent?: () => boolean): Promise<T>;
