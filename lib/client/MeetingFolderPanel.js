import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useScopedOperations } from "./use-scoped-operations.js";
import { uiButton as button, downloadText } from "./ui-state.js";
export function MeetingFolderPanel({ meetingId, folder, folderError, archived, onChanged }) {
    const { meetingCall, isCurrent } = useScopedOperations(), [snapshot, setSnapshot] = useState(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [query, setQuery] = useState(''), [preview, setPreview] = useState();
    const checkEpoch = useRef(0);
    const check = async () => { const epoch = ++checkEpoch.current; try {
        const v = await meetingCall(meetingId, 'meeting-folder-status');
        if (isCurrent() && epoch === checkEpoch.current) {
            setSnapshot(v.snapshot);
            setError('');
        }
    }
    catch (e) {
        if (isCurrent() && epoch === checkEpoch.current)
            setError(e instanceof Error ? e.message : String(e));
    } };
    useEffect(() => { if (folder)
        void check(); }, [folder?.path, folder?.instructionsSha256, folder?.instructionsVersion, JSON.stringify(folder?.files)]);
    const connect = async () => { if (busy || archived || !isCurrent())
        return; setBusy(true); setError(''); try {
        await meetingCall(meetingId, 'meeting-folder-connect', { confirmed: true });
        if (isCurrent()) {
            setConfirm(false);
            await onChanged();
            await check();
        }
    }
    catch (e) {
        if (isCurrent())
            setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        if (isCurrent())
            setBusy(false);
    } };
    const read = async (ref) => { if (busy)
        return; setBusy(true); setError(''); try {
        const { file } = await meetingCall(meetingId, 'meeting-file-read', { fileId: ref.fileId });
        if (!isCurrent())
            return;
        setPreview({ name: ref.name, referenceOnly: file.referenceOnly, text: file.referenceOnly ? '完整原件引用，内容未解析；不自动解压或向模型传入二进制。保存位置：' + ref.relativePath + ' · ' + ref.size + '字节 · v' + ref.version + ' · SHA256 ' + ref.sha256 : file.text, ...(!file.referenceOnly && file.data && ref.mimeType?.startsWith('image/') ? { image: `data:${ref.mimeType};base64,${file.data}` } : {}) });
    }
    catch (e) {
        if (isCurrent())
            setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        if (isCurrent())
            setBusy(false);
    } };
    return _jsxs("section", { "aria-label": "\u672C\u4F1A\u5DE5\u4F5C\u533A\u76EE\u5F55", style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 10 }, children: [_jsx("b", { children: "\u672C\u4F1A\u5DE5\u4F5C\u533A\u76EE\u5F55" }), snapshot?.instructionsText !== undefined && _jsxs("details", { children: [_jsx("summary", { children: "\u5F53\u524D\u6279\u51C6\u7684\u4F1A\u8BAE\u8BF4\u660E" }), _jsx("small", { children: snapshot.instructionsPath }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: snapshot.instructionsText })] }), folder ? _jsxs(_Fragment, { children: [_jsx("p", { style: { overflowWrap: 'anywhere' }, children: folder.path }), _jsx("p", { children: "\u539F\u6210\u5458\u901A\u8FC7\u4F1A\u8BAE\u53EA\u8BFB\u5DE5\u5177\u8BFB\u53D6\u5DF2\u6838\u9A8C\u7248\u672C\uFF1B\u79D8\u4E66\u4F7F\u7528\u5B9E\u9645\u8BFB\u53D6\u7684\u6587\u672C\u5FEB\u7167\u3002\u4EFB\u52A1\u53D1\u5E03\u3001\u6210\u679C\u548C\u7EAA\u8981\u5148\u5199\u5165\u6B64\u76EE\u5F55\u3002" }), _jsx("button", { style: button, disabled: busy, onClick: () => void check(), children: "\u6838\u5BF9\u76EE\u5F55\u4E0E\u6587\u4EF6" }), snapshot && _jsxs("p", { role: "status", children: [snapshot.integrity === 'ok' ? '已核对当前说明、索引和文件版本' : '目录核验未通过，不能用于新执行', snapshot.errors.length ? `：${snapshot.errors.join('；')}` : ''] }), _jsx("input", { "aria-label": "\u641C\u7D22\u4F1A\u8BAE\u6587\u4EF6", value: query, onChange: e => setQuery(e.target.value), placeholder: "\u641C\u7D22\u6750\u6599\u3001\u4EFB\u52A1\u5361\u3001\u6210\u679C\u6216\u7EAA\u8981" }), folder.files.filter(f => `${f.name} ${f.kind} ${f.relativePath}`.toLowerCase().includes(query.toLowerCase())).map(f => _jsxs("div", { style: { paddingTop: 8 }, children: [_jsxs("button", { style: button, disabled: busy, onClick: () => void read(f), children: [f.name, " \u00B7 v", f.version] }), _jsx("small", { style: { marginLeft: 6 }, children: f.relativePath })] }, f.fileId))] }) : _jsxs(_Fragment, { children: [_jsx("p", { children: "\u672C\u4F1A\u5C1A\u672A\u5173\u8054\u76EE\u5F55\u3002\u786E\u8BA4\u540E\u4F1A\u5728\u539F\u4F1A\u8BAE\u5DE5\u4F5C\u533A\u5EFA\u7ACB\u7A33\u5B9A\u76EE\u5F55\u5E76\u590D\u5236\u5DF2\u6709\u6750\u6599\u3001\u4EFB\u52A1\u3001\u6210\u679C\u4E0E\u7EAA\u8981\uFF0C\u4E0D\u901A\u77E5\u6210\u5458\u6267\u884C\u3002" }), folderError && _jsx("p", { role: "alert", children: folderError }), _jsx("button", { style: button, disabled: busy || archived, onClick: () => setConfirm(true), children: "\u5173\u8054\u672C\u4F1A\u76EE\u5F55\u2026" })] }), confirm && _jsxs("div", { role: "alertdialog", "aria-label": "\u786E\u8BA4\u5173\u8054\u4F1A\u8BAE\u76EE\u5F55", children: [_jsx("p", { children: "\u4FDD\u7559\u539F\u4F1A\u8BAE\u6570\u636E\uFF0C\u5728\u672C\u4F1A\u5DE5\u4F5C\u533A\u4FDD\u5B58\u5386\u53F2\u7248\u672C\uFF1B\u4E0D\u542F\u52A8\u4EFB\u52A1\u6216\u6A21\u578B\u3002" }), _jsx("button", { style: button, disabled: busy, onClick: () => void connect(), children: "\u786E\u8BA4\u5173\u8054\u5E76\u4FDD\u5B58\u5386\u53F2\u6587\u4EF6" }), _jsx("button", { style: button, disabled: busy, onClick: () => setConfirm(false), children: "\u53D6\u6D88" })] }), preview && _jsxs("div", { "aria-label": "\u4F1A\u8BAE\u6587\u4EF6\u9884\u89C8", children: [_jsx("b", { children: preview.name }), preview.image ? _jsx("img", { alt: preview.name, src: preview.image, style: { maxWidth: '100%', maxHeight: 360 } }) : _jsx("pre", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 420, overflow: 'auto' }, children: preview.text ?? '此版本为二进制文件' }), preview.text !== undefined && !preview.referenceOnly && _jsx("button", { style: button, onClick: () => downloadText(preview.name, preview.text), children: "\u4FDD\u5B58\u6587\u672C\u526F\u672C" }), _jsx("button", { style: button, onClick: () => setPreview(undefined), children: "\u5173\u95ED\u9884\u89C8" })] }), error && _jsx("p", { role: "alert", children: error })] });
}
