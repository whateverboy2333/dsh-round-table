export interface TaskDraft {id?:string;version?:number;title:string;instruction:string;messageIds:string[];recipientIds:string[];assetIds:string[];parentTaskId?:string}
export const emptyTaskDraft=():TaskDraft=>({title:'',instruction:'',messageIds:[],recipientIds:[],assetIds:[]})
export const hasTaskDraft=(draft:TaskDraft)=>!!(draft.id||draft.title||draft.instruction||draft.messageIds.length||draft.assetIds.length||draft.recipientIds.length||draft.parentTaskId)
export const sameTaskDraft=(a:TaskDraft,b:TaskDraft)=>JSON.stringify(a)===JSON.stringify(b)
export interface TaskDraftSave {requestId:string;editor:TaskDraft;release:boolean;stage:'draft'|'release'|'completed'|'rejected';draftId?:string;version?:number}
