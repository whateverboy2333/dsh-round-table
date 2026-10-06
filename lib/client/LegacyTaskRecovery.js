import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { localScopeId, scopedLocal, uiButton as button } from "./ui-state.js";
import { emptyTaskDraft } from "./task-draft.js";
/** Only a previously authorized frozen request may use the removed manual path. */
export function LegacyTaskRecovery({ meetingId, onChanged, readOnly = false }) {
    const scope = useRef(localScopeId()).current, ownerMeeting = useRef(meetingId).current, currentMeeting = useRef(meetingId), alive = useRef(true), { readLocal, writeLocal, meetingCall } = scopedLocal(scope), key = `editor-save.${ownerMeeting}`;
    currentMeeting.current = meetingId;
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const current = () => alive.current && scope === localScopeId() && currentMeeting.current === ownerMeeting;
    const [pending, setPending] = useState(() => readLocal(key, undefined)), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const guard = useRef(false);
    const retry = async () => {
        if (!pending || guard.current || !current() || readOnly)
            return;
        guard.current = true;
        setBusy(true);
        setError('');
        let r = pending;
        const remember = (next) => { r = next; if (current())
            setPending(next); return writeLocal(key, next); };
        const settle = () => { remember(r); if (!writeLocal(`editor.${ownerMeeting}`, r.stage === 'completed' ? emptyTaskDraft() : r.editor) || !writeLocal(key, undefined))
            throw Error('结果已明确，本地恢复记录未能清理，请重试本地清理'); if (current())
            setPending(undefined); };
        try {
            if (!['completed', 'rejected'].includes(r.stage)) {
                try {
                    if (r.stage === 'draft') {
                        const v = await meetingCall(ownerMeeting, 'release-draft', { ...r.editor, id: r.editor.id ?? r.requestId });
                        if (r.release)
                            remember({ ...r, stage: 'release', draftId: v.draft.id, version: v.draft.version });
                    }
                    if (r.release)
                        await meetingCall(ownerMeeting, 'release', { draftId: r.draftId, version: r.version });
                    remember({ ...r, stage: 'completed' });
                }
                catch (e) {
                    const x = e;
                    if (x.requestState === 'rejected') {
                        remember({ ...r, stage: 'rejected', editor: r.stage === 'release' ? { ...r.editor, id: r.draftId, version: r.version } : r.editor });
                        settle();
                    }
                    throw e;
                }
            }
            settle();
            if (current())
                try {
                    await onChanged();
                }
                catch (e) {
                    setError(`原请求已处理，列表刷新失败：${e instanceof Error ? e.message : String(e)}；请刷新查看，不必再发原操作`);
                }
        }
        catch (e) {
            if (current())
                setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            guard.current = false;
            if (current())
                setBusy(false);
        }
    };
    if (!pending)
        return error ? _jsx("p", { role: "alert", children: error }) : null;
    return _jsxs("section", { role: "alert", "aria-label": "\u65E7\u4EFB\u52A1\u539F\u8BF7\u6C42\u5F85\u6838\u5B9E", children: [_jsx("b", { children: "\u65E7\u7248\u672C\u539F\u8BF7\u6C42\u6062\u590D" }), _jsx("p", { children: ['completed', 'rejected'].includes(pending.stage) ? '原请求结果已明确；重试仅完成本地清理。' : '这是此前已确认的冻结请求，请先核对投递记录；重试保持原请求编号与内容。' }), _jsxs("details", { children: [_jsx("summary", { children: "\u6838\u5BF9\u539F\u8981\u6C42\u548C\u8D23\u4EFB\u6210\u5458" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap' }, children: pending.editor.instruction }), _jsx("p", { children: pending.editor.recipientIds.join('、') })] }), _jsx("button", { style: button, disabled: readOnly || busy, onClick: () => void retry(), children: busy ? '核对中…' : '核对并重试原请求' }), error && _jsx("p", { role: "alert", children: error })] });
}
