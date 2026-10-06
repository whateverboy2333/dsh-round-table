export function isMinutesOutput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const v = value;
    return Object.keys(v).every(k => ['keyDecisions', 'taskProgress', 'openItems', 'summary'].includes(k))
        && typeof v.summary === 'string' && v.summary.trim().length > 0
        && ['keyDecisions', 'taskProgress', 'openItems'].every(k => Array.isArray(v[k]) && v[k].every(x => typeof x === 'string'));
}
export function isMinutesRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const v = value;
    return typeof v.id === 'string' && (v.scope === 'full' || v.scope === 'since_last')
        && isMinutesOutput({ summary: v.summary, keyDecisions: v.keyDecisions, taskProgress: v.taskProgress, openItems: v.openItems })
        && Number.isFinite(v.generatedAt) && Number.isInteger(v.modelCalls) && v.modelCalls >= 0
        && (v.integrity === undefined || (!!v.integrity && ['conflict', 'needs_review'].includes(v.integrity.state) && Array.isArray(v.integrity.warnings) && v.integrity.warnings.every(s => typeof s === 'string') && !!v.integrity.facts && Array.isArray(v.integrity.facts.tasks) && Array.isArray(v.integrity.facts.members) && !!v.integrity.facts.counts && Object.values(v.integrity.facts.counts).every(n => Number.isSafeInteger(n) && n >= 0) && typeof v.integrity.facts.scopeLabel === 'string' && typeof v.integrity.facts.sourceDigest === 'string' && Number.isFinite(v.integrity.checkedAt) && (v.integrity.reviewedAt === undefined || Number.isFinite(v.integrity.reviewedAt))))
        && (v.cursors === undefined || (v.cursors !== null && typeof v.cursors === 'object' && Object.values(v.cursors).every(n => Number.isInteger(n) && n >= -1)))
        && (v.deliveries === undefined || (Array.isArray(v.deliveries) && v.deliveries.every(d => d && typeof d.sessionId === 'string' && (d.status === 'delivered' || d.status === 'undelivered'))));
}
