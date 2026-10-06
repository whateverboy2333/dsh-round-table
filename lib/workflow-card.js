import { listPublishedTaskCards } from "./task-cards.js";
import { readMeetingDocument } from "./meeting-folder.js";
import { workflowHash } from "./workflow-projection.js";
/** Provenance only: no text/LLM classifier. A preparation reply is not execution
 * approval, even if the node separately requests a human start confirmation. */
export function workflowDraftWarnings(m, items) {
    const generated = new Set();
    for (const g of m.taskCardGenerations ?? []) {
        const d = m.discussions?.find(d => d.id === g.discussionId);
        if (d) {
            generated.add(d.messageId);
            for (const reply of d.replies)
                generated.add(reply.messageId);
        }
    }
    return items.flatMap(item => {
        let approvedIds = new Set();
        try {
            if (item.node.cardBinding)
                approvedIds = new Set(approvedWorkflowCard(m, item.node.cardBinding).messageIds);
        }
        catch (error) {
            return [`「${item.node.title}」任务卡绑定无法核对：${error instanceof Error ? error.message : String(error)}`];
        }
        if (!item.messageIds.some(id => generated.has(id) && !approvedIds.has(id)))
            return [];
        return [`「${item.node.title}」引用任务卡生成草稿；请实际发布并绑定批准卡片版本后再自动执行。单独设置主持确认不等于批准卡片；手动预览可作为独立工作授权，但草稿卡仍未发布。`];
    });
}
export function approvedWorkflowCard(m, binding) {
    const card = listPublishedTaskCards(m).find(c => c.publicationId === binding.publicationId && c.cardId === binding.cardId && c.version === binding.version);
    if (!card || card.fileRef.fileId !== binding.fileId || card.fileRef.sha256 !== binding.sha256)
        throw Error('环节绑定的已发布任务卡版本不存在或已经失去文件关联');
    return card;
}
export function bindWorkflowCard(m, node, binding) {
    const card = approvedWorkflowCard(m, binding);
    if (node.kind !== 'work')
        throw Error('已发布任务卡只能绑定到成员处理环节');
    return { ...node, instruction: card.body, ...(card.assigneeSessionId ? { memberIds: [card.assigneeSessionId] } : {}), inputs: [...card.messageIds.map(id => ({ kind: 'message', id })), ...card.assetIds.map(id => ({ kind: 'asset', id }))], cardBinding: structuredClone(binding) };
}
/** Validate the exact approved bytes before reserving a task. The stored body is
 * a frozen authored snapshot; unreadable/edited files are never silently used. */
export async function verifyWorkflowCards(m, nodeIds, nodes) {
    for (const node of nodes.filter(n => nodeIds.includes(n.id) && n.cardBinding)) {
        const card = approvedWorkflowCard(m, node.cardBinding);
        if (node.instruction !== card.body)
            throw Error(`「${node.title}」任务卡要求已变动，请解除卡片绑定或重新选择已发布版本`);
        const doc = await readMeetingDocument(m, card.fileRef.fileId);
        if (doc.ref.sha256 !== card.fileRef.sha256 || doc.ref.version !== card.version || doc.ref.kind !== 'task')
            throw Error(`「${node.title}」任务卡文件与批准版本不一致，未开始`);
        for (const assetId of card.assetIds) {
            const approved = card.assetVersions?.find(a => a.id === assetId), current = m.assets?.find(a => a.id === assetId);
            if (!approved || !current || current.version !== approved.version || current.sha256 !== approved.sha256)
                throw Error(`「${node.title}」任务卡材料版本已变化或缺失，请批准新的卡片与材料版本后再开始`);
            const file = m.meetingFolder?.files.find(f => f.kind === 'asset' && f.id === assetId && f.version === approved.version && f.sha256 === approved.sha256);
            if (!file)
                throw Error(`「${node.title}」任务卡材料原件尚未保存到本会文件夹，未开始`);
            await readMeetingDocument(m, file.fileId);
        }
        const expected = [...card.messageIds.map(id => ({ kind: 'message', id })), ...card.assetIds.map(id => ({ kind: 'asset', id }))];
        if (workflowHash(node.inputs) !== workflowHash(expected))
            throw Error(`「${node.title}」任务卡资料绑定已改动，请解除绑定后调整`);
    }
}
