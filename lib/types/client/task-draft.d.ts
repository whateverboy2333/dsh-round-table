export interface TaskDraft {
    id?: string;
    version?: number;
    title: string;
    instruction: string;
    messageIds: string[];
    recipientIds: string[];
    assetIds: string[];
    parentTaskId?: string;
}
export declare const emptyTaskDraft: () => TaskDraft;
export declare const hasTaskDraft: (draft: TaskDraft) => boolean;
export declare const sameTaskDraft: (a: TaskDraft, b: TaskDraft) => boolean;
export interface TaskDraftSave {
    requestId: string;
    editor: TaskDraft;
    release: boolean;
    stage: 'draft' | 'release' | 'completed' | 'rejected';
    draftId?: string;
    version?: number;
}
