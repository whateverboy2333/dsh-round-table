export interface ChatDraft {intent:'record'|'response'|'work';instruction:string;recipientIds:string[];messageIds:string[];assetIds:string[];contextTaskId?:string}
export const emptyChatDraft=():ChatDraft=>({intent:'record',instruction:'',recipientIds:[],messageIds:[],assetIds:[]})
export function restoreChatDraft(value:unknown):ChatDraft {
 if(!value||typeof value!=='object')return emptyChatDraft()
 const d=value as Partial<ChatDraft>,ids=(v:unknown)=>Array.isArray(v)?[...new Set(v.filter((x):x is string=>typeof x==='string'))]:[]
 return {intent:d.intent==='response'||d.intent==='work'?d.intent:'record',instruction:typeof d.instruction==='string'?d.instruction:'',recipientIds:ids(d.recipientIds),messageIds:ids(d.messageIds),assetIds:ids(d.assetIds),...(typeof d.contextTaskId==='string'?{contextTaskId:d.contextTaskId}:{})}
}
export function mentionAt(text:string,caret:number):{start:number;end:number;query:string}|undefined {
 const before=text.slice(0,caret),line=before.split('\n').at(-1)??''
 if((before.match(/```/g)?.length??0)%2||/^\s*>/.test(line)||((line.match(/`/g)?.length??0)%2))return
 const match=/@([^\s@]*)$/.exec(before)
 if(!match)return
 const start=caret-match[1]!.length-1
 if(start>0&&/[A-Za-z0-9_.+\-]/.test(before[start-1]!))return
 return {start,end:caret,query:match[1]!}
}
