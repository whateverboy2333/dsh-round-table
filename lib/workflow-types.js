export function isWorkflowCardBinding(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x))
        return false;
    const b = x;
    return Object.keys(b).length === 5 && ['publicationId', 'cardId', 'fileId'].every(k => typeof b[k] === 'string' && !!b[k]) && Number.isSafeInteger(b.version) && Number(b.version) > 0 && typeof b.sha256 === 'string' && /^[a-f0-9]{64}$/.test(b.sha256);
}
export const workflowSchemaSupported = (version) => version === 1 || version === 2 || version === 3;
export const DEFAULT_WORKFLOW_LIMITS = { nodeAttempts: 2, workAttempts: 30, minutesStarts: 5 };
export const validWorkflowId = (x) => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(x) && !['constructor', 'prototype', '__proto__'].includes(x);
/** Editing future authorization or restarting requires a separate whole-run resume. */
export const workflowNeedsExplicitResume = (r) => r.executionPolicy === 'per-node-v1' && r.paused && !!r.automatic?.pauseReason && (r.automatic.pauseReason.startsWith('尚未开始的环节配置已保存') || r.automatic.pauseReason.includes('服务重启'));
