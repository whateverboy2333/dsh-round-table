import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { scopedLocal, localScopeId, useLocalPersistence, uiButton as button, uiInput as input } from "./ui-state.js";
/** Shared by discussion, task and workflow. Opening/editing/previewing never sends. */
export function RevisionPanel({ meetingId, task, memberName, onChanged, onClose }) {
    const { readLocal, writeLocal, meetingCall } = scopedLocal(useRef(localScopeId()).current);
    const key = `revision.${meetingId}.${task.taskId}`;
    const persistence = useLocalPersistence();
    const [note, setNote] = useState(() => readLocal(key, task.reviewNote ?? '')), [preview, setPreview] = useState(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [pending, setPending] = useState(() => readLocal(key + '.pending', undefined));
    const guard = useRef(false);
    useEffect(() => { writeLocal(key, note); }, [note, key]);
    useEffect(() => { writeLocal(key + '.pending', pending ?? null); }, [pending, key]);
    const action = async (fn) => { if (guard.current)
        return; guard.current = true; setBusy(true); setError(''); try {
        await fn();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        guard.current = false;
        setBusy(false);
    } };
    const save = async () => { await meetingCall(meetingId, 'review-task', { taskId: task.taskId, review: 'changes_requested', note }); await onChanged(); };
    const finish = async (request) => {
        setPending(request);
        writeLocal(key + '.pending', request);
        try {
            await meetingCall(meetingId, 'revision-start', request);
        }
        catch (error) {
            const rejection = error;
            // Legacy servers returned this exact pre-commit fingerprint rejection as 400.
            // Other 400/5xx/connection errors must not be mistaken for proof of non-delivery.
            if (rejection.requestState === 'rejected' && [400, 409, 422].includes(rejection.status ?? 0) || rejection.status === 400 && rejection.message === '任务或输入已变化，请重新预览') {
                setPending(undefined);
                writeLocal(key + '.pending', null);
                setPreview(undefined);
                setNotice('本次发送已被明确拒绝，未创建修改任务。意见已保留，请重新预览。');
            }
            throw error;
        }
        setPending(undefined);
        writeLocal(key + '.pending', null);
        writeLocal(key, '');
        await onChanged();
        onClose();
    };
    return _jsxs("section", { role: "region", "aria-label": "\u4FEE\u6539\u610F\u89C1\u4E0E\u9884\u89C8", style: { border: '2px solid var(--dsw-alias-border-l2)', padding: 12, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }, children: [!persistence.available && _jsxs("p", { role: "alert", children: [persistence.reason, "\u3002\u672A\u4FDD\u5B58\u5230\u4F1A\u8BAE\u7684\u610F\u89C1\u4E0E\u53D1\u9001\u8BF7\u6C42\u4EC5\u672C\u6B21\u7A97\u53E3\u6709\u6548\uFF1B\u5173\u95ED\u524D\u8BF7\u590D\u5236\u610F\u89C1\u5E76\u6838\u5BF9\u539F\u8BF7\u6C42\u3002"] }), _jsxs("strong", { children: ["\u8981\u6C42\u4FEE\u6539 \u00B7 ", memberName] }), _jsx("p", { style: { margin: 0 }, children: "\u539F\u7ED3\u679C\u4FDD\u7559\u3002\u586B\u5199\u610F\u89C1\u540E\u9884\u89C8\uFF0C\u53EA\u6709\u201C\u786E\u8BA4\u53D1\u9001\u4FEE\u6539\u4EFB\u52A1\u201D\u624D\u901A\u77E5\u8FD9\u4F4D\u6210\u5458\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u5524\u9192\u5176\u4ED6\u4EBA\u3002" }), _jsxs("details", { children: [_jsx("summary", { children: "\u6838\u5BF9\u539F\u7ED3\u679C" }), _jsx("p", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: task.result })] }), _jsx("textarea", { "aria-label": "\u4FEE\u6539\u610F\u89C1", style: input, rows: 4, value: note, disabled: busy || !!pending, placeholder: "\u6307\u51FA\u9700\u8981\u6539\u54EA\u91CC\u3001\u4FDD\u7559\u4EC0\u4E48\uFF0C\u4EE5\u53CA\u5B8C\u6210\u6807\u51C6", onChange: e => { setNote(e.target.value); setPreview(undefined); setNotice(''); } }), _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [_jsx("button", { style: button, disabled: busy || !!pending || !note.trim(), onClick: () => { void action(async () => { await save(); setNotice('修改意见已保存，尚未发送。'); }); }, children: "\u4FDD\u5B58\u4FEE\u6539\u610F\u89C1" }), _jsx("button", { style: button, disabled: busy || !!pending || !note.trim(), onClick: () => { void action(async () => { await save(); const v = await meetingCall(meetingId, 'revision-preview', { taskId: task.taskId, note }); setPreview(v.plan); }); }, children: "\u9884\u89C8\u4FEE\u6539\u4EFB\u52A1" }), _jsx("button", { style: button, disabled: busy, onClick: onClose, children: "\u7A0D\u540E\u5904\u7406\uFF08\u4FDD\u7559\u8349\u7A3F\uFF09" })] }), preview && _jsxs("div", { role: "region", "aria-label": "\u4FEE\u6539\u4EFB\u52A1\u53D1\u9001\u786E\u8BA4", children: [_jsxs("b", { children: ["\u5C06\u4EC5\u53D1\u9001\u7ED9 ", memberName] }), _jsx("p", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: preview.instruction }), _jsxs("p", { children: ["\u9644\u5E26 ", preview.messageIds.length, " \u6761\u5DF2\u9009\u6D88\u606F\uFF0F\u539F\u7ED3\u679C\u3001", preview.assetIds.length, " \u4EFD\u9644\u4EF6\uFF1B\u539F\u4EFB\u52A1\u5173\u8054\u4FDD\u7559\u3002"] }), !preview.ready && _jsx("ul", { children: preview.missing.map(x => _jsx("li", { children: x }, x)) }), _jsx("button", { style: button, disabled: busy || !preview.ready || !!pending, onClick: () => { void action(() => finish({ taskId: task.taskId, note, fingerprint: preview.fingerprint, requestId: crypto.randomUUID(), confirmed: true })); }, children: "\u786E\u8BA4\u53D1\u9001\u4FEE\u6539\u4EFB\u52A1" }), _jsx("button", { style: button, disabled: busy, onClick: () => setPreview(undefined), children: "\u53D6\u6D88\u4FEE\u6539\u9884\u89C8" })] }), pending && !busy && _jsxs("p", { role: "alert", children: ["\u53D1\u9001\u7ED3\u679C\u5F85\u6838\u5B9E\uFF0C\u5148\u6838\u5BF9\u4EFB\u52A1\u8BB0\u5F55\u3002", _jsx("button", { style: button, onClick: () => { void action(() => finish(pending)); }, children: "\u91CD\u8BD5\u540C\u4E00\u6B21\u4FEE\u6539\u53D1\u9001" })] }), notice && _jsx("p", { role: "status", children: notice }), error && _jsx("p", { role: "alert", children: error })] });
}
