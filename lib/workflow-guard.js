import { workflowSupported } from "./workflow-state.js";
import { workflowBudget } from "./workflow-budget.js";
export function workflowTaskAllowed(m, t, delivery) {
    if (!workflowSupported(m))
        return false;
    if (!t.workflow)
        return true;
    const r = m.workflow?.runs.find(r => r.id === t.workflow.runId), a = r?.activations.find(a => a.id === t.workflow.activationId);
    if (!r || r.status !== 'active' || !a || a.skipped)
        return false;
    if (a.revisionOfTaskId) {
        let source = (m.releases ?? []).flatMap(d => d.tasks).find(x => x.taskId === a.revisionOfTaskId), base = source?.workflow ? r.activations.find(x => x.id === source.workflow.activationId) : undefined;
        const seen = new Set();
        while (base?.revisionOfTaskId && !seen.has(base.id)) {
            seen.add(base.id);
            source = (m.releases ?? []).flatMap(d => d.tasks).find(x => x.taskId === base.revisionOfTaskId);
            base = source?.workflow ? r.activations.find(x => x.id === source.workflow.activationId) : undefined;
        }
        if (!base || base.skipped || !base.temporary && r.activations.filter(x => !x.temporary && x.slotKey === base.slotKey).at(-1)?.id !== base.id)
            return false;
    }
    if (!a.temporary && r.activations.filter(x => !x.temporary && x.slotKey === a.slotKey).at(-1)?.id !== a.id)
        return false;
    return !delivery || (!r.paused && !m.releasePaused && !m.archivedAt);
}
/** Called in the same meeting transaction as a retry. A known receipt never spends again. */
export function reserveWorkflowRetry(m, t) {
    if (!t.workflow)
        return;
    if (!workflowTaskAllowed(m, t, true))
        throw new Error('流程已暂停、结束或本次执行已被替代');
    // Offline before any dispatch already owns its initial reservation.
    if (t.attempts < t.workflow.reservedDeliveries)
        return;
    const r = m.workflow.runs.find(r => r.id === t.workflow.runId), a = r.activations.find(a => a.id === t.workflow.activationId);
    const ids = new Set(r.activations.filter(x => x.slotKey === a.slotKey).map(x => x.id));
    const memberReservations = (m.releases ?? []).flatMap(d => d.tasks).filter(x => x.toSessionId === t.toSessionId && x.workflow?.runId === r.id && ids.has(x.workflow.activationId)).reduce((n, x) => n + x.workflow.reservedDeliveries, 0);
    if (memberReservations >= r.definition.limits.nodeAttempts || r.workReserved >= workflowBudget(r).workAttempts)
        throw new Error('本轮成员执行或流程总投递额度已用尽');
    r.workReserved++;
    t.workflow = { ...t.workflow, reservedDeliveries: t.workflow.reservedDeliveries + 1 };
}
