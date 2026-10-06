import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { appendStepsNode, addStepsParallel, isStepsDefinition, stepsUserNodes, removeStepsNode, moveStepsStage, patchStepsNode } from "../workflow-steps.js";
import { MaterialPicker } from "./MaterialPicker.js";
import { uiButton as button, uiInput as input } from "./ui-state.js";
const statusLabels = { not_started: '未开始', not_walked: '未走此路径', waiting_inputs: '等待输入', ready: '可开始', waiting_decision: '待你决定', queued: '等待投递', offline: '原窗口未连接', delivering: '正在投递', uncertain: '投递待核实', in_progress: '处理中', waiting_review: '待验收', changes_requested: '待修改', submitted: '已提交', failed: '执行失败', ended: '已结束', skipped: '已跳过', limit: '达到上限' };
const active = (run) => run?.status === 'active';
const started = (run, nodeId) => !!active(run) && !!run?.activations.some(a => a.nodeId === nodeId && !a.temporary);
/** Edit the user's step IDs, never infer intent, send messages, or migrate an old graph. */
export function WorkflowSteps(props) {
    const { definition, members, run, views = [], selected, busy = false, readOnly = false, messages = [], assets = [], onSelect, onPrepareEmpty, onShowGraph, onOpenMembers, renderExecution } = props;
    const steps = isStepsDefinition(definition), nodes = steps ? stepsUserNodes(definition) : definition.nodes.filter(n => !n.stepsInternal);
    const [collapsed, setCollapsed] = useState(false), [materials, setMaterials] = useState(), [error, setError] = useState('');
    const host = useRef(null), pendingFocus = useRef(), latest = useRef(props), materialOwner = useRef();
    latest.current = props;
    const key = JSON.stringify([definition.id, readOnly, run?.id, run?.status, steps]), owner = useRef({ key, epoch: 0, alive: true });
    if (owner.current.key !== key)
        owner.current = { ...owner.current, key, epoch: owner.current.epoch + 1 };
    const captured = { key: owner.current.key, epoch: owner.current.epoch };
    const valid = () => owner.current.alive && owner.current.key === captured.key && owner.current.epoch === captured.epoch;
    const writable = () => valid() && !latest.current.busy && !latest.current.readOnly && isStepsDefinition(latest.current.definition);
    useEffect(() => { owner.current.alive = true; return () => { owner.current.alive = false; owner.current.epoch++; }; }, []);
    const setPicker = (next) => { materialOwner.current = next; setMaterials(next); };
    useEffect(() => { setCollapsed(false); setPicker(undefined); setError(''); }, [selected, key]);
    useEffect(() => {
        const id = pendingFocus.current;
        if (!id || !nodes.some(n => n.id === id))
            return;
        const field = host.current?.querySelector(`[data-steps-title="${id}"]`);
        if (field) {
            field.focus();
            pendingFocus.current = undefined;
        }
    }, [definition, selected]);
    const mutate = (change, structure = false, nodeId) => {
        if (!writable() || structure && active(latest.current.run) || nodeId && (!latest.current.definition.nodes.some(n => n.id === nodeId && !n.stepsInternal) || started(latest.current.run, nodeId)))
            return;
        setError('');
        latest.current.onEdit(current => {
            if (!writable() || current.id !== definition.id || !isStepsDefinition(current) || structure && active(latest.current.run) || nodeId && (!current.nodes.some(n => n.id === nodeId && !n.stepsInternal) || started(latest.current.run, nodeId)))
                return current;
            try {
                return change(current, latest.current.run);
            }
            catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                void Promise.resolve().then(() => { if (valid())
                    setError(message); });
                return current;
            }
        });
    };
    const patch = (nodeId, fields) => mutate((d, r) => {
        if (d.nodes.find(n => n.id === nodeId)?.cardBinding && ('instruction' in fields || 'inputs' in fields))
            return d;
        return patchStepsNode(d, nodeId, fields, r);
    }, false, nodeId);
    const add = (afterStageId) => {
        if (!writable() || active(latest.current.run) || afterStageId && !latest.current.definition.steps?.stages.some(s => s.id === afterStageId))
            return;
        const nodeId = crypto.randomUUID(), stageId = crypto.randomUUID();
        pendingFocus.current = nodeId;
        setCollapsed(false);
        mutate((d, r) => appendStepsNode(d, nodeId, stageId, afterStageId, r), true);
        if (valid())
            onSelect(nodeId);
    };
    const parallel = (nodeId, stageId) => {
        if (!writable() || active(latest.current.run) || !latest.current.definition.steps?.stages.some(s => s.id === stageId && s.nodeIds.includes(nodeId)))
            return;
        const newId = crypto.randomUUID();
        pendingFocus.current = newId;
        setCollapsed(false);
        mutate((d, r) => addStepsParallel(d, nodeId, newId, stageId, r), true);
        if (valid())
            onSelect(newId);
    };
    const remove = (nodeId) => {
        if (!writable() || active(latest.current.run) || !latest.current.definition.steps?.stages.some(s => s.nodeIds.includes(nodeId)))
            return;
        mutate((d, r) => removeStepsNode(d, nodeId, r), true, nodeId);
        if (valid() && latest.current.selected === nodeId)
            onSelect('');
        if (valid() && materialOwner.current?.nodeId === nodeId)
            setPicker(undefined);
    };
    const expand = (nodeId) => { if (!valid())
        return; setCollapsed(selected === nodeId ? !collapsed : false); setPicker(undefined); onSelect(nodeId); };
    const select = (nodeId) => { if (!valid())
        return; if (selected !== nodeId)
        setCollapsed(false); onSelect(nodeId); };
    const lockedStructure = readOnly || busy || active(run) || !steps;
    const row = (node, position, stageId) => {
        const open = selected === node.id && !collapsed, locked = readOnly || busy || !steps || started(run, node.id), inputLocked = locked || !!node.cardBinding, memberId = node.memberIds[0] ?? '', missingMember = memberId && !members.some(m => m.id === memberId), view = views.find(v => v.nodeId === node.id);
        const picker = materials?.nodeId === node.id && materials.key === key && materials.epoch === owner.current.epoch && open && !inputLocked;
        return _jsxs("section", { className: "rt-steps-card", "data-workflow-step": node.id, "data-selected": open ? 'true' : 'false', children: [_jsxs("div", { className: "rt-steps-head", children: [_jsx("input", { "data-steps-title": node.id, "aria-label": `环节名称 ${position}`, className: "rt-steps-title", style: { ...input, width: 'auto', minWidth: 90, padding: '5px 1px', background: 'transparent', borderColor: 'transparent', fontWeight: 500 }, placeholder: "\u70B9\u51FB\u547D\u540D", value: node.title, disabled: locked, onFocus: () => select(node.id), onChange: e => patch(node.id, { title: e.target.value }), onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                                e.preventDefault();
                                e.currentTarget.blur();
                            } } }), _jsx("span", { className: "rt-steps-status", children: statusLabels[view?.status ?? 'not_started'] ?? view?.status }), steps && _jsx("button", { type: "button", style: button, className: "rt-steps-link", "data-steps-action": "parallel", "data-node-id": node.id, disabled: lockedStructure, onClick: () => parallel(node.id, stageId), children: "\u8BBE\u7F6E\u5E76\u884C" }), _jsx("button", { type: "button", style: button, className: "rt-steps-link", "data-steps-action": "expand", "data-node-id": node.id, "aria-expanded": open, onClick: () => expand(node.id), children: open ? '收起 ▴' : '展开 ▾' }), steps && _jsx("button", { type: "button", style: button, className: "rt-steps-link rt-steps-delete", "data-steps-action": "delete", "data-node-id": node.id, "aria-label": `删除环节 ${position}`, title: readOnly ? '当前记录只读' : active(run) ? '本轮已开始，结束本轮后可调整环节' : busy ? '正在处理，请稍候' : '删除此环节；保存后更新会议配置', disabled: lockedStructure, onClick: () => remove(node.id), children: "\u5220\u9664" })] }), node.kind === 'work' ? _jsxs("label", { className: "rt-steps-assignment", children: [_jsx("span", { children: "\u6210\u5458Agent" }), _jsxs("select", { style: input, "data-steps-assignee": node.id, "aria-label": `成员Agent ${position}`, value: memberId, disabled: locked, onChange: e => patch(node.id, { memberIds: e.target.value ? [e.target.value] : [] }), children: [_jsx("option", { value: "", children: "\u8BF7\u9009\u62E9\u6210\u5458Agent" }), missingMember && _jsxs("option", { value: memberId, disabled: true, children: ["\u539F\u6210\u5458\u5DF2\u4E0D\u53EF\u7528 \u00B7 ", memberId] }), members.map(m => _jsx("option", { value: m.id, children: m.name }, m.id))] })] }) : _jsx("p", { className: "rt-steps-type", children: node.kind === 'minutes' ? '秘书整理' : node.decision ? '汇合／人工选择' : '汇合' }), !steps && node.memberIds.length > 1 && _jsxs("p", { className: "rt-steps-type", children: ["\u539F\u6D41\u7A0B\u6307\u6D3E\uFF1A", node.memberIds.map(id => members.find(m => m.id === id)?.name ?? `${id}（原成员已不可用）`).join('、')] }), steps && _jsxs("label", { className: "rt-steps-auto", children: [_jsx("input", { type: "checkbox", "data-steps-auto": node.id, "aria-label": `自动接收上游信息并运行 ${position}`, checked: node.autoReceiveAndRun === true, disabled: locked, onChange: e => patch(node.id, { autoReceiveAndRun: e.target.checked }) }), _jsx("span", { children: "\u81EA\u52A8\u63A5\u6536\u4E0A\u6E38\u4FE1\u606F\u5E76\u8FD0\u884C" })] }), open && _jsxs("div", { className: "rt-steps-detail", children: [locked && _jsx("p", { className: "rt-steps-note", children: !steps ? '原流程保持原有结构，切换为空白编排后可自行安排。' : readOnly ? '当前记录只读。' : started(run, node.id) ? '此环节已开始，成员、要求和输入已冻结。' : '正在保存，请稍候。' }), node.cardBinding && _jsxs("p", { className: "rt-steps-note", children: ["\u5DF2\u7ED1\u5B9A\u4EFB\u52A1\u5361 v", node.cardBinding.version, "\uFF0C\u8981\u6C42\u4E0E\u8D44\u6599\u6765\u81EA\u5DF2\u53D1\u5E03\u6587\u4EF6\u3002\u89E3\u9664\u7ED1\u5B9A\u540E\u53EF\u4FEE\u6539\u8981\u6C42\u4E0E\u8D44\u6599\u3002"] }), _jsxs("label", { className: "rt-steps-field", children: [_jsx("span", { children: "\u672C\u73AF\u8282\u8981\u6C42" }), _jsx("textarea", { rows: 3, style: input, "data-steps-instruction": node.id, "aria-label": `本环节要求 ${position}`, placeholder: "\u586B\u5199\u8FD9\u4E2A\u73AF\u8282\u9700\u8981\u5B8C\u6210\u7684\u5DE5\u4F5C\u2026", value: node.instruction, disabled: inputLocked, onChange: e => patch(node.id, { instruction: e.target.value }) })] }), !!node.inputs.length && _jsxs("p", { className: "rt-steps-note", children: ["\u5DF2\u9009 ", node.inputs.filter(i => i.kind === 'message').length, " \u6761\u6D88\u606F\u3001", node.inputs.filter(i => i.kind === 'asset').length, " \u4EFD\u9644\u4EF6", node.inputs.some(i => i.kind === 'node' || i.kind === 'activation') ? '；保留明确选择的节点／执行记录' : '', "\u3002"] }), _jsx("div", { className: "rt-steps-detail-tools", children: steps && _jsx("button", { type: "button", style: button, "data-steps-action": "materials", "data-node-id": node.id, disabled: inputLocked, onClick: () => { if (writable() && !started(latest.current.run, node.id) && !latest.current.definition.nodes.find(n => n.id === node.id)?.cardBinding)
                                    setPicker({ nodeId: node.id, key, epoch: owner.current.epoch }); }, children: "\u9009\u62E9\u4F1A\u8BAE\u8D44\u6599" }) }), picker && _jsx(MaterialPicker, { messages: messages, assets: assets, names: Object.fromEntries(members.map(m => [m.id, m.name])), value: { messageIds: node.inputs.filter((i) => i.kind === 'message').map(i => i.id), assetIds: node.inputs.filter((i) => i.kind === 'asset').map(i => i.id) }, onApply: value => { if (!writable() || materialOwner.current !== materials || latest.current.selected !== node.id || owner.current.epoch !== materials.epoch || started(latest.current.run, node.id))
                                return; mutate((d, r) => { const n = d.nodes.find(n => n.id === node.id); if (!n || n.cardBinding)
                                return d; return patchStepsNode(d, node.id, { inputs: [...n.inputs.filter(i => i.kind !== 'message' && i.kind !== 'asset'), ...value.messageIds.map(id => ({ kind: 'message', id })), ...value.assetIds.map(id => ({ kind: 'asset', id }))] }, r); }, false, node.id); setPicker(undefined); }, onCancel: () => { if (valid() && materialOwner.current === materials && latest.current.selected === node.id)
                                setPicker(undefined); } }, `${key}:${node.id}:${materials.epoch}`), renderExecution?.(node.id)] })] }, node.id);
    };
    const stages = steps ? definition.steps.stages : nodes.map(n => ({ id: n.id, nodeIds: [n.id] }));
    return _jsxs("section", { ref: host, className: "rt-workflow-steps", "aria-label": "\u4F1A\u8BAE\u6B65\u9AA4\u5217\u8868", children: [_jsx("style", { children: workflowStepsStyles }), !steps && _jsxs("div", { className: "rt-steps-legacy", role: "status", children: [_jsx("p", { children: "\u8FD9\u662F\u539F\u6709\u6D41\u7A0B\uFF0C\u6309\u5B9E\u9645\u8282\u70B9\u53EA\u8BFB\u663E\u793A\uFF0C\u5C1A\u672A\u8F6C\u6362\u4E3A\u7A7A\u767D\u6B65\u9AA4\u7F16\u6392\u3002" }), _jsxs("div", { className: "rt-steps-actions", children: [onPrepareEmpty && _jsx("button", { type: "button", style: button, "data-steps-action": "prepare-empty", disabled: readOnly || busy || active(run), onClick: () => { if (valid() && !latest.current.readOnly && !latest.current.busy && !active(latest.current.run))
                                    onPrepareEmpty(); }, children: "\u65B0\u5EFA\u7A7A\u767D\u6B65\u9AA4\u7F16\u6392" }), onShowGraph && _jsx("button", { type: "button", style: button, "data-steps-action": "graph", onClick: onShowGraph, children: "\u67E5\u770B\u539F\u6D41\u7A0B\u56FE" })] })] }), _jsxs("div", { className: "rt-steps-list-head", children: [_jsxs("div", { children: [_jsx("strong", { children: "\u4F1A\u8BAE\u73AF\u8282" }), _jsxs("small", { children: [nodes.length, "\u4E2A\u73AF\u8282", stages.some(s => s.nodeIds.length > 1) ? ` · ${stages.filter(s => s.nodeIds.length > 1).length}组并行` : ''] })] }), steps && _jsx("button", { type: "button", style: button, "data-steps-action": "add", disabled: lockedStructure, onClick: () => add(), children: "\uFF0B \u6DFB\u52A0\u73AF\u8282" })] }), steps && !nodes.length && _jsxs("div", { className: "rt-steps-empty", children: [_jsx("strong", { children: "\u4ECE\u7A7A\u767D\u5F00\u59CB\u7F16\u6392" }), _jsx("p", { children: "\u70B9\u51FB\u201C\u6DFB\u52A0\u73AF\u8282\u201D\uFF0C\u81EA\u5DF1\u547D\u540D\u5E76\u6307\u5B9A\u6210\u5458Agent\u3002" }), _jsx("p", { children: "\u9700\u8981\u5E76\u884C\u65F6\uFF0C\u5728\u5BF9\u5E94\u73AF\u8282\u65C1\u8BBE\u7F6E\u3002" })] }), active(run) && steps && _jsx("p", { className: "rt-steps-note", children: "\u672C\u8F6E\u5DF2\u5F00\u59CB\uFF0C\u73AF\u8282\u987A\u5E8F\u4E0E\u5E76\u884C\u7ED3\u6784\u4FDD\u6301\u51BB\u7ED3\u3002\u5C1A\u672A\u5F00\u59CB\u7684\u73AF\u8282\u53EF\u66F4\u65B0\u6210\u5458\u3001\u8981\u6C42\u548C\u81EA\u52A8\u8FD0\u884C\u9009\u62E9\u3002" }), stages.map((stage, index) => { const group = stage.nodeIds.length > 1, stageNodes = stage.nodeIds.map(id => nodes.find(n => n.id === id)).filter((n) => !!n), assigned = stageNodes.flatMap(n => n.memberIds), same = assigned.length !== new Set(assigned).size; return _jsxs("section", { className: "rt-steps-stage", "data-steps-stage": stage.id, children: [_jsx("span", { className: "rt-steps-index", children: index + 1 }), _jsxs("div", { className: "rt-steps-stage-body", children: [group && _jsxs("div", { className: "rt-steps-group-head", children: [_jsx("strong", { children: "\u5E76\u884C\u7EC4" }), _jsxs("p", { children: [stageNodes.length, "\u9879\u65E0\u5148\u540E\u4F9D\u8D56\uFF0C\u5168\u90E8\u5B8C\u6210\u540E\u7EE7\u7EED", same ? '；同一Agent的多项工作可能按序处理' : ''] })] }), _jsx("div", { className: group ? 'rt-steps-group-items' : '', children: stageNodes.map((n, i) => row(n, group ? `${index + 1}.${i + 1}` : String(index + 1), stage.id)) }), steps && _jsxs("div", { className: "rt-steps-stage-tools", children: [_jsx("button", { type: "button", style: button, "aria-label": `上移第${index + 1}阶段`, "data-steps-action": "up", "data-stage-id": stage.id, disabled: lockedStructure || index === 0, onClick: () => mutate((d, r) => moveStepsStage(d, stage.id, 'up', r), true), children: "\u2191" }), _jsx("button", { type: "button", style: button, "aria-label": `下移第${index + 1}阶段`, "data-steps-action": "down", "data-stage-id": stage.id, disabled: lockedStructure || index === stages.length - 1, onClick: () => mutate((d, r) => moveStepsStage(d, stage.id, 'down', r), true), children: "\u2193" }), _jsx("button", { type: "button", style: button, className: "rt-steps-link", "data-steps-action": "insert", "data-stage-id": stage.id, disabled: lockedStructure, onClick: () => add(stage.id), children: "\uFF0B \u540E\u7EED\u73AF\u8282" })] })] })] }, stage.id); }), !members.length && steps && _jsxs("p", { className: "rt-steps-note", children: ["\u672C\u4F1A\u8FD8\u6CA1\u6709\u53EF\u9009\u6210\u5458\u3002", onOpenMembers && _jsx("button", { type: "button", style: button, onClick: onOpenMembers, children: "\u67E5\u770B\u4F1A\u8BAE\u6210\u5458" })] }), error && _jsx("p", { role: "alert", children: error }), steps && _jsx("p", { className: "rt-steps-bottom", children: "\u540D\u79F0\u76F4\u63A5\u70B9\u51FB\u4FEE\u6539\u3002\u6210\u5458Agent\u5728\u6BCF\u884C\u9009\u62E9\uFF0C\u81EA\u52A8\u8FD0\u884C\u9ED8\u8BA4\u5173\u95ED\u3002" })] });
}
export const workflowStepsStyles = `
.rt-workflow-steps{min-width:0;max-width:100%;font-size:13px;line-height:1.5;container:workflow-steps/inline-size;color:inherit}
.rt-workflow-steps *{box-sizing:border-box}.rt-workflow-steps p{margin:0}.rt-workflow-steps button,.rt-workflow-steps input,.rt-workflow-steps select,.rt-workflow-steps textarea{font:inherit;max-width:100%}.rt-workflow-steps button{min-height:30px}.rt-workflow-steps button:disabled,.rt-workflow-steps input:disabled,.rt-workflow-steps select:disabled,.rt-workflow-steps textarea:disabled{cursor:default;opacity:.6}
.rt-workflow-steps :is(button,input,select,textarea):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.rt-steps-list-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.rt-steps-list-head small{display:block;font-size:12px;color:var(--dsw-alias-label-secondary)}
.rt-steps-empty{padding:26px 12px;text-align:center;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px}.rt-steps-empty p{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:7px}.rt-steps-stage{display:grid;grid-template-columns:26px minmax(0,1fr);gap:8px;margin-top:12px}.rt-steps-index{width:26px;height:26px;margin-top:10px;display:grid;place-items:center;background:var(--dsw-alias-interactive-bg-hover);border-radius:50%;color:var(--dsw-alias-label-secondary);font-size:12px}.rt-steps-stage-body{min-width:0}.rt-steps-card{min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base)}.rt-steps-card[data-selected=true]{border-color:var(--dsw-alias-state-business-primary)}
.rt-steps-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 10px}.rt-workflow-steps input.rt-steps-title{width:auto;flex:1 1 145px;min-width:90px;padding:5px 1px;background:transparent;border-color:transparent;font-weight:500}.rt-workflow-steps input.rt-steps-title:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)!important}.rt-workflow-steps input.rt-steps-title::placeholder{color:var(--dsw-alias-label-secondary)}.rt-steps-status{font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);padding:3px 6px;border-radius:4px;white-space:nowrap}.rt-workflow-steps button.rt-steps-link{border-color:transparent!important;background:transparent!important;color:var(--dsw-alias-state-business-primary)!important;padding:4px 6px!important}
.rt-workflow-steps button.rt-steps-delete{color:var(--dsw-alias-state-error-primary,#b42318)!important}
.rt-steps-assignment{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;padding:0 11px 10px;font-size:12px}.rt-steps-assignment select{width:100%;min-width:0;max-width:360px}.rt-steps-type{padding:0 11px 10px;font-size:12px}.rt-steps-auto{display:flex;align-items:center;gap:7px;padding:0 11px 11px;font-size:12px}.rt-steps-auto input{flex:0 0 15px;width:15px;height:15px;margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.rt-steps-detail{padding:12px;border-top:1px solid var(--dsw-alias-border-l2);border-radius:0 0 8px 8px;background:var(--dsw-alias-interactive-bg-hover);display:grid;gap:9px;min-width:0}.rt-steps-field{display:grid;gap:5px;font-size:12px;min-width:0}.rt-steps-field textarea{min-width:0;min-height:85px;resize:vertical}.rt-steps-note{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.rt-steps-detail-tools,.rt-steps-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.rt-steps-detail-tools{justify-content:space-between}.rt-steps-group-head{margin:3px 0 8px}.rt-steps-group-head p{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.rt-steps-group-items{display:grid;gap:8px;padding-left:12px;border-left:2px solid var(--dsw-alias-border-l2);min-width:0}.rt-steps-stage-tools{display:flex;justify-content:flex-end;gap:4px;flex-wrap:wrap;margin-top:5px}.rt-steps-stage-tools button{padding:3px 6px;min-height:26px;font-size:12px}.rt-steps-bottom{margin-top:14px!important;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;color:var(--dsw-alias-label-secondary)}.rt-steps-legacy{padding:10px;margin-bottom:12px;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;display:grid;gap:8px;font-size:12px}
@container workflow-steps (max-width:380px){.rt-steps-stage{grid-template-columns:24px minmax(0,1fr);gap:6px}.rt-steps-index{width:24px;height:24px}.rt-steps-head{padding:7px;gap:5px}.rt-steps-assignment{padding:0 8px 9px;gap:6px}.rt-steps-auto{padding:0 8px 10px}.rt-steps-group-items{padding-left:8px}.rt-steps-detail{padding:9px}.rt-steps-list-head>button{padding:5px 8px!important}}
@media(pointer:coarse){.rt-workflow-steps button{min-height:44px}.rt-workflow-steps input,.rt-workflow-steps select,.rt-workflow-steps textarea{font-size:16px}.rt-steps-auto{min-height:44px}}
`;
