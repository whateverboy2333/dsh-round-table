import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { uiButton as button, localScopeId } from "./ui-state.js";
import { useScopedOperations } from "./use-scoped-operations.js";
import { MeetingFolderPanel } from "./MeetingFolderPanel.js";
import { downloadMeetingAsset } from "./asset-upload-client.js";
export function ResourcesPanel({ meetingId, assets = [], templates = [], folder, folderError, archived = false, onChanged }) {
    const { meetingCall, isCurrent } = useScopedOperations(), scope = useRef(localScopeId()).current;
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [image, setImage] = useState();
    const run = async (fn) => { if (busy || !isCurrent())
        return; setBusy(true); setError(''); try {
        await fn();
    }
    catch (e) {
        if (isCurrent())
            setError(String(e instanceof Error ? e.message : e));
    }
    finally {
        if (isCurrent())
            setBusy(false);
    } };
    const refreshAccepted = async () => { if (!isCurrent())
        return; try {
        await onChanged();
    }
    catch (e) {
        if (isCurrent())
            setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`);
    } };
    const read = (a, preview) => run(async () => { if (a.referenceOnly || a.contentKind === 'file') {
        await downloadMeetingAsset(meetingId, a, scope, isCurrent);
        return;
    } const value = (await meetingCall(meetingId, 'asset-read', { id: a.id })).asset; if (!isCurrent())
        return; if (preview && a.image) {
        setImage(`data:${a.mimeType};base64,${value.data}`);
        return;
    } const data = Uint8Array.from(atob(value.data), (c) => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([data], { type: a.mimeType })), link = document.createElement('a'); link.href = url; link.download = a.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
    return _jsxs("section", { style: { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }, children: [_jsx(MeetingFolderPanel, { meetingId: meetingId, folder: folder, folderError: folderError, archived: archived, onChanged: onChanged }, meetingId), _jsx("b", { children: "\u4F1A\u8BAE\u8D44\u6599\u4E0E\u7248\u672C" }), _jsx("p", { children: "\u5C06\u56FE\u7247\u6216\u6587\u6863\u62D6\u5165\u8BA8\u8BBA\u533A\u52A0\u8F7D\uFF0C\u8FD9\u91CC\u5F52\u6863\u5DF2\u4FDD\u5B58\u7248\u672C\u3002\u52A0\u8F7D\u4E0D\u81EA\u52A8\u5524\u9192\u6210\u5458\u3002\u5728\u8BA8\u8BBA\u4E2D\u660E\u786E\u9009\u62E9\u8D44\u6599\u53EF\u53D1\u9001\u7ED9\u6210\u5458\uFF0C\u4E5F\u53EF\u7528\u4E8E\u751F\u6210\u4EFB\u52A1\u5361\u3002\u652F\u6301\u6587\u672C\u3001\u4EE3\u7801\u3001diff/patch\uFF0C\u4EE5\u53CA PNG\u3001JPEG\u3001WebP\uFF1B\u76F4\u63A5\u8BFB\u53D6\u7684\u56FE\u7247\u548C\u5C0F\u6587\u672C\u6BCF\u4EFD\u6700\u59272MB\uFF0C\u6587\u672C\u6700\u591A10\u4E07\u5B57\u7B26\uFF1B\u666E\u901A\u6587\u4EF6\u53EF\u4FDD\u7559\u5B8C\u6574\u539F\u4EF6\u5F15\u7528\uFF0C\u6700\u5927256MB\uFF0C\u672A\u81EA\u52A8\u89E3\u538B\u6216\u89E3\u6790\u3002" }), error && _jsx("p", { role: "alert", children: error }), busy && _jsx("p", { role: "status", children: "\u6B63\u5728\u5904\u7406\u8D44\u6599\u2026" }), image && _jsxs("div", { children: [_jsx("img", { alt: "\u4F1A\u8BAE\u56FE\u7247\u9884\u89C8", src: image, style: { maxWidth: '100%', maxHeight: 360, objectFit: 'contain' } }), _jsx("button", { style: button, onClick: () => setImage(undefined), children: "\u5173\u95ED\u56FE\u7247" })] }), !assets.length && _jsx("p", { children: "\u6682\u65E0\u9644\u4EF6\u3002\u9879\u76EE\u6587\u6863\u53EF\u4E0A\u4F20 Markdown \u6216\u6587\u672C\uFF0C\u4EE3\u7801\u6539\u52A8\u53EF\u4E0A\u4F20 diff/patch\u3002" }), assets.map(a => _jsxs("article", { style: { border: '1px solid var(--dsw-alias-border-l2)', padding: 10, borderRadius: 8, overflowWrap: 'anywhere' }, children: [_jsxs("b", { children: [a.name, " \u00B7 v", a.version] }), _jsxs("p", { children: [(a.bytes / 1024).toFixed(1), "KB \u00B7 ", new Date(a.createdAt).toLocaleString()] }), _jsx("button", { style: button, disabled: busy, onClick: () => { void read(a, false); }, children: "\u4E0B\u8F7D\u6B64\u7248\u672C" }), !!a.image && !a.referenceOnly && _jsx("button", { style: button, onClick: () => { void read(a, true); }, children: "\u9884\u89C8\u56FE\u7247" }), _jsxs("details", { children: [_jsx("summary", { children: "\u5185\u5BB9\u4E0E\u6821\u9A8C" }), _jsxs("small", { children: ["SHA256 ", a.sha256] }), a.referenceOnly && _jsx("p", { children: "\u5B8C\u6574\u539F\u4EF6\u5F15\u7528\uFF0C\u5185\u5BB9\u672A\u89E3\u6790\uFF1B\u4E0B\u8F7D\u4FDD\u7559\u6B64\u7248\u672C\u5B8C\u6574\u6587\u4EF6\uFF0C\u4E0D\u81EA\u52A8\u89E3\u538B\u3002" }), !a.referenceOnly && a.text && _jsx("pre", { style: { whiteSpace: 'pre-wrap' }, children: a.text })] })] }, a.id)), templates.length > 0 && _jsxs("details", { children: [_jsx("summary", { children: "\u5386\u53F2\u6A21\u677F\u540D\u79F0\uFF08\u53EA\u8BFB\uFF09" }), templates.map(t => _jsx("p", { children: t.title }, t.id))] })] });
}
