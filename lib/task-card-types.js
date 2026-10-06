const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v) => Array.isArray(v) && v.every(x => typeof x === 'string');
const integer = (v) => Number.isInteger(v) && Number(v) > 0;
const text = (v) => typeof v === 'string' && v.trim().length > 0;
export function isTaskCardGeneration(v) { if (!object(v))
    return false; return text(v.id) && text(v.requestId) && text(v.requestHash) && text(v.discussionId) && ['generate', 'adjust'].includes(v.kind) && strings(v.recipientIds) && text(v.instruction) && strings(v.messageIds) && strings(v.assetIds) && Number.isFinite(v.createdAt) && Array.isArray(v.responses) && v.responses.every((r) => object(r) && text(r.sessionId) && text(r.requestId) && text(r.hash) && strings(r.cardIds) && Number.isFinite(r.createdAt)) && (v.kind === 'generate' || text(v.cardId) && integer(v.baseVersion)); }
export function isTaskCard(v) { if (!object(v))
    return false; return text(v.id) && text(v.generationId) && text(v.generatorSessionId) && integer(v.version) && text(v.title) && text(v.body) && Number.isFinite(v.createdAt) && Array.isArray(v.versions) && v.versions.some((r) => object(r) && r.version === v.version && r.title === v.title && r.body === v.body && r.assigneeSessionId === v.assigneeSessionId) && v.versions.every((r) => object(r) && integer(r.version) && text(r.title) && text(r.body) && ['generator', 'user', 'adjustment'].includes(r.source) && text(r.sourceRequestId) && Number.isFinite(r.createdAt)) && Array.isArray(v.proposals) && v.proposals.every((p) => object(p) && text(p.id) && text(p.generationId) && integer(p.baseVersion) && text(p.title) && text(p.body) && Number.isFinite(p.createdAt)) && Array.isArray(v.operations) && v.operations.every((r) => object(r) && text(r.requestId) && text(r.hash) && integer(r.version)); }
export function isCardPublication(v) { return object(v) && text(v.id) && text(v.requestId) && text(v.requestHash) && typeof v.execute === 'boolean' && Number.isFinite(v.createdAt) && ['prepared', 'published'].includes(v.status) && Array.isArray(v.cards) && v.cards.length > 0 && v.cards.every((c) => object(c) && text(c.cardId) && integer(c.version) && text(c.title) && text(c.body) && text(c.generatorSessionId) && (v.status !== 'published' || text(c.fileId) && text(c.relativePath) && text(c.sha256))); }
/** Reject broken generation/card/version links before treating the disk as approved evidence. */
export function isTaskCardMeetingFields(v) {
    if (!(v.taskCardGenerations === undefined || Array.isArray(v.taskCardGenerations) && v.taskCardGenerations.every(isTaskCardGeneration)) || !(v.taskCards === undefined || Array.isArray(v.taskCards) && v.taskCards.every(isTaskCard)) || !(v.cardPublications === undefined || Array.isArray(v.cardPublications) && v.cardPublications.every(isCardPublication)))
        return false;
    const generations = v.taskCardGenerations ?? [], cards = v.taskCards ?? [], publications = v.cardPublications ?? [], unique = (values) => new Set(values).size === values.length;
    if (!unique(generations.map(g => g.id)) || !unique(generations.map(g => g.requestId)) || !unique(cards.map(c => c.id)) || !unique(publications.map(p => p.id)) || !unique(publications.map(p => p.requestId)))
        return false;
    for (const g of generations) {
        if (!unique(g.recipientIds) || !g.recipientIds.length || !unique(g.responses.map(r => r.sessionId)))
            return false;
        for (const r of g.responses) {
            if (!g.recipientIds.includes(r.sessionId) || !unique(r.cardIds) || r.cardIds.some(id => !cards.some(c => c.id === id && c.generatorSessionId === r.sessionId)))
                return false;
            if (g.kind === 'generate' && r.cardIds.some(id => cards.find(c => c.id === id)?.generationId !== g.id))
                return false;
            if (g.kind === 'adjust' && (r.cardIds.length !== 1 || r.cardIds[0] !== g.cardId))
                return false;
        }
    }
    for (const c of cards) {
        const g = generations.find(g => g.id === c.generationId);
        if (!g || g.kind !== 'generate' || !g.recipientIds.includes(c.generatorSessionId) || !g.responses.some(r => r.sessionId === c.generatorSessionId && r.cardIds.includes(c.id)) || c.versions.length !== c.version || c.versions.some((r, index) => r.version !== index + 1) || !unique(c.operations.map(r => r.requestId)) || !unique(c.proposals.map(p => p.id)))
            return false;
        for (const p of c.proposals) {
            const g = generations.find(g => g.id === p.generationId);
            if (!g || g.kind !== 'adjust' || g.cardId !== c.id || g.baseVersion !== p.baseVersion || !g.recipientIds.includes(c.generatorSessionId) || !c.versions.some(r => r.version === p.baseVersion))
                return false;
        }
    }
    const publishedSnapshots = new Set();
    for (const p of publications) {
        if (!unique(p.cards.map(c => c.cardId)))
            return false;
        for (const snapshot of p.cards) {
            const c = cards.find(c => c.id === snapshot.cardId), version = c?.versions.find(v => v.version === snapshot.version), key = snapshot.cardId + ':' + snapshot.version;
            if (!c || !version || snapshot.generatorSessionId !== c.generatorSessionId || snapshot.title !== version.title || snapshot.body !== version.body || snapshot.assigneeSessionId !== version.assigneeSessionId || publishedSnapshots.has(key) || p.execute && !snapshot.assigneeSessionId)
                return false;
            publishedSnapshots.add(key);
        }
    }
    return true;
}
