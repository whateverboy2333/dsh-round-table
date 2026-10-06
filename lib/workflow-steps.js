import { DEFAULT_WORKFLOW_LIMITS, validWorkflowId } from "./workflow-types.js";
const shortId = (id) => validWorkflowId(id) && id.length <= 64;
const clone = (value) => structuredClone(value);
export function isStepsDefinition(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && value.steps?.version === 1;
}
export function makeStepsDefinition(id, title = '会议进程', limits = DEFAULT_WORKFLOW_LIMITS) {
    if (!shortId(id))
        throw Error('步骤流程ID需为1—64位合法ID');
    return { id, title, revision: 1, executionPolicy: 'per-node-v1', steps: { version: 1, stages: [] }, entryId: '', nodes: [], edges: [], parallelGroups: [], loops: [], limits: clone(limits), layoutRevision: 1, positions: {} };
}
export function stepsUserNodes(d) {
    if (!isStepsDefinition(d) || !Array.isArray(d.steps.stages) || !Array.isArray(d.nodes))
        return [];
    const nodes = new Map(d.nodes.filter(n => n && !n.stepsInternal).map(n => [n.id, n]));
    return d.steps.stages.flatMap(stage => stage.nodeIds.map(id => nodes.get(id)).filter((n) => !!n));
}
function helper(id, kind) {
    return { id, title: kind === 'entry' ? '步骤入口' : '并行步骤结束', kind: 'join', memberIds: [], instruction: '', inputs: [], includeIncoming: true, stepsInternal: kind };
}
/** Rebuild ONLY structural fields. All real step fields and saved coordinates survive unchanged. */
export function compileStepsDefinition(d) {
    if (!isStepsDefinition(d) || !shortId(d.id) || d.executionPolicy !== 'per-node-v1' || !Array.isArray(d.steps.stages) || !Array.isArray(d.nodes))
        throw Error('步骤编排格式或流程ID非法');
    if (Object.keys(d.steps).some(k => !['version', 'stages'].includes(k)))
        throw Error('步骤编排字段未知');
    const next = clone(d), users = new Map(), seen = new Set(), stageIds = new Set();
    for (const n of d.nodes) {
        if (!n || !validWorkflowId(n.id))
            throw Error('步骤ID非法');
        if (n.stepsInternal !== undefined)
            continue;
        if (n.kind !== 'work' || users.has(n.id))
            throw Error('步骤类型非法或ID重复');
        users.set(n.id, n);
    }
    const nodes = [], edges = [], groups = [];
    let predecessor = d.steps.stages.length ? `steps-entry-${d.id}` : '';
    if (predecessor) {
        if (users.has(predecessor))
            throw Error('步骤ID与内部入口冲突');
        nodes.push(helper(predecessor, 'entry'));
    }
    for (const stage of d.steps.stages) {
        if (!stage || !shortId(stage.id) || stageIds.has(stage.id) || !Array.isArray(stage.nodeIds) || !stage.nodeIds.length || Object.keys(stage).some(k => !['id', 'nodeIds'].includes(k)))
            throw Error('阶段ID需唯一且不超过64位，每个阶段至少一个步骤');
        stageIds.add(stage.id);
        for (const [index, id] of stage.nodeIds.entries()) {
            if (!validWorkflowId(id) || seen.has(id) || !users.has(id))
                throw Error('阶段步骤缺失、重复或ID非法');
            seen.add(id);
            nodes.push(clone(users.get(id)));
            edges.push({ id: `steps-edge-${stage.id}-${index}`, from: predecessor, to: id, kind: 'flow' });
        }
        if (stage.nodeIds.length > 1) {
            const joinId = `steps-join-${stage.id}`;
            if (users.has(joinId) || nodes.some(n => n.id === joinId))
                throw Error('步骤ID与内部汇合冲突');
            nodes.push(helper(joinId, 'join'));
            stage.nodeIds.forEach((id, index) => edges.push({ id: `steps-merge-${stage.id}-${index}`, from: id, to: joinId, kind: 'flow' }));
            groups.push({ id: `steps-group-${stage.id}`, sourceId: predecessor, branchIds: [...stage.nodeIds], joinId });
            predecessor = joinId;
        }
        else
            predecessor = stage.nodeIds[0];
    }
    if (seen.size !== users.size)
        throw Error('存在未归入用户阶段的步骤');
    if (nodes.length > 200 || edges.length > 600)
        throw Error('步骤编排超过节点或连线限额');
    next.entryId = d.steps.stages.length ? `steps-entry-${d.id}` : '';
    next.nodes = nodes;
    next.edges = edges;
    next.parallelGroups = groups;
    next.loops = [];
    const ids = new Set(nodes.map(n => n.id));
    next.positions = Object.fromEntries(Object.entries(d.positions ?? {}).filter(([id]) => ids.has(id)));
    return next;
}
function editable(d, run, structural = false) {
    if (!isStepsDefinition(d))
        throw Error('当前流程不是自由步骤编排；请先明确创建新的步骤草稿');
    if (structural && run?.status === 'active')
        throw Error('运行中的流程结构已冻结，请先结束本轮后调整');
    return clone(d);
}
function newNode(id) {
    if (!validWorkflowId(id))
        throw Error('步骤ID非法');
    return { id, title: '', kind: 'work', memberIds: [], instruction: '', inputs: [], includeIncoming: true, autoReceiveAndRun: false };
}
function unusedNode(d, id) { if (d.nodes.some(n => n.id === id))
    throw Error('步骤ID重复或与内部节点冲突'); }
export function appendStepsNode(d, nodeId, stageId, afterStageId, run) {
    const next = editable(d, run, true);
    unusedNode(next, nodeId);
    if (!shortId(stageId) || next.steps.stages.some(s => s.id === stageId))
        throw Error('阶段ID重复或超过64位');
    let index = next.steps.stages.length;
    if (afterStageId !== undefined) {
        const after = next.steps.stages.findIndex(s => s.id === afterStageId);
        if (after < 0)
            throw Error('指定阶段不存在');
        index = after + 1;
    }
    next.nodes.push(newNode(nodeId));
    next.steps.stages.splice(index, 0, { id: stageId, nodeIds: [nodeId] });
    return compileStepsDefinition(next);
}
export function addStepsParallel(d, targetNodeId, nodeId, stageId, run) {
    const next = editable(d, run, true), stage = next.steps.stages.find(s => s.nodeIds.includes(targetNodeId));
    unusedNode(next, nodeId);
    if (!stage || stage.id !== stageId)
        throw Error('目标步骤或并行阶段位置已变化');
    stage.nodeIds.push(nodeId);
    next.nodes.push(newNode(nodeId));
    return compileStepsDefinition(next);
}
export function removeStepsNode(d, nodeId, run) {
    const next = editable(d, run, true);
    if (!next.steps.stages.some(s => s.nodeIds.includes(nodeId)))
        throw Error('步骤不存在');
    next.steps.stages = next.steps.stages.map(s => ({ ...s, nodeIds: s.nodeIds.filter(id => id !== nodeId) })).filter(s => s.nodeIds.length);
    next.nodes = next.nodes.filter(n => n.id !== nodeId).map(n => ({ ...n, inputs: n.inputs.filter(b => b.kind !== 'node' || b.nodeId !== nodeId) }));
    return compileStepsDefinition(next);
}
export function moveStepsStage(d, stageId, direction, run) {
    const next = editable(d, run, true), index = next.steps.stages.findIndex(s => s.id === stageId);
    if (index < 0 || !['up', 'down'].includes(direction))
        throw Error('所选阶段或移动方向非法');
    const target = index + (direction === 'up' ? -1 : 1);
    if (target >= 0 && target < next.steps.stages.length) {
        const [stage] = next.steps.stages.splice(index, 1);
        next.steps.stages.splice(target, 0, stage);
    }
    return compileStepsDefinition(next);
}
export function patchStepsNode(d, nodeId, patch, run) {
    const next = editable(d, run), node = next.nodes.find(n => n.id === nodeId && !n.stepsInternal);
    if (!node || !next.steps.stages.some(s => s.nodeIds.includes(nodeId)))
        throw Error('步骤不存在');
    const allowed = new Set(['title', 'memberIds', 'instruction', 'inputs', 'includeIncoming', 'requireReview', 'confirmation', 'autoReceiveAndRun', 'cardBinding']);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !allowed.has(k)))
        throw Error('不能修改步骤ID、类型或内部字段');
    if (patch.includeIncoming !== undefined && patch.includeIncoming !== true)
        throw Error('步骤必须接收实际上游信息');
    const changed = Object.entries(patch).some(([key, value]) => JSON.stringify(node[key]) !== JSON.stringify(value));
    if (changed && run?.status === 'active' && run.activations.some(a => !a.temporary && a.nodeId === nodeId))
        throw Error('已开始的环节字段已冻结');
    Object.assign(node, clone(patch));
    return compileStepsDefinition(next);
}
