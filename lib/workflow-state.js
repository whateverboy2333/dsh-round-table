import { validateWorkflowDraft, validateWorkflowGraph } from "./workflow-graph.js";
import { validWorkflowId, isWorkflowCardBinding, workflowSchemaSupported } from "./workflow-types.js";
import { workflowBudget } from "./workflow-budget.js";
const strings = (v) => Array.isArray(v) && v.every(x => typeof x === 'string');
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const nonnegative = (v) => Number.isSafeInteger(v) && v >= 0;
const unique = (v) => new Set(v.map(x => x.id)).size === v.length;
function activation(a) {
    return !!a && validWorkflowId(a.id) && validWorkflowId(a.nodeId) && typeof a.slotKey === 'string' && nonnegative(a.round)
        && positive(a.attempt) && positive(a.definitionRevision) && Number.isFinite(a.createdAt)
        && !!a.node && a.node.stepsInternal === undefined && a.node.id === a.nodeId && typeof a.node.title === 'string' && ['work', 'join', 'minutes'].includes(a.node.kind)
        && strings(a.node.memberIds) && Array.isArray(a.node.inputs) && typeof a.node.instruction === 'string' && typeof a.node.includeIncoming === 'boolean'
        && (a.node.requireReview === undefined || typeof a.node.requireReview === 'boolean') && (a.node.confirmation === undefined || typeof a.node.confirmation === 'boolean') && (a.node.autoReceiveAndRun === undefined || typeof a.node.autoReceiveAndRun === 'boolean') && (a.node.cardBinding === undefined || isWorkflowCardBinding(a.node.cardBinding)) && (a.revisionOfTaskId === undefined || typeof a.revisionOfTaskId === 'string' && a.temporary === true)
        && validWorkflowId(a.requestId) && typeof a.requestHash === 'string' && typeof a.inputFingerprint === 'string'
        && strings(a.messageIds) && strings(a.assetIds) && strings(a.sourceActivationIds) && strings(a.incomingEdgeIds)
        && (a.loopId === undefined || validWorkflowId(a.loopId)) && (a.releaseId === undefined || validWorkflowId(a.releaseId))
        && (a.minutesJobId === undefined || validWorkflowId(a.minutesJobId))
        && (a.minutesStatus === undefined || ['reserved', 'running', 'completed', 'failed', 'cancelled'].includes(a.minutesStatus))
        && (a.choiceEdgeId === undefined || validWorkflowId(a.choiceEdgeId))
        && (a.skipMode === undefined || a.skipped === true && ['omit', 'bypass'].includes(a.skipMode))
        && ['skipped', 'temporary'].every(k => a[k] === undefined || typeof a[k] === 'boolean');
}
function run(r) {
    return !!r && validWorkflowId(r.id) && ['active', 'completed', 'stopped'].includes(r.status) && typeof r.paused === 'boolean'
        && Number.isFinite(r.createdAt) && validateWorkflowGraph(r.definition).length === 0
        && (r.executionPolicy === undefined || r.executionPolicy === 'per-node-v1') && r.executionPolicy === r.definition.executionPolicy && (r.executionPolicy !== 'per-node-v1' || r.automatic !== undefined)
        && Array.isArray(r.activations) && r.activations.every(activation) && unique(r.activations)
        && r.activations.every(a => !r.definition.nodes.some(n => n.id === a.nodeId && n.stepsInternal) && (r.definition.nodes.some(n => n.id === a.nodeId) || a.temporary))
        && r.activations.every((a, index) => a.definitionRevision <= r.definition.revision && a.sourceActivationIds.every(id => r.activations.slice(0, index).some(source => source.id === id)))
        && Array.isArray(r.events) && r.events.every(e => e && validWorkflowId(e.id) && Number.isFinite(e.time) && typeof e.action === 'string' && typeof e.details === 'string')
        && !!r.rounds && typeof r.rounds === 'object' && !Array.isArray(r.rounds) && Object.entries(r.rounds).every(([id, n]) => r.definition.loops.some(l => l.id === id && positive(n)))
        && nonnegative(r.workReserved) && nonnegative(r.minutesStarted)
        && (r.automatic === undefined || !!r.automatic && r.automatic.mode === 'automatic' && Number.isFinite(r.automatic.authorizedAt) && !!r.automatic.roundCaps && typeof r.automatic.roundCaps === 'object' && !Array.isArray(r.automatic.roundCaps) && Object.keys(r.automatic.roundCaps).length === r.definition.loops.length && Object.entries(r.automatic.roundCaps).every(([id, n]) => r.definition.loops.some(l => l.id === id && positive(n) && Number(n) >= l.maxRounds)) && (r.automatic.pauseReason === undefined || typeof r.automatic.pauseReason === 'string'))
        && (r.budgetGrants === undefined || Array.isArray(r.budgetGrants) && new Set(r.budgetGrants.map(g => g?.requestId)).size === r.budgetGrants.length && r.budgetGrants.every(g => g && validWorkflowId(g.requestId) && nonnegative(g.work) && nonnegative(g.minutes) && g.work <= 1000 && g.minutes <= 100 && g.work + g.minutes > 0 && Number.isFinite(g.createdAt)))
        && Number.isSafeInteger(workflowBudget(r).workAttempts) && Number.isSafeInteger(workflowBudget(r).minutesStarts)
        && r.workReserved <= workflowBudget(r).workAttempts && r.minutesStarted <= workflowBudget(r).minutesStarts
        && (r.pendingInputs === undefined || !!r.pendingInputs && typeof r.pendingInputs === 'object' && !Array.isArray(r.pendingInputs) && Object.entries(r.pendingInputs).every(([key, a]) => Array.isArray(a) && a.every(b => b && (b.kind === 'message' || b.kind === 'asset') && typeof b.id === 'string') && (!a.length || !r.definition.nodes.some(n => n.stepsInternal && key.startsWith(n.id + ':')))))
        && (r.forks === undefined || Array.isArray(r.forks) && r.forks.every(f => f && validWorkflowId(f.id) && r.definition.parallelGroups.some(g => g.id === f.groupId) && nonnegative(f.round) && strings(f.branchIds) && strings(f.sourceActivationIds) && strings(f.activationIds) && f.activationIds.every(id => r.activations.some(a => a.id === id))));
}
export function isWorkflowState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const v = value;
    if (!positive(v.schemaVersion))
        return false;
    // Future versions can be listed/exported, but all store writes and background execution are blocked.
    if (!workflowSchemaSupported(v.schemaVersion))
        return true;
    if (v.schemaVersion < 3 && ([v.draft, ...(Array.isArray(v.versions) ? v.versions : []), ...(Array.isArray(v.runs) ? v.runs.map(r => r?.definition) : [])].some(d => d?.steps !== undefined || Array.isArray(d?.nodes) && d.nodes.some(n => n?.stepsInternal !== undefined)) || (Array.isArray(v.runs) && v.runs.some(r => Array.isArray(r?.activations) && r.activations.some(a => a?.node?.stepsInternal !== undefined)))))
        return false;
    if (v.schemaVersion === 1 && ([v.draft, ...(Array.isArray(v.versions) ? v.versions : [])].some(d => d?.executionPolicy !== undefined) || (Array.isArray(v.runs) && v.runs.some(r => r?.executionPolicy !== undefined || r?.definition?.executionPolicy !== undefined))))
        return false;
    return (v.draft === undefined || validateWorkflowDraft(v.draft).length === 0)
        && Array.isArray(v.versions) && v.versions.every(d => validateWorkflowDraft(d).length === 0)
        && Array.isArray(v.runs) && v.runs.every(run) && unique(v.runs) && v.runs.filter(r => r.status === 'active').length <= 1;
}
export function workflowSupported(m) { return !m.workflow || workflowSchemaSupported(m.workflow.schemaVersion); }
/** Validate both directions so a lost task binding cannot bypass workflow admission. */
export function isWorkflowMeetingLinks(m) {
    if (m.workflow && !workflowSchemaSupported(m.workflow.schemaVersion))
        return true;
    const runs = m.workflow?.runs ?? [], releases = m.releases ?? [], records = m.minutes ?? [];
    const linkedTasks = releases.flatMap(d => d.tasks.filter(t => t.workflow !== undefined).map(t => ({ d, t })));
    for (const { d, t } of linkedTasks) {
        const b = t.workflow;
        if (!b || !validWorkflowId(b.runId) || !validWorkflowId(b.activationId) || !positive(b.reservedDeliveries) || t.attempts > b.reservedDeliveries)
            return false;
        const r = runs.find(r => r.id === b.runId), a = r?.activations.find(a => a.id === b.activationId);
        if (!a || a.releaseId !== d.id || a.node.kind !== 'work' || !a.node.memberIds.includes(t.toSessionId))
            return false;
    }
    for (const r of runs) {
        if (linkedTasks.filter(x => x.t.workflow.runId === r.id).reduce((n, x) => n + x.t.workflow.reservedDeliveries, 0) !== r.workReserved)
            return false;
        if (r.activations.filter(a => !!a.minutesJobId).length !== r.minutesStarted)
            return false;
        for (const a of r.activations) {
            if (a.revisionOfTaskId) {
                const parent = releases.flatMap(d => d.tasks).find(t => t.taskId === a.revisionOfTaskId), child = releases.find(d => d.id === a.releaseId);
                if (!parent || parent.workflow?.runId !== r.id || !a.sourceActivationIds.includes(parent.workflow.activationId) || child?.parentTaskId !== parent.taskId || a.node.memberIds.length !== 1 || a.node.memberIds[0] !== parent.toSessionId)
                    return false;
            }
            if (a.node.kind === 'work' && !a.skipped) {
                const matches = releases.filter(d => d.id === a.releaseId);
                if (matches.length !== 1)
                    return false;
                const d = matches[0];
                if (d.status !== 'released' || d.tasks.length !== a.node.memberIds.length || new Set(d.tasks.map(t => t.toSessionId)).size !== d.tasks.length)
                    return false;
                if (d.tasks.some(t => t.workflow?.runId !== r.id || t.workflow?.activationId !== a.id || !a.node.memberIds.includes(t.toSessionId)))
                    return false;
            }
            if (a.node.kind === 'minutes' && !a.skipped && !a.minutesJobId)
                return false;
            if (a.minutesStatus === 'completed') {
                const n = records.find(n => n.id === a.minutesId);
                if (!n || n.workflow?.runId !== r.id || n.workflow.activationId !== a.id || n.workflow.jobId !== a.minutesJobId)
                    return false;
            }
        }
    }
    for (const n of records)
        if (n.workflow) {
            const r = runs.find(r => r.id === n.workflow.runId), a = r?.activations.find(a => a.id === n.workflow.activationId);
            if (!a || a.minutesId !== n.id || a.minutesJobId !== n.workflow.jobId)
                return false;
        }
    if (m.minutesJob?.workflow) {
        const j = m.minutesJob, r = runs.find(r => r.id === j.workflow.runId), a = r?.activations.find(a => a.id === j.workflow.activationId);
        if (!a || a.minutesJobId !== j.id)
            return false;
    }
    return true;
}
export function assertWorkflowWritable(m) {
    if (!workflowSupported(m))
        throw new Error(`会议流程数据版本 ${m.workflow.schemaVersion} 高于本插件支持版本；当前会议只读，请升级插件`);
}
