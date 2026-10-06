const strings = (x) => Array.isArray(x) && x.every(v => typeof v === 'string');
export function isReleaseDraft(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const r = value;
    return typeof r.id === 'string' && Number.isInteger(r.version) && r.version > 0 && ['draft', 'released'].includes(r.status)
        && typeof r.instruction === 'string' && strings(r.messageIds) && strings(r.recipientIds) && Number.isFinite(r.createdAt)
        && Array.isArray(r.tasks) && r.tasks.every(t => t && typeof t.taskId === 'string' && typeof t.toSessionId === 'string'
        && ['queued', 'offline', 'delivering', 'uncertain', 'delivered', 'in_progress', 'completed', 'failed', 'cancelled'].includes(t.status)
        && Number.isFinite(t.updatedAt) && Number.isInteger(t.attempts) && t.attempts >= 0)
        && (r.inputs === undefined || (Array.isArray(r.inputs) && r.inputs.every(m => m && typeof m.id === 'string' && typeof m.text === 'string' && typeof m.sender === 'string' && Number.isFinite(m.time))));
}
