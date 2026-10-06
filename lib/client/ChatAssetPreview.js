import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScopedOperations } from "./use-scoped-operations.js";
import { uiButton as button, localScopeId } from "./ui-state.js";
import { downloadMeetingAsset } from "./asset-upload-client.js";
import { assetStyles } from "./asset-style.js";
function AssetTile({ meetingId, asset, onRemove, disabled, compact }) {
    const { meetingCall, isCurrent } = useScopedOperations(), [data, setData] = useState(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [open, setOpen] = useState(false), [retry, setRetry] = useState(0);
    const anchor = useRef(null), dialog = useRef(null), returnFocus = useRef(null), [layer, setLayer] = useState(null);
    const owner = useRef(localScopeId()).current;
    const [referenceMetadata, setReferenceMetadata] = useState();
    const identity = asset.id + ':' + asset.version + ':' + asset.sha256;
    useEffect(() => { let current = true; setData(undefined); setError(''); if (!asset.image || asset.referenceOnly)
        return; setBusy(true); void meetingCall(meetingId, 'asset-read', { id: asset.id }).then(v => { if (current && isCurrent())
        setData(v.asset.data); }).catch(e => { if (current && isCurrent())
        setError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (current && isCurrent())
        setBusy(false); }); return () => { current = false; }; }, [meetingId, identity, retry]);
    useEffect(() => { if (!open)
        return; setLayer(anchor.current?.closest('.rt-chat')?.querySelector('[data-rt-chat-floating-layer]') ?? null); const previously = typeof document === 'undefined' ? null : document.activeElement; returnFocus.current = typeof HTMLElement !== 'undefined' && previously instanceof HTMLElement ? previously : null; const timer = setTimeout(() => dialog.current?.querySelector('button')?.focus(), 0); return () => { clearTimeout(timer); returnFocus.current?.focus(); }; }, [open, layer]);
    const show = async () => {
        if (!isCurrent())
            return;
        if (data !== undefined) {
            setOpen(true);
            return;
        }
        setBusy(true);
        setError('');
        try {
            const value = await meetingCall(meetingId, 'asset-read', { id: asset.id });
            if (isCurrent()) {
                if (asset.referenceOnly && (value.asset.id !== asset.id || value.asset.sha256 !== asset.sha256 || value.asset.bytes !== asset.bytes))
                    throw Error('引用元信息与批准版本不同，未打开其他版本');
                if (asset.referenceOnly)
                    setReferenceMetadata(value.asset);
                else
                    setData(value.asset.data);
                setOpen(true);
            }
        }
        catch (e) {
            if (isCurrent())
                setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            if (isCurrent())
                setBusy(false);
        }
    };
    const close = () => setOpen(false);
    const image = !!asset.image && !asset.referenceOnly && data !== undefined ? `data:${asset.mimeType};base64,${data}` : undefined;
    const overlay = open && _jsxs("div", { ref: dialog, role: "dialog", "aria-modal": "true", "aria-label": `附件预览 ${asset.name}`, className: "rt-asset-overlay", onKeyDown: e => { if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
        else if (e.key === 'Tab') {
            const controls = Array.from(dialog.current?.querySelectorAll('button,[href],[tabindex="0"]') ?? []), first = controls[0], last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        } }, children: [_jsxs("header", { children: [_jsxs("b", { children: [asset.name, " \u00B7 v", asset.version] }), _jsx("button", { style: button, onClick: close, children: "\u5173\u95ED\u9644\u4EF6\u9884\u89C8" })] }), asset.referenceOnly ? _jsxs("section", { "aria-label": "\u5B8C\u6574\u6587\u4EF6\u5F15\u7528", children: [_jsx("p", { children: "\u5B8C\u6574\u539F\u4EF6\u5DF2\u4FDD\u5B58\uFF1B\u672A\u81EA\u52A8\u89E3\u538B\u6216\u89E3\u6790\uFF0C\u672C\u6B21\u5F15\u7528\u4E0D\u5411\u6A21\u578B\u53D1\u9001\u4E8C\u8FDB\u5236\u5185\u5BB9\u3002" }), _jsxs("p", { children: [asset.name, " \u00B7 ", (asset.bytes / 1024 / 1024).toFixed(2), "MB \u00B7 ", asset.mimeType] }), _jsxs("p", { children: ["\u4FDD\u5B58\u4F4D\u7F6E\uFF1A", referenceMetadata?.fileReference?.folderPath ? `${referenceMetadata.fileReference.folderPath}/${referenceMetadata.fileReference.relativePath}` : referenceMetadata?.fileReference?.relativePath ?? (referenceMetadata?.storageLocation === 'internal-assets' ? '本会资料档案（工作区目录尚未关联）' : referenceMetadata?.storageLabel ?? '保存位置暂未核验')] }), _jsxs("small", { children: ["\u6279\u51C6\u7248\u672C v", asset.version, " \u00B7 SHA256 ", asset.sha256] }), _jsx("p", { children: _jsx("button", { style: button, disabled: busy, onClick: () => { if (!isCurrent())
                                return; setBusy(true); void downloadMeetingAsset(meetingId, asset, owner, isCurrent).catch(e => { if (isCurrent())
                                setError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (isCurrent())
                                setBusy(false); }); }, children: "\u4E0B\u8F7D\u6B64\u7248\u672C\u539F\u4EF6" }) })] }) : image ? _jsx("img", { alt: `${asset.name} 原图 · v${asset.version}`, src: image, style: { maxWidth: '100%', maxHeight: 'calc(100% - 70px)', objectFit: 'contain' } }) : _jsx("pre", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'auto' }, children: data === undefined ? '正在读取…' : new TextDecoder().decode(Uint8Array.from(atob(data), c => c.charCodeAt(0))) }), _jsxs("small", { children: ["\u672C\u4F1A\u5F52\u6863\u539F\u4EF6 \u00B7 ", asset.bytes, "\u5B57\u8282 \u00B7 \u7248\u672C", asset.version, "\uFF1B\u9884\u89C8\u4E0E\u79FB\u9664\u8349\u7A3F\u5F15\u7528\u5747\u4E0D\u5524\u9192\u6210\u5458\u3002"] })] });
    const remove = () => { if (onRemove && !disabled && isCurrent())
        onRemove(); };
    return _jsxs("div", { ref: anchor, className: `rt-asset-tile ${compact ? 'compact' : ''}`, "data-asset-preview": asset.id, "data-asset-kind": asset.image ? 'image' : 'file', onKeyDown: e => { if (!onRemove || disabled || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent?.isComposing || e.keyCode === 229)
            return; if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]'))
            return; if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            e.stopPropagation();
            remove();
        } }, children: [_jsx("button", { type: "button", className: "rt-asset-preview", title: `${asset.name} · v${asset.version} · 点击预览`, "aria-label": `预览${asset.image ? '图片' : '文件'} ${asset.name} · v${asset.version}`, disabled: busy, onClick: () => { void show(); }, children: asset.image ? (image ? _jsx("img", { alt: `${asset.name} 缩略图`, src: image }) : _jsx("span", { className: "rt-asset-loading", children: "\u56FE\u7247\u52A0\u8F7D\u4E2D\u2026" })) : _jsxs(_Fragment, { children: [_jsxs("svg", { className: "rt-asset-file-icon", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [_jsx("rect", { x: "3", y: "2", width: "10", height: "12", rx: "1.5", stroke: "currentColor" }), _jsx("path", { d: "M5.5 5h5M5.5 8h5M5.5 11h3", stroke: "currentColor" })] }), _jsx("span", { className: "rt-asset-file-name", children: asset.name })] }) }), onRemove && _jsx("button", { type: "button", className: "rt-asset-remove", disabled: disabled, "aria-label": `移除草稿附件 ${asset.name}`, title: `移除 ${asset.name} 的草稿引用`, onClick: remove, children: _jsx("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: _jsx("path", { d: "m3 3 6 6m0-6L3 9", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }) }) }), busy && _jsx("small", { role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u539F\u4EF6\u2026" }), error && _jsxs("p", { role: "alert", className: "rt-asset-error", children: ["\u9884\u89C8\u672A\u6210\u529F\uFF1A", error, " ", _jsx("button", { style: button, onClick: () => { asset.image ? setRetry(x => x + 1) : void show(); }, children: "\u91CD\u8BD5\u8BFB\u53D6" })] }), overlay && (layer ? createPortal(overlay, layer) : overlay)] });
}
export function ChatAssetPreview({ meetingId, assets, assetIds, onRemove, disabled, compact = false }) {
    const selected = [...new Set(assetIds)], ordered = [...selected.filter(id => assets.find(a => a.id === id)?.image), ...selected.filter(id => !assets.find(a => a.id === id)?.image)];
    const tile = (id) => { const asset = assets.find(a => a.id === id); return asset ? _jsx(AssetTile, { meetingId: meetingId, asset: asset, disabled: disabled, compact: compact, onRemove: onRemove ? () => onRemove(id) : undefined }, asset.id + ':' + asset.version) : _jsxs("span", { role: "alert", children: ["\u5F15\u7528\u7684\u5386\u53F2\u9644\u4EF6\u672A\u627E\u5230\uFF0C\u8BF7\u6838\u5BF9\u8D44\u6599\u6765\u6E90\u3002", onRemove && _jsx("button", { style: button, disabled: disabled, onClick: () => { if (!disabled)
                    onRemove(id); }, children: "\u79FB\u9664\u7F3A\u5931\u5F15\u7528" })] }, id); };
    return _jsxs("div", { className: `rt-asset-list ${compact ? 'compact' : ''}`, "aria-label": onRemove ? '草稿附件' : '消息附件', children: [_jsx("style", { children: assetStyles }), compact ? _jsxs(_Fragment, { children: [_jsx("div", { className: "rt-asset-images", children: ordered.filter(id => assets.find(a => a.id === id)?.image).map(tile) }), _jsx("div", { className: "rt-asset-files", children: ordered.filter(id => !assets.find(a => a.id === id)?.image).map(tile) })] }) : ordered.map(tile)] });
}
