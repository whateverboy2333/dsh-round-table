const record = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const strings = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
const text = (v) => typeof v === 'string' ? v : '';
export function recoveryContent(value) {
    if (typeof value === 'string')
        return value.trim();
    const v = record(value), definition = record(v.definition);
    if (Array.isArray(definition.nodes) && definition.nodes.length) {
        const nodes = definition.nodes.map(record).filter(n => text(n.id) || text(n.title) || text(n.instruction));
        return [text(definition.title), ...nodes.map(node => [text(node.title), text(node.instruction)].filter(Boolean).join('：'))].filter(Boolean).join('\n') || (nodes.length ? '包含未完成的进程节点' : '');
    }
    return [text(v.title), text(definition.title), text(v.description), text(v.instruction), text(v.note), text(v.id) || text(v.parentTaskId) || text(v.contextTaskId) ? '包含原任务关联' : '', strings(v.recipientIds).length ? '包含接收成员选择' : '', strings(v.messageIds).length ? '包含所选会议资料' : '', strings(v.assetIds).length ? '包含附件选择' : ''].filter(Boolean).join('\n').trim();
}
export function collectLegacyDrafts(storage, meetings) {
    const values = new Map();
    for (let i = 0; i < storage.length; i++) {
        const rawKey = storage.key(i);
        if (!rawKey?.startsWith('round-table.'))
            continue;
        const key = rawKey.slice(12);
        if (!/^(?:create-draft$|editor(?:-backup|-save)?\.|hosting\.|workflow-editor\.|revision\.|message-draft\.)/.test(key))
            continue;
        try {
            const raw = storage.getItem(rawKey);
            if (raw && raw !== 'undefined')
                values.set(key, JSON.parse(raw));
        }
        catch { /* Original damaged records remain untouched. */ }
    }
    const entries = [], consumed = new Set(), locate = (tail) => meetings.filter(m => tail === m.meetingId || tail.startsWith(m.meetingId + '.')).sort((a, b) => b.meetingId.length - a.meetingId.length)[0];
    for (const [key, value] of values) {
        const base = key.replace(/\.pending$/, '').replace(/^editor-save\./, 'editor.');
        if (consumed.has(base))
            continue;
        const tail = base.replace(/^[^.]+\./, ''), meeting = locate(tail), meetingId = meeting?.meetingId ?? (base === 'create-draft' ? undefined : tail.split('.')[0]);
        let kind = base === 'create-draft' ? 'meeting' : base.startsWith('workflow-editor.') ? 'workflow' : base.startsWith('revision.') ? 'revision' : base.startsWith('editor') ? 'task' : 'message';
        const pendingKey = base.startsWith('editor.') ? 'editor-save.' + tail : base + '.pending', pending = values.get(pendingKey), pendingValue = record(pending);
        const pendingBody = base.startsWith('revision.') ? pendingValue.note : pendingValue.input ?? pendingValue.editor;
        let body = pending && recoveryContent(pendingBody) ? pendingBody : values.get(base) ?? value;
        if (pending && base.startsWith('hosting.') && Object.keys(record(body)).length) {
            const draft = record(body);
            body = { ...draft, intent: draft.kind === 'task' ? 'work' : strings(draft.recipientIds).length ? 'response' : 'record' };
        }
        const display = recoveryContent(body) || text(pendingValue.note), isPending = !!pending, outcome = pendingValue.stage === 'completed' ? 'completed' : pendingValue.stage === 'rejected' ? 'rejected' : 'unknown';
        if (!display && !isPending)
            continue;
        const grouped = [{ key: base, value: body }], recipients = strings(record(body).recipientIds);
        const recoveryBlocked = isPending && (!text(pendingValue.requestId).trim() || !recoveryContent(pendingBody)) ? '原请求记录不完整；请先复制正文并核对原会议，暂不恢复发送身份。' : undefined;
        if (isPending) {
            kind = 'pending';
            grouped.push({ key: key.startsWith('editor-save.') ? key : pendingKey, value: pending });
            consumed.add(pendingKey);
            consumed.add(key);
        }
        consumed.add(base);
        entries.push({ id: base, kind, meetingId, meetingTitle: meeting?.title ?? (kind === 'meeting' ? '准备创建的新会议' : '所属会议待确认'), label: isPending ? outcome === 'completed' ? '操作已成功，本地草稿待清理' : outcome === 'rejected' ? '操作已拒绝，本地草稿待恢复' : '发送结果待核实' : kind === 'meeting' ? '新建会议草稿' : kind === 'workflow' ? '未保存的会议进程' : kind === 'task' ? '工作任务草稿' : kind === 'revision' ? '任务修改意见' : '未发送的讨论文字', text: display || '此请求保留了发送记录，请先核对原会议接收状态。', recipientNames: recipients.map(id => meeting?.memberNames?.[id] ?? '原接收成员'), values: grouped, pending: isPending, ...(isPending ? { outcome } : {}), knownMeeting: !!meeting || kind === 'meeting', ...(recoveryBlocked ? { recoveryBlocked } : {}) });
    }
    return entries;
}
