export const emptyTaskDraft = () => ({ title: '', instruction: '', messageIds: [], recipientIds: [], assetIds: [] });
export const hasTaskDraft = (draft) => !!(draft.id || draft.title || draft.instruction || draft.messageIds.length || draft.assetIds.length || draft.recipientIds.length || draft.parentTaskId);
export const sameTaskDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);
