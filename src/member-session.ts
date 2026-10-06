import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import {memberForExecution} from './member-session-state.ts'
export {inspectMember,memberForExecution,memberIsArchived,memberIsRestoring} from './member-session-state.ts'
export type {MemberInspection,MemberAvailability} from './member-session-state.ts'

/** User-authorized join only: restore the same existing session through the host's complete composition. */
export async function memberForBriefing(ctx:Context,id:string){
 return memberForExecution(ctx,id)
}
