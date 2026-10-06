import { validWorkflowId, isWorkflowCardBinding } from "./workflow-types.js";
import { compileStepsDefinition, isStepsDefinition } from "./workflow-steps.js";
const strings = (x) => Array.isArray(x) && x.every(v => typeof v === 'string');
const stable = (value) => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
function validate(value, partial) {
    const errors = [];
    const issue = (code, message, nodeId, edgeId) => errors.push({ code, message, ...(nodeId ? { nodeId } : {}), ...(edgeId ? { edgeId } : {}) });
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [{ code: 'shape', message: '流程必须为对象' }];
    const d = value;
    const steps = d.steps !== undefined, allowPartial = partial && steps;
    if (steps) {
        try {
            if (!isStepsDefinition(d))
                throw Error('步骤编排版本未知');
            const expected = compileStepsDefinition(d), structure = (x) => ({ entryId: x.entryId, nodeIds: x.nodes.map(n => n.id), helpers: x.nodes.filter(n => n.stepsInternal !== undefined), edges: x.edges, parallelGroups: x.parallelGroups, loops: x.loops });
            if (stable(structure(d)) !== stable(structure(expected)))
                issue('steps-canonical', '步骤依赖结构与用户指定的阶段不一致，请重新编排');
            for (const n of d.nodes)
                if (!n.stepsInternal && n.includeIncoming !== true)
                    issue('steps-inputs', '步骤必须接收实际所走上游的信息', n.id);
        }
        catch (error) {
            issue('steps-shape', error instanceof Error ? error.message : '步骤编排格式非法');
        }
    }
    else if (Array.isArray(d.nodes) && d.nodes.some(n => n?.stepsInternal !== undefined))
        issue('steps-internal', '内部步骤标记只能属于已校验的自由步骤编排');
    if (d.executionPolicy !== undefined && d.executionPolicy !== 'per-node-v1')
        issue('execution-policy', '流程执行策略未知，请升级插件');
    if (!validWorkflowId(d.id) || typeof d.title !== 'string' || !d.title.trim() || !Number.isSafeInteger(d.revision) || d.revision < 1)
        issue('identity', '流程ID、名称或版本非法');
    if (!Array.isArray(d.nodes) || (!d.nodes.length && !allowPartial) || d.nodes.length > 200 || !Array.isArray(d.edges) || d.edges.length > 600 || !Array.isArray(d.parallelGroups) || !Array.isArray(d.loops))
        return [...errors, { code: 'shape', message: '需要1—200个节点、边和明确的并行／回路组' }];
    const nodes = new Map(), titles = new Set();
    for (const n of d.nodes) {
        if (d.executionPolicy === 'per-node-v1' && n?.autoReceiveAndRun === true && n.includeIncoming !== true)
            issue('automatic-inputs', '自动接收并运行必须接收所走上游的正式输入', n?.id);
        if (n?.autoReceiveAndRun !== undefined && d.executionPolicy !== 'per-node-v1')
            issue('execution-policy', '环节自动权限必须有明确的逐环节策略，不能回落旧全局模式', n?.id);
        if (!n || !validWorkflowId(n.id)) {
            issue('node-id', '节点ID非法');
            continue;
        }
        if (nodes.has(n.id))
            issue('duplicate-node', '节点ID重复', n.id);
        nodes.set(n.id, n);
        if (typeof n.title !== 'string' || (!allowPartial && !n.title.trim()) || (!steps && titles.has(n.title.trim())))
            issue('node-title', '节点名称为空或重复', n.id);
        else
            titles.add(n.title.trim());
        if (!['work', 'join', 'minutes'].includes(n.kind) || !strings(n.memberIds) || !Array.isArray(n.inputs) || typeof n.instruction !== 'string' || n.instruction.length > 100000 || typeof n.includeIncoming !== 'boolean' || (n.decision !== undefined && typeof n.decision !== 'boolean') || (n.requireReview !== undefined && typeof n.requireReview !== 'boolean') || (n.confirmation !== undefined && typeof n.confirmation !== 'boolean') || (n.autoReceiveAndRun !== undefined && typeof n.autoReceiveAndRun !== 'boolean'))
            issue('node-shape', '节点字段非法', n.id);
        else {
            if (n.cardBinding !== undefined && (!isWorkflowCardBinding(n.cardBinding) || n.kind !== 'work'))
                issue('node-shape', '任务卡绑定必须指向一个已发布的固定版本', n.id);
            if (n.kind !== 'work' && n.memberIds.length)
                issue('control-member', '汇合／秘书节点不能配置普通执行成员', n.id);
            if (n.kind === 'work' && ((!allowPartial && !n.memberIds.length) || new Set(n.memberIds).size !== n.memberIds.length || steps && n.memberIds.length > 1))
                issue('members', steps ? '每个步骤执行时需指定一位成员Agent；并行工作请建立独立步骤' : '工作节点需配置不重复的成员', n.id);
            if (n.kind !== 'join' && n.decision)
                issue('decision', '只有汇合节点可设置人工选路', n.id);
            for (const b of n.inputs) {
                if (!b || !['message', 'asset', 'node', 'activation'].includes(b.kind))
                    issue('input', '输入绑定非法', n.id);
                else if (b.kind === 'node' && (!validWorkflowId(b.nodeId) || !['current', 'previous'].includes(b.round)))
                    issue('input', '节点结果需明确当前轮或上一轮', n.id);
                else if (b.kind === 'activation' && !validWorkflowId(b.activationId))
                    issue('input', '执行来源ID非法', n.id);
                else if ((b.kind === 'message' || b.kind === 'asset') && (typeof b.id !== 'string' || !b.id))
                    issue('input', '固定资料ID不能为空', n.id);
            }
        }
    }
    if (d.executionPolicy === undefined && d.nodes.some(n => n && n.autoReceiveAndRun !== undefined))
        issue('execution-policy', '逐环节自动配置必须使用明确的执行策略');
    if (errors.some(e => ['node-shape', 'node-id', 'input'].includes(e.code)))
        return errors;
    for (const n of d.nodes)
        for (const b of n.inputs)
            if (b.kind === 'node' && !nodes.has(b.nodeId))
                issue('input-node', '引用的节点不存在', n.id);
    const edgeIds = new Set(), pairs = new Set();
    const normal = [];
    for (const e of d.edges) {
        if (!e || !validWorkflowId(e.id) || edgeIds.has(e.id)) {
            issue('edge-id', '边ID非法或重复', undefined, e?.id);
            continue;
        }
        edgeIds.add(e.id);
        if (!nodes.has(e.from) || !nodes.has(e.to)) {
            issue('dangling', '连线端点不存在', undefined, e.id);
            continue;
        }
        if (e.from === e.to)
            issue('self-cycle', '不允许节点自环', e.from, e.id);
        if (!['flow', 'choice', 'loop'].includes(e.kind))
            issue('edge-kind', '连线类型非法', undefined, e.id);
        if (e.kind !== 'loop')
            normal.push(e);
        const key = e.from + '>' + e.to + ':' + e.kind;
        if (pairs.has(key))
            issue('duplicate-edge', '重复连线', undefined, e.id);
        pairs.add(key);
        if (e.kind === 'choice' && (!nodes.get(e.from)?.decision || typeof e.label !== 'string' || !e.label.trim()))
            issue('choice', '人工出口需要汇合决策节点与可读名称', e.from, e.id);
        if (e.kind === 'flow' && nodes.get(e.from)?.decision)
            issue('choice', '人工决策出口必须标为条件路径', e.from, e.id);
    }
    if (errors.some(e => ['edge-id', 'dangling', 'edge-kind', 'choice'].includes(e.code)))
        return errors;
    if (d.nodes.length && !nodes.has(d.entryId))
        issue('entry', '入口不存在');
    const roots = d.nodes.filter(n => !normal.some(e => e.to === n.id));
    if (d.nodes.length && (roots.length !== 1 || roots[0]?.id !== d.entryId))
        issue('entry', '流程需要一个明确入口，不能有无入口或游离节点');
    const indegree = new Map(d.nodes.map(n => [n.id, normal.filter(e => e.to === n.id).length])), queue = roots.map(n => n.id), order = [];
    while (queue.length) {
        const id = queue.shift();
        order.push(id);
        for (const e of normal.filter(e => e.from === id)) {
            const n = (indegree.get(e.to) ?? 1) - 1;
            indegree.set(e.to, n);
            if (n === 0)
                queue.push(e.to);
        }
    }
    if (order.length !== nodes.size)
        issue('cycle', '除声明的回路返回边外，流程不能有环');
    const reachable = new Set();
    const visit = (id) => { if (reachable.has(id))
        return; reachable.add(id); normal.filter(e => e.from === id).forEach(e => visit(e.to)); };
    if (nodes.has(d.entryId))
        visit(d.entryId);
    for (const n of d.nodes)
        if (!reachable.has(n.id))
            issue('unreachable', '节点从入口不可达', n.id);
    for (const n of d.nodes)
        if (n.decision) {
            const out = normal.filter(e => e.from === n.id);
            if (out.length < 2 || out.some(e => e.kind !== 'choice') || new Set(out.map(e => e.label)).size !== out.length)
                issue('choice', '人工分支需至少两个名称不同的出口', n.id);
        }
    const occupied = new Set(), loopIds = new Set();
    for (const l of d.loops) {
        if (!l || !validWorkflowId(l.id) || loopIds.has(l.id) || !strings(l.nodeIds) || !strings(l.entryIds) || !l.entryIds.length || !Number.isSafeInteger(l.maxRounds) || l.maxRounds < 1) {
            issue('loop-shape', '回路需合法ID、入口、节点范围及正整数轮次');
            continue;
        }
        loopIds.add(l.id);
        if (!nodes.get(l.gateId)?.decision || nodes.get(l.advanceId)?.kind !== 'work' || !l.nodeIds.includes(l.gateId) || !l.nodeIds.includes(l.advanceId))
            issue('loop-gate', '回路需要人工决策门和修改工作节点', l.gateId);
        for (const id of l.nodeIds) {
            if (!nodes.has(id))
                issue('loop-node', '回路节点不存在', id);
            if (occupied.has(id))
                issue('nested-loop', '本版不支持嵌套或交叉回路', id);
            occupied.add(id);
        }
        if (new Set(l.nodeIds).size !== l.nodeIds.length || new Set(l.entryIds).size !== l.entryIds.length)
            issue('loop-node', '回路范围或入口重复');
        if (!normal.some(e => e.from === l.gateId && e.to === l.advanceId && e.kind === 'choice'))
            issue('loop-gate', '修改节点必须由本回路的人工选择直接进入', l.advanceId);
        if (!normal.some(e => e.from === l.gateId && !l.nodeIds.includes(e.to)))
            issue('loop-exit', '回路缺少退出路径', l.gateId);
        for (const id of l.entryIds)
            if (!l.nodeIds.includes(id) || !d.edges.some(e => e.from === l.advanceId && e.to === id && e.kind === 'loop' && e.loopId === l.id))
                issue('loop-return', '每个回路入口都要有正确返回边', id);
        for (const e of normal) {
            if (!l.nodeIds.includes(e.from) && l.nodeIds.includes(e.to) && !l.entryIds.includes(e.to))
                issue('loop-entry', '回路只能从声明的评审入口进入', e.to, e.id);
            if (l.nodeIds.includes(e.from) && !l.nodeIds.includes(e.to) && e.from !== l.gateId)
                issue('loop-exit', '回路只能由决策门退出', e.from, e.id);
        }
        const beforeGate = new Set();
        const walk = (id) => { if (beforeGate.has(id) || id === l.advanceId)
            return; beforeGate.add(id); if (id !== l.gateId)
            normal.filter(e => e.from === id && l.nodeIds.includes(e.to)).forEach(e => walk(e.to)); };
        l.entryIds.forEach(walk);
        const reachesGate = new Set([l.gateId]);
        for (let i = 0; i < l.nodeIds.length; i++)
            for (const e of normal)
                if (beforeGate.has(e.from) && reachesGate.has(e.to))
                    reachesGate.add(e.from);
        for (const id of l.nodeIds)
            if (id !== l.advanceId && (!beforeGate.has(id) || !reachesGate.has(id)))
                issue('loop-region', '回路中的评审节点必须位于入口到决策门的路径上', id);
        if (normal.some(e => e.from === l.advanceId) || normal.filter(e => e.to === l.advanceId).some(e => e.from !== l.gateId))
            issue('loop-advance', '修改节点只能从决策门进入并沿返回边离开', l.advanceId);
    }
    if (errors.some(e => e.code === 'loop-shape'))
        return errors;
    for (const e of d.edges.filter(e => e.kind === 'loop')) {
        const l = d.loops.find(l => l.id === e.loopId);
        if (!l || e.from !== l.advanceId || !l.entryIds.includes(e.to))
            issue('loop-edge', '返回边不属于合法回路入口', undefined, e.id);
    }
    const groupIds = new Set();
    for (const g of d.parallelGroups) {
        if (!g || !validWorkflowId(g.id) || groupIds.has(g.id) || !strings(g.branchIds) || g.branchIds.length < 2) {
            issue('group', '并行组字段非法');
            continue;
        }
        groupIds.add(g.id);
        if (!nodes.has(g.sourceId) || nodes.get(g.joinId)?.kind !== 'join' || new Set(g.branchIds).size !== g.branchIds.length)
            issue('group', '并行组需要来源、独立分支与汇合节点', g.joinId);
        const children = normal.filter(e => e.from === g.sourceId && e.kind === 'flow').map(e => e.to);
        if (children.length !== g.branchIds.length || g.branchIds.some(id => !children.includes(id)))
            issue('group', '并行组必须完整包含来源的实际分支', g.sourceId);
        const branchSets = g.branchIds.map(id => { const set = new Set(); const walk = (x) => { if (x === g.joinId || set.has(x))
            return; set.add(x); normal.filter(e => e.from === x).forEach(e => walk(e.to)); }; walk(id); return set; });
        for (let i = 0; i < branchSets.length; i++) {
            const set = branchSets[i];
            if (![...set].some(id => normal.some(e => e.from === id && e.to === g.joinId)))
                issue('group-exit', '分支不能到达约定汇合', g.branchIds[i]);
            for (const id of set)
                if (!normal.some(e => e.from === id) && !d.edges.some(e => e.from === id && e.kind === 'loop'))
                    issue('group-exit', '分支在汇合前提前结束', id);
            for (let j = i + 1; j < branchSets.length; j++)
                if ([...set].some(id => branchSets[j].has(id)))
                    issue('group-overlap', '并行分支在约定汇合之前发生重叠', g.joinId);
        }
    }
    if (errors.some(e => e.code === 'group'))
        return errors;
    for (const n of d.nodes) {
        const children = normal.filter(e => e.from === n.id && e.kind === 'flow');
        if (children.length > 1 && !d.parallelGroups.some(g => g.sourceId === n.id))
            issue('group-required', '多个普通出口必须声明并行组及汇合', n.id);
    }
    if (!d.limits || Object.values(d.limits).length !== 3 || !['nodeAttempts', 'workAttempts', 'minutesStarts'].every(k => Number.isSafeInteger(d.limits[k]) && d.limits[k] > 0))
        issue('limits', '所有执行上限必须为正整数');
    if (!Number.isSafeInteger(d.layoutRevision) || d.layoutRevision < 1 || !d.positions || typeof d.positions !== 'object' || Array.isArray(d.positions) || Object.entries(d.positions).some(([id, p]) => !nodes.has(id) || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        issue('layout', '布局版本和坐标非法');
    return errors;
}
export function validateWorkflowGraph(value) { return validate(value, false); }
/** Only an explicitly authored steps draft may remain empty or partially configured. */
export function validateWorkflowDraft(value) { return validate(value, true); }
export function assertWorkflowDraft(d) { const errors = validateWorkflowDraft(d); if (errors.length)
    throw new Error(errors.map(e => `${e.nodeId ?? e.edgeId ?? '流程'}：${e.message}`).join('；')); }
export function assertWorkflowGraph(d) { const errors = validateWorkflowGraph(d); if (errors.length)
    throw new Error(errors.map(e => `${e.nodeId ?? e.edgeId ?? '流程'}：${e.message}`).join('；')); }
export function workflowSemantic(d) { const { positions, layoutRevision, revision, ...semantic } = d; return semantic; }
export function layoutWorkflow(d) {
    const copy = structuredClone(d), ranks = new Map([[d.entryId, 0]]);
    for (let pass = 0; pass < d.nodes.length; pass++)
        for (const e of d.edges.filter(e => e.kind !== 'loop'))
            if (ranks.has(e.from))
                ranks.set(e.to, Math.max(ranks.get(e.to) ?? 0, ranks.get(e.from) + 1));
    const rows = new Map();
    copy.positions = {};
    for (const n of d.nodes) {
        const x = ranks.get(n.id) ?? 0, y = rows.get(x) ?? 0;
        rows.set(x, y + 1);
        copy.positions[n.id] = { x: 40 + x * 260, y: 50 + y * 190 };
    }
    return copy;
}
