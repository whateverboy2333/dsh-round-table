import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { downloadText } from "./ui-state.js";
import { useScopedOperations } from "./use-scoped-operations.js";
const button = { font: 'inherit', padding: '5px 8px', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 6, background: 'var(--dsw-alias-bg-base)', color: 'inherit', cursor: 'pointer' };
export function MeetingManagement({ meeting, onChanged, onDeleted }) {
    const { meetingCall, isCurrent } = useScopedOperations();
    const [edit, setEdit] = useState(false), [title, setTitle] = useState(meeting.title), [description, setDescription] = useState(meeting.description ?? '');
    const [confirm, setConfirm] = useState(false), [notify, setNotify] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState();
    const [archiveConfirm, setArchiveConfirm] = useState(false), [sourceConfirm, setSourceConfirm] = useState(false);
    const refreshAccepted = async () => { if (!isCurrent())
        return; try {
        await onChanged();
    }
    catch (e) {
        if (isCurrent())
            setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`);
    } };
    const manage = async (action, body) => { if (busy || !isCurrent())
        return; setBusy(true); setError(undefined); try {
        await meetingCall(meeting.meetingId, action, body);
        await refreshAccepted();
    }
    catch (e) {
        if (isCurrent())
            setError(String(e instanceof Error ? e.message : e));
    }
    finally {
        if (isCurrent())
            setBusy(false);
    } };
    const act = async (action, body) => {
        if (busy || !isCurrent())
            return;
        setBusy(true);
        setError(undefined);
        try {
            const result = await meetingCall(meeting.meetingId, action, body);
            if (!isCurrent())
                return;
            if (action === 'delete') {
                const failed = result.deliveries?.filter(d => d.status !== 'delivered') ?? [];
                onDeleted(`会议已删除，普通成员会话保留。${failed.length ? `未送达通知：${failed.map(d => `${d.sessionId}（${d.error}）`).join('；')}` : ''}`);
            }
            else {
                setEdit(false);
                await refreshAccepted();
            }
        }
        catch (e) {
            if (isCurrent()) {
                setError(e instanceof Error ? e.message : String(e));
                try {
                    await onChanged();
                }
                catch { /* The original request error stays visible. */ }
            }
        }
        finally {
            if (isCurrent())
                setBusy(false);
        }
    };
    return _jsxs("section", { "data-meeting-management": "", style: { fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }, children: [_jsx("b", { children: "\u7EAA\u8981\u8BFB\u53D6\u8303\u56F4" }), _jsxs("p", { children: ["\u5F53\u524D\uFF1A", meeting.minutesSource === 'session' ? '参会期间原会话回复（可能含私聊）' : '仅正式会议资料', "\u3002\u751F\u6210\u524D\u53EF\u5728\u7EAA\u8981\u9875\u9884\u89C8\u8F93\u5165\u3002\u5DF2\u751F\u6210\u7684\u5386\u53F2\u7EAA\u8981\u4E0D\u81EA\u52A8\u6539\u5199\u3002"] }), _jsxs("div", { children: [_jsx("button", { style: button, disabled: busy || meeting.minutesSource !== 'session', onClick: () => { void manage('minutes-source', { source: 'formal' }); }, children: "\u53EA\u8BFB\u6B63\u5F0F\u8D44\u6599" }), _jsx("button", { style: button, disabled: busy || meeting.minutesSource === 'session', onClick: () => setSourceConfirm(true), children: "\u5305\u62EC\u539F\u4F1A\u8BDD\u56DE\u590D\u2026" })] }), sourceConfirm && _jsxs("div", { role: "alertdialog", "aria-label": "\u786E\u8BA4\u7EAA\u8981\u8303\u56F4", children: [_jsx("p", { children: "\u8FD9\u4F1A\u8BFB\u53D6\u6210\u5458\u53C2\u4F1A\u671F\u95F4\u7684\u539F\u4F1A\u8BDD\u56DE\u590D\uFF0C\u53EF\u80FD\u5305\u542B\u672A\u53D1\u5E03\u7684\u79C1\u804A\u3002\u662F\u5426\u5141\u8BB8\uFF1F" }), _jsx("button", { style: button, onClick: () => { void manage('minutes-source', { source: 'session', confirmed: true }); setSourceConfirm(false); }, children: "\u786E\u8BA4\u5141\u8BB8\u8BFB\u53D6" }), _jsx("button", { style: button, onClick: () => setSourceConfirm(false), children: "\u53D6\u6D88" })] }), _jsx("b", { children: "\u4FDD\u5B58\u4E0E\u6574\u7406" }), _jsxs("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [_jsx("button", { style: button, disabled: busy, onClick: () => { if (!isCurrent())
                            return; setBusy(true); void meetingCall(meeting.meetingId, 'export').then(v => { if (isCurrent())
                            downloadText(`${meeting.title.replace(/[\\/:*?"<>|]/g, '_')}.md`, v.markdown); }).catch(e => { if (isCurrent())
                            setError(String(e)); }).finally(() => { if (isCurrent())
                            setBusy(false); }); }, children: "\u5BFC\u51FA\u4F1A\u8BAE\u4E0E\u9A8C\u6536\u8BB0\u5F55" }), _jsx("button", { style: button, disabled: busy, onClick: () => meeting.archivedAt ? void manage('archive', { archived: false }) : setArchiveConfirm(true), children: meeting.archivedAt ? '恢复归档会议' : '结束并归档…' })] }), archiveConfirm && _jsxs("div", { role: "alertdialog", "aria-label": "\u786E\u8BA4\u5F52\u6863", children: [_jsx("p", { children: "\u4FDD\u7559\u5168\u90E8\u8D44\u6599\uFF0C\u7ED3\u675F\u672A\u5B8C\u6210\u7684\u4F1A\u8BAE\u7B49\u5F85\uFF0C\u4E0D\u505C\u6B62\u6216\u5220\u9664\u539F\u7A97\u53E3\u3002\u5F52\u6863\u540E\u53EF\u6062\u590D\u3002" }), _jsx("button", { style: button, onClick: () => { void manage('archive', { archived: true, confirmed: true }); setArchiveConfirm(false); }, children: "\u786E\u8BA4\u5F52\u6863" }), _jsx("button", { style: button, onClick: () => setArchiveConfirm(false), children: "\u53D6\u6D88" })] }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { style: button, type: "button", disabled: busy || !!meeting.deletion, onClick: () => { setTitle(meeting.title); setDescription(meeting.description ?? ''); setEdit(true); setConfirm(false); }, children: "\u7F16\u8F91\u4F1A\u8BAE\u4FE1\u606F" }), _jsx("button", { style: { ...button, color: 'var(--dsw-alias-state-error-primary)' }, type: "button", disabled: busy, onClick: () => { setConfirm(true); setEdit(false); }, children: "\u5220\u9664\u4F1A\u8BAE" })] }), edit && _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: [_jsxs("label", { children: ["\u4F1A\u8BAE\u6807\u9898", _jsx("input", { "aria-label": "\u7F16\u8F91\u4F1A\u8BAE\u6807\u9898", value: title, onChange: e => setTitle(e.target.value), disabled: busy })] }), _jsxs("label", { children: ["\u4F1A\u8BAE\u8BF4\u660E", _jsx("textarea", { "aria-label": "\u7F16\u8F91\u4F1A\u8BAE\u8BF4\u660E", value: description, onChange: e => setDescription(e.target.value), disabled: busy })] }), _jsxs("div", { children: [_jsx("button", { style: button, disabled: busy || !title.trim(), onClick: () => { void act('edit', { title, description }); }, children: "\u4FDD\u5B58\u4FEE\u6539" }), " ", _jsx("button", { style: button, disabled: busy, onClick: () => setEdit(false), children: "\u53D6\u6D88\u7F16\u8F91" })] })] }), meeting.secretaryTitleError && _jsxs("p", { role: "alert", children: ["\u4F1A\u8BAE\u5DF2\u6539\u540D\uFF0C\u79D8\u4E66\u540D\u79F0\u540C\u6B65\u5931\u8D25\uFF1A", meeting.secretaryTitleError, " ", _jsx("button", { style: button, disabled: busy || !!meeting.deletion, onClick: () => { void act('edit', { title: meeting.title, description: meeting.description ?? '' }); }, children: "\u91CD\u8BD5\u540C\u6B65\u540D\u79F0" })] }), meeting.deletion && _jsxs("p", { role: "alert", children: ["\u4F1A\u8BAE\u6B63\u5728\u5220\u9664\u6216\u5220\u9664\u672A\u5B8C\u6210\uFF0C\u4EC5\u53EF\u91CD\u8BD5\u5220\u9664\u3002", meeting.deletion.error] }), confirm && _jsxs("div", { role: "alertdialog", "aria-label": "\u786E\u8BA4\u6C38\u4E45\u5220\u9664\u4F1A\u8BAE", style: { border: '1px solid var(--dsw-alias-state-error-primary)', padding: 8, borderRadius: 8 }, children: [_jsxs("p", { children: ["\u6C38\u4E45\u5220\u9664\u4F1A\u8BAE\u300C", meeting.title, "\u300D\u3001\u5168\u90E8\u4F1A\u8BAE\u8BB0\u5F55\u53CA\u5176\u4E13\u5C5E\u79D8\u4E66\u4F1A\u8BDD\uFF0C\u65E0\u6CD5\u6062\u590D\u3002\u666E\u901A\u6210\u5458\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\u3002"] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: meeting.deletion?.notify ?? notify, onChange: e => setNotify(e.target.checked), disabled: busy || !!meeting.deletion }), "\u901A\u77E5\u666E\u901A\u53C2\u4F1A\u6210\u5458\u4F1A\u8BAE\u5DF2\u89E3\u6563"] }), _jsxs("div", { style: { marginTop: 8 }, children: [_jsx("button", { style: button, disabled: busy, onClick: () => setConfirm(false), children: "\u53D6\u6D88" }), " ", _jsx("button", { style: { ...button, color: 'var(--dsw-alias-state-error-primary)' }, disabled: busy, onClick: () => { void act('delete', { confirmed: true, notify }); }, children: busy ? '删除中…' : '永久删除' })] })] }), error && _jsx("p", { role: "alert", style: { overflowWrap: 'anywhere' }, children: error })] });
}
