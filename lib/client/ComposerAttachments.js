import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { scopedLocal, localScopeId, uiButton as button } from "./ui-state.js";
import { uploadFileReference } from "./asset-upload-client.js";
export const ACCEPTED_MEETING_FILES = '.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.diff,.patch,.yaml,.yml,.log,.html,.css,.xml,.sql,.png,.jpg,.jpeg,.webp';
export function ComposerAttachments({ meetingId, disabled, onUploaded, onBlockingChange, register }) {
    const scope = useRef(localScopeId()).current, { meetingCall } = scopedLocal(scope), [items, setItems] = useState([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), live = useRef([]), alive = useRef(true), disabledRef = useRef(disabled), cancelled = useRef(new Set());
    disabledRef.current = disabled;
    const update = (next) => { live.current = next; if (alive.current) {
        setItems(next);
        onBlockingChange(next.length > 0);
    } };
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const upload = async (entry) => {
        try {
            const invalid = (message) => Object.assign(Error(message), { retryable: false });
            if (entry.file.size === 0)
                throw invalid('空文件未加载；请保留原件，此限制不能通过重试改变。');
            const extension = entry.file.name.split('.').at(-1)?.toLowerCase(), mimeType = entry.file.type || { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[extension ?? ''] || 'text/plain';
            const readable = ['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) || ACCEPTED_MEETING_FILES.split(',').some(ext => entry.file.name.toLowerCase().endsWith(ext));
            if (entry.file.size > 2 * 1024 * 1024 || !readable) {
                const asset = await uploadFileReference(meetingCall, meetingId, entry.file, entry.id, () => cancelled.current.has(entry.id) || scope !== localScopeId(), loaded => update(live.current.map(x => x.id === entry.id ? { ...x, loaded } : x)));
                if (asset && !cancelled.current.has(entry.id))
                    onUploaded(asset);
                update(live.current.filter(x => x.id !== entry.id));
                return;
            }
            const bytes = new Uint8Array(await entry.file.arrayBuffer());
            if (scope !== localScopeId())
                throw Error('DSH实例已切换，请回原会议重试；未发送资料');
            if (cancelled.current.has(entry.id))
                return;
            let binary = '';
            for (const byte of bytes)
                binary += String.fromCharCode(byte);
            const value = await meetingCall(meetingId, 'asset-upload', { name: entry.file.name, mimeType, data: btoa(binary), record: false });
            // Archival succeeded even if the component was closed meanwhile. The parent
            // saves this association to its original scoped draft, never a new meeting.
            if (!cancelled.current.has(entry.id))
                onUploaded(value.asset);
            update(live.current.filter(x => x.id !== entry.id));
        }
        catch (e) {
            const error = e;
            update(live.current.map(x => x.id === entry.id ? { ...x, status: 'failed', error: e instanceof Error ? e.message : String(e), retryable: error.retryable !== false && ![400, 413, 415, 422].includes(error.status ?? 0) } : x));
        }
    };
    const receive = (files) => {
        if (disabledRef.current || scope !== localScopeId() || !alive.current)
            return;
        setError('');
        setNotice('');
        const next = files.filter(file => !live.current.some(x => x.file.name === file.name && x.file.size === file.size && x.file.lastModified === file.lastModified)).map(file => ({ id: crypto.randomUUID(), file, status: 'uploading', attempt: 1 }));
        update([...live.current, ...next]);
        for (const item of next)
            void upload(item);
    };
    useEffect(() => { register(receive); return () => register(() => { }); }, [meetingId]);
    if (!items.length && !error && !notice)
        return null;
    return _jsxs("section", { className: "rt-compose-uploads", "aria-label": "\u76F4\u63A5\u6DFB\u52A0\u4F1A\u8BAE\u8D44\u6599", children: [_jsx("style", { children: `.rt-native-upload-list{display:flex;flex-direction:column;gap:3px;min-width:0}.rt-native-upload{display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;padding:2px 0;font-size:13px}.rt-native-upload-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-state-business-primary,#3964fe)}.rt-native-upload-icon{width:14px;height:14px;flex:none;color:var(--dsw-alias-state-business-primary,#3964fe)}.rt-native-upload-remove{flex:none;width:18px;height:18px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#65758b);padding:0;display:grid;place-items:center;border-radius:50%;cursor:pointer;opacity:0}.rt-native-upload:hover .rt-native-upload-remove,.rt-native-upload:focus-within .rt-native-upload-remove{opacity:1}.rt-native-upload-state{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#65758b)}.rt-native-upload-state.error{color:var(--dsw-alias-error-primary,#b42318)}@media(pointer:coarse){.rt-native-upload-remove{opacity:1}}` }), _jsx("div", { className: "rt-native-upload-list", children: items.map(item => _jsxs("div", { className: "rt-native-upload", "data-upload-item": item.id, title: `${item.file.name} · ${(item.file.size / 1024).toFixed(1)}KB${item.error ? ' · ' + item.error : ''}`, children: [_jsxs("svg", { className: "rt-native-upload-icon", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [_jsx("rect", { x: "3", y: "2", width: "10", height: "12", rx: "1.5", stroke: "currentColor" }), _jsx("path", { d: "M5.5 5h5M5.5 8h5M5.5 11h3", stroke: "currentColor" })] }), _jsx("span", { className: "rt-native-upload-name", children: item.file.name }), item.status === 'uploading' ? _jsx("small", { className: "rt-native-upload-state", role: "status", children: item.loaded ? '加载中 ' + Math.round(item.loaded / item.file.size * 100) + '%' : '加载中…' }) : _jsx("span", { className: "rt-native-upload-state error", role: "alert", "aria-label": item.error, title: item.error, children: "\u672A\u52A0\u8F7D" }), item.status === 'failed' && item.retryable !== false && _jsxs("button", { style: button, disabled: disabled, onClick: () => { const next = { ...item, status: 'uploading', attempt: item.attempt + 1, error: undefined }; update(live.current.map(x => x.id === item.id ? next : x)); void upload(next); }, children: ["\u91CD\u8BD5\u4FDD\u5B58 ", item.file.name] }), _jsx("button", { type: "button", className: "rt-native-upload-remove", disabled: disabled, "aria-label": item.status === 'uploading' ? `取消草稿关联 ${item.file.name}` : `移除未保存文件 ${item.file.name}`, title: `移除 ${item.file.name} 的草稿引用`, onClick: () => { if (disabledRef.current)
                                return; cancelled.current.add(item.id); update(live.current.filter(x => x.id !== item.id)); if (item.status === 'uploading')
                                setNotice('已移除草稿关联；可能已归档的原件保留，不加入消息。'); }, children: "\u00D7" })] }, item.id)) }), error && _jsx("p", { role: "alert", children: error }), notice && _jsx("p", { role: "status", children: notice })] });
}
