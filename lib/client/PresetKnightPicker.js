import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/** 官方预设名册的只读选人器。
 * 不读取 .agent-presets，不编辑人格；创建实际走公开 agentPreset.list / session.create wire。
 */
import { useEffect, useState } from 'react';
const muted = { color: 'var(--dsw-alias-label-tertiary)' };
const button = { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 7, background: 'var(--dsw-alias-bg-base)', padding: '3px 8px', cursor: 'pointer', font: 'inherit' };
export function PresetKnightPicker({ api, workspaces, selected, onChange, followCurrentLabel }) {
    const [presets, setPresets] = useState();
    const [error, setError] = useState();
    const [loading, setLoading] = useState(false);
    const load = async () => {
        if (loading)
            return;
        setLoading(true);
        setError(undefined);
        try {
            const response = await api.agentPresets.list({});
            if (!response.result.ok)
                throw new Error(response.result.error.message);
            setPresets(response.result.value.presets);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => { void load(); }, []);
    const add = (presetId, workspaceId) => {
        const preset = presets?.find((item) => item.id === presetId);
        const presetName = preset?.name ?? presetId;
        onChange([...selected, { instanceId: crypto.randomUUID(), presetId, title: presetName, presetName, role: '参会成员', workspaceId }]);
    };
    const update = (instanceId, patch) => onChange(selected.map((item) => item.instanceId === instanceId ? { ...item, ...patch } : item));
    const field = { width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', font: 'inherit' };
    const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, fontSize: 12, minWidth: 0 };
    const card = { flex: 'none', minWidth: 0, padding: 10, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, boxSizing: 'border-box', overflowWrap: 'anywhere' };
    return _jsxs("section", { "data-round-table-preset-picker": "", style: { display: 'flex', flexDirection: 'column', flex: 'none', minWidth: 0, gap: 8 }, children: [_jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }, children: [_jsxs("span", { style: { fontSize: 12, fontWeight: 500 }, children: ["\u6309\u9884\u8BBE\u521B\u5EFA\u9A91\u58EB\uFF08", selected.length, " \u5DF2\u9009\uFF09"] }), _jsx("button", { type: "button", style: { ...button, flexShrink: 0, whiteSpace: 'nowrap' }, onClick: () => { void load(); }, disabled: loading, children: loading ? '读取中…' : '刷新名册' })] }), _jsx("p", { style: { margin: 0, fontSize: 11, lineHeight: '16px', ...muted }, children: "\u9A91\u58EB\u6765\u81EA\u5BBF\u4E3B\u5DF2\u58F0\u660E\u7684\u9884\u8BBE\uFF1B\u5706\u684C\u53EA\u8BA9\u4ED6\u4EEC\u8BAE\u4E8B\uFF0C\u4E0D\u4FEE\u6539\u9884\u8BBE\u914D\u7F6E\u3002" }), error !== undefined && _jsxs("p", { role: "alert", style: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: ["\u8BFB\u53D6\u9884\u8BBE\u5931\u8D25\uFF1A", error] }), presets?.map(preset => _jsxs("article", { "data-round-table-preset": preset.id, style: { ...card, opacity: preset.broken === undefined ? 1 : 0.55 }, children: [_jsxs("div", { style: { minWidth: 0, fontSize: 12, lineHeight: '18px' }, children: [_jsx("b", { children: preset.name ?? preset.id }), " ", _jsxs("small", { style: muted, children: ["[", preset.trust === undefined ? '已声明' : preset.trust === 'system' ? '出厂' : '用户', "]"] })] }), _jsx("p", { style: { margin: '4px 0 8px', minWidth: 0, fontSize: 12, lineHeight: '18px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...muted }, children: preset.description ?? preset.id }), preset.broken !== undefined && _jsxs("p", { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: ["\u4E0D\u53EF\u7528\uFF1A", preset.broken] }), _jsx("button", { type: "button", "data-round-table-add-instance": preset.id, style: { ...button, display: 'inline-flex', flexShrink: 0, whiteSpace: 'nowrap', maxWidth: '100%' }, disabled: preset.broken !== undefined, onClick: () => add(preset.id), children: "\u6DFB\u52A0\u5B9E\u4F8B" })] }, preset.id)), selected.map(item => _jsxs("article", { "data-round-table-knight": item.instanceId, style: card, children: [_jsx("b", { style: { fontSize: 12 }, children: item.presetName }), _jsxs("label", { style: labelStyle, children: ["\u9A91\u58EB\u540D", _jsx("input", { style: field, "data-round-table-knight-name": item.instanceId, value: item.title, onChange: event => update(item.instanceId, { title: event.target.value }) })] }), _jsxs("label", { style: labelStyle, children: ["\u804C\u8D23", _jsx("input", { style: field, "data-round-table-knight-role": item.instanceId, value: item.role, onChange: event => update(item.instanceId, { role: event.target.value }) })] }), _jsxs("label", { style: labelStyle, children: ["\u5DE5\u4F5C\u533A", _jsxs("select", { style: field, value: item.workspaceId ?? '', onChange: event => update(item.instanceId, event.target.value === '' ? { workspaceId: undefined } : { workspaceId: event.target.value }), children: [_jsx("option", { value: "", children: followCurrentLabel === undefined ? '跟随当前（未分区）' : `跟随当前（${followCurrentLabel}）` }), workspaces.map(workspace => _jsx("option", { value: workspace.workspaceId, children: workspace.title }, workspace.workspaceId))] })] }), _jsx("button", { type: "button", style: { ...button, marginTop: 8 }, onClick: () => onChange(selected.filter(candidate => candidate.instanceId !== item.instanceId)), children: "\u79FB\u9664" })] }, item.instanceId))] });
}
