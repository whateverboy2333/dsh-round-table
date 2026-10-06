import { sanitizeAssetReferences } from "./asset-reference.js";
// Only the model-facing copy is renamed. Stored identities, cursors and hashes
// remain authoritative and are never rewritten by this formatter.
const sessionToken = /(?:round-table-secretary-|session-)[a-z0-9][a-z0-9_-]*/gi;
const identityKeys = new Set(['sessionId', 'toSessionId', 'memberId', 'sender', 'by']);
const identityLists = new Set(['memberIds', 'memberSessionIds', 'recipientIds', 'missingSessionIds']);
const displayKeys = { sessionId: 'memberName', toSessionId: 'toMemberName', memberId: 'memberName', memberIds: 'memberNames', memberSessionIds: 'memberNames', recipientIds: 'recipientNames', missingSessionIds: 'missingMemberNames' };
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function createMinutesNaming(meeting, data, currentTitle) {
    const members = new Set([...data.members.map(m => m.sessionId), ...data.missing.map(m => m.sessionId)]);
    const referenced = new Set(members), tokens = new Set();
    const scan = (value, key = '') => {
        if (typeof value === 'string') {
            if (identityKeys.has(key) && !['user', 'secretary'].includes(value))
                referenced.add(value);
            for (const match of value.matchAll(sessionToken))
                tokens.add(match[0]);
        }
        else if (Array.isArray(value))
            for (const item of value) {
                if (identityLists.has(key) && typeof item === 'string')
                    referenced.add(item);
                scan(item);
            }
        else if (value && typeof value === 'object')
            for (const [k, v] of Object.entries(value)) {
                if (!['cursors', 'eventVersions'].includes(k))
                    scan(v, k);
            }
    };
    scan(sanitizeAssetReferences(data));
    for (const id of tokens)
        referenced.add(id);
    const known = new Set([...meeting.memberSessionIds, ...Object.keys(meeting.memberNames ?? {}), ...members]);
    for (const e of meeting.events)
        if (e.kind === 'join' || e.kind === 'leave')
            known.add(e.sessionId);
    const entries = [...referenced].filter(id => id !== 'user' && id !== 'secretary');
    const validName = (name, id) => {
        const text = name?.trim();
        return text && text !== id && !/(?:round-table-secretary-|session-)[a-z0-9]|sessionId/i.test(text) ? text : undefined;
    };
    let unnamed = 0, unknown = 0;
    const bases = entries.map(id => id === meeting.secretary?.sessionId ? '秘书' : validName(known.has(id) ? currentTitle?.(id) : undefined, id) ?? validName(meeting.memberNames?.[id], id) ?? (known.has(id) ? `未命名成员${++unnamed}` : `未识别会话${++unknown}`));
    const counts = new Map();
    for (const base of bases)
        counts.set(base, (counts.get(base) ?? 0) + 1);
    const names = new Map([['user', '主持人'], ['secretary', '秘书']]), used = new Set(['主持人', '秘书']);
    entries.forEach((id, i) => {
        if (id === meeting.secretary?.sessionId) {
            names.set(id, '秘书');
            return;
        }
        const base = bases[i], label = counts.get(base) > 1 || used.has(base) ? `${base}（成员${i + 1}）` : base;
        let unique = label, index = 2;
        while (used.has(unique))
            unique = `${label}（${index++}）`;
        names.set(id, unique);
        used.add(unique);
    });
    // Short synthetic IDs may be ordinary prose (e.g. "a"). Map those only in
    // identity fields. Real IDs are replaced as whole tokens, longest first.
    const longIds = entries.filter(id => id.length >= 8).sort((a, b) => b.length - a.length);
    const tokenPattern = new RegExp(`(?<![a-zA-Z0-9_-])(?:${[...longIds.map(escapeRegExp), '(?:round-table-secretary-|session-)[a-zA-Z0-9][a-zA-Z0-9_-]*'].join('|')})(?![a-zA-Z0-9_-])`, 'g');
    const replaceText = (text) => text.replace(tokenPattern, id => {
        let name = names.get(id);
        if (!name) {
            name = `未识别会话${++unknown}`;
            names.set(id, name);
        }
        return name;
    });
    const transform = (value, key = '') => {
        if (typeof value === 'string')
            return identityKeys.has(key) ? names.get(value) ?? replaceText(value) : replaceText(value);
        if (Array.isArray(value))
            return value.map(v => identityLists.has(key) && typeof v === 'string' ? names.get(v) ?? replaceText(v) : transform(v));
        if (value && typeof value === 'object')
            return Object.fromEntries(Object.entries(value).filter(([k]) => !['cursors', 'eventVersions'].includes(k)).map(([k, v]) => [displayKeys[k] ?? k, transform(v, k)]));
        return value;
    };
    return {
        serialize(value) {
            const copy = transform(sanitizeAssetReferences(value));
            // The member roster uses a concise name field; event references keep their
            // descriptive field names (memberName, toMemberName, ...).
            if (!Array.isArray(copy) && Array.isArray(copy.members))
                copy.members = copy.members.map((m) => { const { memberName, ...rest } = m; return { name: memberName, ...rest }; });
            return JSON.stringify(copy);
        },
        assertOutput(output) {
            const text = JSON.stringify(output);
            if (/(?:round-table-secretary-|session-)[a-z0-9]|sessionId/i.test(text) || replaceText(text) !== text)
                throw new Error('纪要含会话标识，未保存本次结果；请重试生成。');
        },
    };
}
