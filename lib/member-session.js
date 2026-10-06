import { memberForExecution } from "./member-session-state.js";
export { inspectMember, memberForExecution, memberIsArchived, memberIsRestoring } from "./member-session-state.js";
/** User-authorized join only: restore the same existing session through the host's complete composition. */
export async function memberForBriefing(ctx, id) {
    return memberForExecution(ctx, id);
}
