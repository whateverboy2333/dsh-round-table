import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ComposerAttachments } from "./ComposerAttachments.js";
import { PANEL_FILE_DROP, PANEL_FILE_DRAG } from "./panel-file-drop.js";
import { ChatAssetPreview } from "./ChatAssetPreview.js";
import { assetStyles } from "./asset-style.js";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { emptyChatDraft, restoreChatDraft, mentionAt } from "./chat-draft.js";
import { scopedLocal, localScopeId, useLocalPersistence, uiButton as button, uiInput as input } from "./ui-state.js";
export function HostingComposer({ meetingId, run, members, messages, assets, paused, archived, prepared, onPrepared, onChanged, onNavigate, onCreateTask, memberStatus = {}, draftRunIds = [] }) {
    const ownerScope = useRef(localScopeId()).current, { readLocal, writeLocal, meetingCall } = scopedLocal(ownerScope);
    const persistence = useLocalPersistence();
    const storageKey = `hosting.${meetingId}.${run?.id ?? 'plain'}`;
    const [draft, setDraft] = useState(() => restoreChatDraft(readLocal(storageKey, emptyChatDraft())));
    const [pending, setPending] = useState(() => readLocal(`${storageKey}.pending`, undefined));
    const [picker, setPicker] = useState(), [option, setOption] = useState(0), [pickerPosition, setPickerPosition] = useState({ maxHeight: 280 });
    const [plan, setPlan] = useState(), [checking, setChecking] = useState(false), [previewRevision, setPreviewRevision] = useState(0);
    const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [rosterChanged, setRosterChanged] = useState(false);
    const guard = useRef(false), textarea = useRef(null), composer = useRef(null), composing = useRef(false), pasted = useRef(false), liveDraft = useRef(draft), alive = useRef(true);
    const [removeAsset, setRemoveAsset] = useState();
    const [uploadedAssets, setUploadedAssets] = useState([]), [attachmentsBlocked, setAttachmentsBlocked] = useState(false), [dragging, setDragging] = useState(false), uploadReceiver = useRef(() => { });
    const pickerSearch = useRef(null), pickerMenu = useRef(null), pickerAnchor = useRef(null);
    const [pickerLayer, setPickerLayer] = useState(null);
    const rosterKey = JSON.stringify(members), lastRoster = useRef(rosterKey);
    liveDraft.current = draft;
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { writeLocal(storageKey, draft); }, [draft, storageKey]);
    useEffect(() => { writeLocal(`${storageKey}.pending`, pending ?? null); }, [pending, storageKey]);
    useEffect(() => { if (lastRoster.current !== rosterKey && draft.recipientIds.length)
        setRosterChanged(true); lastRoster.current = rosterKey; }, [rosterKey]);
    useEffect(() => { if (prepared) {
        setDraft(d => ({ ...d, messageIds: [...new Set([...d.messageIds, ...prepared.messageIds])], ...(prepared.contextTaskId ? { contextTaskId: prepared.contextTaskId } : {}), ...(prepared.recipientIds ? { recipientIds: [...new Set([...d.recipientIds, ...prepared.recipientIds])], intent: 'response' } : {}) }));
        setNotice(prepared.purpose === 'task-card' ? '已引用到任务卡生成草稿；选择 @成员后点击任务卡生成，引用本身没有发给任何人。' : prepared.contextTaskId ? '已关联原工作，只发送澄清或补充，不另建任务。' : '已引用，选择 @成员后发送。');
        textarea.current?.focus();
        onPrepared?.();
    } }, [prepared?.nonce]);
    useEffect(() => { const area = textarea.current; if (area) {
        area.style.height = 'auto';
        area.style.height = Math.min(150, Math.max(64, area.scrollHeight)) + 'px';
    } }, [draft.instruction]);
    useEffect(() => {
        if (!picker || !composer.current)
            return;
        const box = composer.current, chat = box.closest('.rt-chat'), layer = chat?.querySelector('[data-rt-chat-floating-layer]');
        if (!chat || !layer)
            return;
        setPickerLayer(layer);
        let frame = 0;
        const fit = () => {
            const boundary = chat.getBoundingClientRect(), origin = layer.getBoundingClientRect(), anchor = (pickerAnchor.current ?? box).getBoundingClientRect();
            // Keep the panel in this chat pane, including when the host clips or resizes it.
            const left = Math.max(boundary.left, 0) + 8, right = Math.min(boundary.right, window.innerWidth) - 8, top = Math.max(boundary.top, 0) + 8, bottom = Math.min(boundary.bottom, window.innerHeight) - 8;
            const width = Math.max(1, Math.min(310, right - left)), above = Math.max(0, Math.min(anchor.top - 8, bottom) - top), below = Math.max(0, bottom - Math.max(anchor.bottom + 8, top)), up = above >= Math.min(320, bottom - top) || above >= below;
            const maxHeight = Math.max(1, Math.min(320, up ? above : below));
            setPickerPosition({ left: Math.max(left, Math.min(anchor.left, right - width)) - origin.left, right: 'auto', width, maxHeight, visibility: 'visible', ...(up ? { top: 'auto', bottom: origin.bottom - Math.min(anchor.top - 8, bottom) } : { top: Math.max(anchor.bottom + 8, top) - origin.top, bottom: 'auto' }) });
        };
        const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
        fit();
        schedule();
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : undefined;
        for (const node of [chat, box, layer, pickerAnchor.current])
            if (node)
                observer?.observe(node);
        // Capture scroll from local textarea/material regions and host ancestor panes.
        window.addEventListener('resize', schedule);
        window.addEventListener('scroll', schedule, true);
        return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); };
    }, [!!picker, pickerLayer]);
    useEffect(() => { if (picker)
        pickerSearch.current?.focus(); }, [!!picker, pickerLayer]);
    useEffect(() => { if (picker)
        pickerMenu.current?.querySelector('.rt-chat-options .active')?.scrollIntoView({ block: 'nearest' }); }, [option, picker?.query, pickerLayer]);
    const closePicker = () => { setPicker(undefined); pickerAnchor.current?.focus(); };
    const change = (patch) => { const next = { ...liveDraft.current, ...patch }; if (JSON.stringify(next) === JSON.stringify(liveDraft.current))
        return; liveDraft.current = next; setDraft(next); setPlan(undefined); setError(''); setNotice(''); };
    const requestRemoveAsset = (id) => { if (guard.current || pending || busy || archived || ownerScope !== localScopeId())
        return; const sourceIds = messages.filter(m => liveDraft.current.messageIds.includes(m.id) && m.assetIds?.includes(id)).map(m => m.id); if (sourceIds.length)
        setRemoveAsset({ id, sourceIds });
    else {
        change({ assetIds: liveDraft.current.assetIds.filter(a => a !== id) });
        textarea.current?.focus();
    } };
    const confirmRemoveAsset = () => { if (!removeAsset || pending || busy)
        return; const current = messages.filter(m => liveDraft.current.messageIds.includes(m.id) && m.assetIds?.includes(removeAsset.id)).map(m => m.id); if (JSON.stringify(current) !== JSON.stringify(removeAsset.sourceIds)) {
        setRemoveAsset({ id: removeAsset.id, sourceIds: current });
        setError('资料引用已变化，请重新核对影响后确认移除。');
        return;
    } change({ assetIds: liveDraft.current.assetIds.filter(a => a !== removeAsset.id), messageIds: liveDraft.current.messageIds.filter(id => !removeAsset.sourceIds.includes(id)) }); setRemoveAsset(undefined); textarea.current?.focus(); };
    const normalMode = draft.recipientIds.length && draft.intent !== 'record' ? 'send' : 'record';
    const payload = { mode: normalMode, kind: 'message', instruction: draft.instruction, messageIds: draft.messageIds, assetIds: draft.assetIds, recipientIds: normalMode === 'record' ? [] : draft.recipientIds, runId: run?.id ?? null, ...(draft.contextTaskId ? { contextTaskId: draft.contextTaskId } : {}) };
    const selected = messages.filter(m => draft.messageIds.includes(m.id)), selectedAssetIds = [...new Set([...draft.assetIds, ...selected.flatMap(m => m.assetIds ?? [])])];
    const contextKey = JSON.stringify({ payload, members, selected, assets: assets.filter(a => selectedAssetIds.includes(a.id)), paused, archived, attachmentsBlocked, run: run ? { id: run.id, status: run.status, paused: run.paused, workReserved: run.workReserved, budgetGrants: run.budgetGrants } : null });
    useEffect(() => {
        let current = true;
        setPlan(undefined);
        setError('');
        if (!payload.instruction.trim() && !payload.assetIds.length && !payload.messageIds.length || archived || pending || attachmentsBlocked) {
            setChecking(false);
            return;
        }
        setChecking(true);
        const timer = setTimeout(() => { void meetingCall(meetingId, 'chat-preview', { input: payload }).then(v => { if (current) {
            setPlan({ key: contextKey, value: v.plan });
            setChecking(false);
        } }).catch(e => { if (current) {
            setError(String(e instanceof Error ? e.message : e));
            setChecking(false);
        } }); }, 160);
        return () => { current = false; clearTimeout(timer); };
    }, [contextKey, !!pending, previewRevision]);
    const currentPlan = plan?.key === contextKey ? plan.value : undefined;
    const visibleAssets = [...assets, ...uploadedAssets.filter(a => !assets.some(existing => existing.id === a.id))];
    const imageBlocked = payload.mode === 'send' && selectedAssetIds.some(id => visibleAssets.some(a => a.id === id && a.image)) && (!currentPlan?.imageCapabilities || !draft.recipientIds.every(id => currentPlan.imageCapabilities.some(c => c.sessionId === id && c.state === 'supported')));
    const acceptUploaded = (asset) => { const old = alive.current && ownerScope === localScopeId() ? liveDraft.current : restoreChatDraft(readLocal(storageKey, liveDraft.current)), next = { ...old, assetIds: [...new Set([...old.assetIds, asset.id])] }; writeLocal(storageKey, next); if (alive.current && ownerScope === localScopeId()) {
        liveDraft.current = next;
        setDraft(next);
        setUploadedAssets(previous => [...previous.filter(a => a.id !== asset.id), asset]);
        setPlan(undefined);
        void onChanged().catch(e => { if (alive.current)
            setNotice('资料已保存，但列表刷新失败；当前附件引用已保留，请稍后刷新。'); });
    } };
    const receiveFiles = (files) => { if (disabled) {
        setNotice('当前发送结果待核实或会议不可编辑，请先处理原请求；新文件未上传。');
        return;
    } setNotice(''); uploadReceiver.current(files); };
    const disabled = busy || !!archived || !!pending;
    const currentReceive = useRef(receiveFiles);
    currentReceive.current = receiveFiles;
    useEffect(() => { const node = composer.current; if (!node)
        return; const drop = (event) => { const detail = event.detail; if (detail?.error)
        setNotice(detail.error);
    else if (detail?.files)
        currentReceive.current(detail.files); }, drag = (event) => setDragging(event.detail?.active === true); node.addEventListener(PANEL_FILE_DROP, drop); node.addEventListener(PANEL_FILE_DRAG, drag); return () => { node.removeEventListener(PANEL_FILE_DROP, drop); node.removeEventListener(PANEL_FILE_DRAG, drag); }; }, [meetingId, storageKey]);
    const hasDraft = (d) => !!d.instruction.trim() || !!d.messageIds.length || !!d.assetIds.length || !!d.recipientIds.length;
    const otherDrafts = ['plain', ...draftRunIds].filter(scope => scope !== (run?.id ?? 'plain')).flatMap(scope => { const key = `hosting.${meetingId}.${scope}`, saved = restoreChatDraft(readLocal(key, undefined)), waiting = readLocal(`${key}.pending`, undefined); return hasDraft(saved) || waiting ? [{ scope, saved, waiting }] : []; });
    const name = (id) => { const m = members.find(m => m.id === id); return m ? `${m.name}${members.filter(x => x.name === m.name).length > 1 ? ' · ' + id.slice(-6) : ''}` : `已离会 · ${id.slice(-6)}`; };
    const options = [...members.filter(m => `${m.name} ${m.id}`.toLowerCase().includes((picker?.query ?? '').toLowerCase())).map(m => ({ id: m.id, label: m.name })), ...(!(picker?.query) || '全体成员'.includes(picker.query) ? [{ id: '__all', label: '全体成员' }] : []), ...(!(picker?.query) || '秘书整理纪要'.includes(picker.query) ? [{ id: '__secretary', label: '秘书 · 整理纪要' }] : [])];
    const pick = (id) => {
        if (id === '__secretary') {
            if (picker?.start !== undefined && picker.end !== undefined && draft.instruction.slice(picker.start, picker.end) === ('@' + picker.query))
                change({ instruction: draft.instruction.slice(0, picker.start) + draft.instruction.slice(picker.end) });
            closePicker();
            onNavigate?.('minutes');
            return;
        }
        const ids = id === '__all' ? members.map(m => m.id) : [id];
        let text = draft.instruction;
        if (picker?.start !== undefined && picker.end !== undefined && text.slice(picker.start, picker.end) === `@${picker.query}`)
            text = text.slice(0, picker.start) + text.slice(picker.end);
        change({ instruction: text, recipientIds: [...new Set([...draft.recipientIds, ...ids])], intent: 'response' });
        setPicker(undefined);
        setRosterChanged(false);
        textarea.current?.focus();
    };
    const finish = async (request) => {
        if (guard.current)
            return;
        guard.current = true;
        setBusy(true);
        setError('');
        setPending(request);
        writeLocal(`${storageKey}.pending`, request);
        const snapshot = JSON.stringify(liveDraft.current);
        try {
            const { receipt } = await meetingCall(meetingId, 'chat-send', request);
            const sameDraft = JSON.stringify(liveDraft.current) === snapshot;
            const saved = writeLocal(storageKey, sameDraft ? emptyChatDraft() : liveDraft.current);
            const cleaned = saved && writeLocal(`${storageKey}.pending`, null) === true;
            if (alive.current) {
                setPending(cleaned ? undefined : request);
                setPlan(undefined);
                if (sameDraft)
                    setDraft(emptyChatDraft());
                setNotice(request.input.mode === 'record' ? '已记录，没有唤醒成员。' : request.input.mode === 'queue' ? `已加入第${receipt.round || 1}轮，尚未投递；到进程页查看。` : request.input.kind === 'message' ? '普通消息已接受，接收状态见上方；没有创建工作任务。' : request.input.runId ? '已授权临时回应，计入额度，不推进主流程。' : '已授权，接收状态见上方消息。');
            }
            try {
                await onChanged();
            }
            catch {
                if (alive.current)
                    setError('发送已接受，刷新失败；请刷新查看接收状态，不必重发。');
            }
        }
        catch (e) {
            if (alive.current)
                setError(e instanceof Error ? e.message : String(e));
            if (e instanceof Error && 'requestState' in e && e.requestState === 'rejected') {
                const cleared = writeLocal(`${storageKey}.pending`, null) === true;
                if (alive.current) {
                    setPending(cleared ? undefined : request);
                    setPlan(undefined);
                    setPreviewRevision(v => v + 1);
                    setNotice(cleared ? `未发送：${e.message}。请核对后重新发送。` : '请求明确被拒绝，但本地恢复记录未能清理；请留在本页重试原请求，当前内容保持冻结。');
                }
            }
        }
        finally {
            guard.current = false;
            if (alive.current)
                setBusy(false);
        }
    };
    const send = () => { if (disabled || rosterChanged || !currentPlan || attachmentsBlocked || imageBlocked)
        return; void finish({ input: payload, fingerprint: currentPlan.fingerprint, requestId: crypto.randomUUID() }); };
    const onKey = (e) => {
        if (composing.current || e.nativeEvent?.isComposing || e.keyCode === 229)
            return;
        if (!picker && e.currentTarget === textarea.current && e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0 && selectedAssetIds.length && !disabled) {
            e.preventDefault();
            requestRemoveAsset([...selectedAssetIds].reverse().find(id => !visibleAssets.find(a => a.id === id)?.image) ?? selectedAssetIds.at(-1));
            return;
        }
        // Modified Enter edits the body before the member menu can consume the key.
        // setRangeText replaces precisely the selection and keeps the native caret;
        // updating the controlled draft to that same value preserves it on rerender.
        if (e.currentTarget === textarea.current && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (disabled || guard.current)
                return;
            const area = textarea.current;
            area.setRangeText('\n', area.selectionStart, area.selectionEnd, 'end');
            change({ instruction: area.value });
            setPicker(undefined);
            return;
        }
        if (picker) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closePicker();
                return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setOption(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % Math.max(options.length, 1));
                return;
            }
            if (e.key === 'Enter' && (!e.shiftKey || e.currentTarget !== textarea.current)) {
                e.preventDefault();
                if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && options.length)
                    pick(options[Math.min(option, options.length - 1)].id);
                return;
            }
        }
        if (e.currentTarget === textarea.current && e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            send();
        }
    };
    const sendLabel = normalMode === 'record' ? '记录到会议' : draft.recipientIds.length === 1 ? `发送给 @${name(draft.recipientIds[0])}` : `发送给 @${name(draft.recipientIds[0])} 等 ${draft.recipientIds.length} 人`;
    const actionVerb = payload.mode === 'record' ? '记录' : '发送';
    const actionTitle = payload.mode === 'record' ? '保存到会议，不唤醒成员' : `发送给 ${draft.recipientIds.map(id => '@' + name(id)).join('、')}`;
    const pickerPanel = picker && _jsxs("div", { ref: pickerMenu, className: "rt-chat-picker", style: pickerPosition, role: "dialog", "aria-label": "@\u9009\u62E9\u6210\u5458", children: [_jsxs("div", { children: [_jsx("b", { children: "@ \u9009\u62E9\u6210\u5458" }), _jsx("button", { style: button, "aria-label": "\u5173\u95ED\u9009\u4EBA", onClick: closePicker, children: "\u00D7" })] }), _jsx("input", { ref: pickerSearch, "aria-label": "\u641C\u7D22\u70B9\u540D\u6210\u5458", placeholder: "\u641C\u7D22\u6210\u5458", style: input, onCompositionStart: () => { composing.current = true; }, onCompositionEnd: () => { composing.current = false; }, onKeyDown: onKey, value: picker.query, onChange: e => { setPicker({ ...picker, query: e.target.value, start: undefined, end: undefined }); setOption(0); } }), _jsx("div", { role: "listbox", "aria-label": "\u4F1A\u8BAE\u6210\u5458", className: "rt-chat-options", children: options.map((m, i) => _jsxs("button", { role: "option", "aria-selected": draft.recipientIds.includes(m.id), className: i === option ? 'active' : '', onClick: () => pick(m.id), children: [_jsx("span", { children: m.label }), _jsx("small", { children: m.id === '__all' ? `${members.length}人（不含秘书）` : m.id === '__secretary' ? '选择范围后生成' : `${members.filter(x => x.name === m.label).length > 1 ? m.id.slice(-6) + ' · ' : ''}${draft.recipientIds.includes(m.id) ? '已选' : memberStatus[m.id]?.running ? '忙碌' : memberStatus[m.id]?.availability?.state === 'archived' ? '已归档' : memberStatus[m.id]?.availability?.state === 'deleted' ? '已删除' : memberStatus[m.id]?.availability?.state === 'unknown' ? '状态待核对' : memberStatus[m.id]?.connected ? '就绪' : '执行时恢复'}` })] }, m.id)) }), !options.length && _jsx("p", { children: "\u6CA1\u6709\u5339\u914D\u7684\u6210\u5458" })] });
    return _jsxs("section", { ref: composer, "aria-label": "\u4E3B\u6301\u8F93\u5165", "data-hosting-composer": "", className: "rt-chat-composer", "data-attachment-drop": dragging ? 'active' : 'idle', "data-file-drop-enabled": disabled ? 'false' : 'true', children: [_jsx("style", { children: `[data-attachment-drop=active]{outline:2px dashed #2876dc;outline-offset:-3px}.rt-compose-uploads{display:flex;gap:5px;flex-wrap:wrap;min-width:0}[data-round-table-panel][data-file-drag=active] .rt-chat{outline:2px dashed #2876dc;outline-offset:-2px}.rt-compose-uploads article{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px;max-width:100%;font-size:12px}.rt-compose-uploads p{width:100%}` }), _jsx("style", { children: assetStyles }), _jsxs("div", { className: "rt-chat-compose-content", children: [draft.contextTaskId && _jsxs("p", { role: "status", children: ["\u6B63\u5728\u8865\u5145\u539F\u5DE5\u4F5C\uFF1B\u4E0D\u6539\u53D8\u5DF2\u7ECF\u51BB\u7ED3\u7684\u4EFB\u52A1\u8981\u6C42\u3002", _jsx("button", { style: button, disabled: disabled, onClick: () => change({ contextTaskId: undefined }), children: "\u53D6\u6D88\u5DE5\u4F5C\u5173\u8054" })] }), !persistence.available && _jsxs("p", { role: "alert", children: [persistence.reason, "\u3002\u8349\u7A3F\u53CA\u539F\u53D1\u9001\u8BF7\u6C42\u4EC5\u672C\u6B21\u7A97\u53E3\u6709\u6548\uFF0C\u5173\u95ED\u524D\u8BF7\u4FDD\u7559\u5185\u5BB9\u5E76\u6838\u5BF9\u63A5\u6536\u72B6\u6001\u3002"] }), draft.messageIds.length > 0 && _jsx("div", { className: "rt-chat-quotes", children: draft.messageIds.map(id => { const m = messages.find(x => x.id === id); return _jsxs("div", { children: [_jsxs("span", { children: ["\u5F15\u7528 ", m ? (m.sender === 'user' ? '你' : name(m.sender)) : '', " \u00B7 ", m?.text.slice(0, 100) ?? '来源已失效，请移除或重新选择'] }), _jsx("button", { style: button, "aria-label": `移除引用 ${id}`, disabled: disabled, onClick: () => change({ messageIds: draft.messageIds.filter(x => x !== id) }), children: "\u00D7" })] }, id); }) }), _jsx("div", { className: "rt-chat-chips", children: draft.recipientIds.map(id => _jsxs("button", { className: "rt-chat-mention", disabled: disabled, "aria-label": `移除接收人 ${name(id)}`, onClick: () => change({ recipientIds: draft.recipientIds.filter(x => x !== id), ...(draft.recipientIds.length === 1 ? { intent: 'record' } : {}) }), children: ["@", name(id), " \u00D7"] }, id)) }), draft.intent === 'record' && draft.recipientIds.length > 0 && _jsxs("p", { role: "status", children: ["\u5DF2\u6062\u590D\u65E7\u8349\u7A3F\u7684\u8BB0\u5F55\u6A21\u5F0F\u3002", _jsx("button", { style: button, disabled: disabled, onClick: () => change({ intent: 'response' }), children: "\u6539\u4E3A\u53D1\u9001\u7ED9\u6240\u9009\u6210\u5458" })] }), _jsxs("div", { className: "rt-native-draft", "aria-label": "\u8BA8\u8BBA\u8349\u7A3F\u8F93\u5165\u533A", children: [_jsx(ComposerAttachments, { meetingId: meetingId, disabled: disabled, onUploaded: acceptUploaded, onBlockingChange: setAttachmentsBlocked, register: receive => { uploadReceiver.current = receive; } }), !!selectedAssetIds.length && _jsx(ChatAssetPreview, { meetingId: meetingId, assets: visibleAssets, assetIds: selectedAssetIds, compact: true, disabled: disabled, onRemove: requestRemoveAsset }), _jsx("textarea", { ref: textarea, "aria-label": "\u4E3B\u6301\u5185\u5BB9", placeholder: "\u8BB0\u5F55\u60F3\u6CD5\uFF0C\u6216\u5C06\u56FE\u7247\u3001\u6587\u6863\u62D6\u5165\u6B64\u8BA8\u8BBA\u533A\u2026", rows: 3, style: input, value: draft.instruction, disabled: disabled, onPaste: e => { pasted.current = true; const files = Array.from(e.clipboardData.files ?? []); if (files.length) {
                                    e.preventDefault();
                                    pasted.current = false;
                                    receiveFiles(files);
                                    const text = e.clipboardData.getData('text/plain');
                                    if (text && !disabled) {
                                        const start = e.currentTarget.selectionStart ?? draft.instruction.length, end = e.currentTarget.selectionEnd ?? start;
                                        change({ instruction: draft.instruction.slice(0, start) + text + draft.instruction.slice(end) });
                                    }
                                } }, onCompositionStart: () => { composing.current = true; }, onCompositionEnd: () => { composing.current = false; }, onKeyDown: onKey, onChange: e => { change({ instruction: e.target.value }); if (pasted.current) {
                                    pasted.current = false;
                                    setPicker(undefined);
                                    return;
                                } if (!composing.current) {
                                    const at = mentionAt(e.target.value, e.target.selectionStart ?? e.target.value.length);
                                    if (at) {
                                        pickerAnchor.current = e.currentTarget ?? textarea.current;
                                        if (!picker)
                                            setPickerPosition({ visibility: 'hidden' });
                                    }
                                    setPicker(at);
                                    setOption(0);
                                } } })] }), /@\S*/.test(draft.instruction) && !picker && _jsx("small", { className: "rt-chat-muted", children: "\u6B63\u6587\u4E2D\u7684 @\u6587\u5B57\u4E0D\u4F1A\u81EA\u52A8\u9009\u4EBA\uFF1B\u5B9E\u9645\u63A5\u6536\u4EBA\u4EE5\u84DD\u8272\u6807\u7B7E\u4E3A\u51C6\u3002" }), rosterChanged && _jsxs("div", { role: "alert", children: ["\u6210\u5458\u540D\u5355\u6216\u540D\u79F0\u5DF2\u53D8\u5316\uFF0C\u8BF7\u6838\u5BF9\u4E0A\u65B9\u6536\u4EF6\u4EBA\u3002", _jsx("button", { style: button, onClick: () => setRosterChanged(false), children: "\u5DF2\u6838\u5BF9\u5F53\u524D\u6210\u5458" })] }), removeAsset && _jsxs("section", { role: "alertdialog", "aria-label": "\u786E\u8BA4\u79FB\u9664\u8D44\u6599\u5F15\u7528", className: "rt-chat-target", children: [_jsxs("b", { children: ["\u79FB\u9664 ", visibleAssets.find(a => a.id === removeAsset.id)?.name ?? '这份附件', " \u7684\u6765\u6E90\u5F15\u7528\uFF1F"] }), _jsx("p", { children: "\u9644\u4EF6\u7531\u4EE5\u4E0B\u6D88\u606F\u5F15\u7528\u5E26\u5165\uFF1B\u786E\u8BA4\u4F1A\u4E00\u5E76\u79FB\u9664\u8FD9\u4E9B\u6765\u6E90\u53CA\u7531\u5B83\u4EEC\u5E26\u5165\u7684\u5176\u4ED6\u9644\u4EF6\u3002\u5F53\u524D\u6B63\u6587\u3001\u5176\u4ED6\u72EC\u7ACB\u9009\u62E9\u7684\u9644\u4EF6\u4E0E\u4F1A\u8BAE\u5F52\u6863\u539F\u4EF6\u4FDD\u7559\u3002" }), removeAsset.sourceIds.map(id => _jsx("p", { children: messages.find(m => m.id === id)?.text.slice(0, 120) ?? '历史引用' }, id)), _jsx("button", { style: button, disabled: disabled, onClick: confirmRemoveAsset, children: "\u786E\u8BA4\u79FB\u9664\u8D44\u6599\u5F15\u7528" }), _jsx("button", { style: button, onClick: () => { setRemoveAsset(undefined); textarea.current?.focus(); }, children: "\u53D6\u6D88\u79FB\u9664" })] }), imageBlocked && !currentPlan?.imageCapabilities?.length && _jsx("p", { role: "status", children: "\u6B63\u5728\u6838\u5BF9\u6BCF\u4F4D\u63A5\u6536\u6210\u5458\u7684\u56FE\u7247\u80FD\u529B\uFF1B\u6838\u5B9E\u524D\u4FDD\u7559\u6574\u6761\u6B63\u6587\u4E0E\u539F\u56FE\uFF0C\u5C1A\u672A\u53D1\u9001\u3002" }), currentPlan?.imageCapabilities?.map(cap => _jsxs("p", { role: cap.state === 'supported' ? 'status' : 'alert', children: [name(cap.sessionId), " \u00B7 ", cap.reason] }, cap.sessionId)), otherDrafts.length > 0 && _jsxs("details", { children: [_jsxs("summary", { children: ["\u627E\u56DE\u5176\u4ED6\u8FD0\u884C\u8349\u7A3F\uFF08", otherDrafts.length, "\uFF09"] }), hasDraft(draft) && _jsx("p", { children: "\u5F53\u524D\u8349\u7A3F\u5DF2\u4FDD\u5B58\uFF0C\u8BF7\u5148\u5904\u7406\u5F53\u524D\u5185\u5BB9\u518D\u6062\u590D\u5176\u4ED6\u8349\u7A3F\u3002" }), otherDrafts.map(d => _jsxs("div", { children: [_jsxs("p", { children: [d.scope === 'plain' ? '流程外草稿' : `第${draftRunIds.indexOf(d.scope) + 1}次运行草稿`, "\uFF1A", d.saved.instruction.slice(0, 100) || '已选资料', d.waiting ? ' · 发送待核实' : ''] }), _jsx("button", { style: button, disabled: disabled || hasDraft(draft), onClick: () => { setDraft(d.saved); if (d.waiting)
                                            setPending(d.waiting); setNotice(d.waiting ? '已恢复原请求；请核实，不会自动重发。' : '已恢复为当前草稿，原草稿备份仍保留；核对接收人与执行范围后再发送。'); setPlan(undefined); }, children: d.waiting ? '恢复待核实请求' : '恢复此草稿' })] }, d.scope))] })] }), _jsxs("div", { className: "rt-chat-compose-bar", children: [_jsx("div", { className: "rt-chat-tools", children: _jsxs("small", { children: ["\u6B63\u6587 + ", draft.messageIds.length, " \u6761\u5F15\u7528 + ", selectedAssetIds.length, " \u4EFD\u9644\u4EF6"] }) }), _jsxs("div", { className: "rt-chat-send-actions", children: [_jsx("button", { style: button, disabled: disabled || attachmentsBlocked || imageBlocked, onClick: () => onCreateTask?.(structuredClone(draft)), children: "\u4EFB\u52A1\u5361\u751F\u6210" }), _jsx("button", { className: "rt-chat-send", "data-chat-action": payload.mode, title: actionTitle, disabled: disabled || rosterChanged || !currentPlan || attachmentsBlocked || imageBlocked, onClick: send, children: busy ? `正在${actionVerb}…` : checking ? '检查内容…' : sendLabel })] })] }), _jsxs("small", { className: "rt-chat-muted", children: [normalMode === 'record' ? '仅记录，不唤醒成员。' : '普通讨论消息，不创建工作任务；仅所选成员收到。', " \u53EF\u5C06\u56FE\u7247\u6216\u6587\u6863\u76F4\u63A5\u62D6\u5165\u6B64\u8BA8\u8BBA\u533A\uFF0C\u4E5F\u53EF\u7C98\u8D34\u622A\u56FE\uFF1B\u6B63\u6587\u4E0E\u9644\u4EF6\u540C\u6761\u63D0\u4EA4\u3002Enter ", actionVerb, " \u00B7 Ctrl/\u2318+Enter \u6362\u884C\uFF08Shift+Enter \u4E5F\u53EF\u6362\u884C\uFF09"] }), pickerPanel && (pickerLayer ? createPortal(pickerPanel, pickerLayer) : !composer.current ? pickerPanel : null), pending && !busy && _jsxs("div", { role: "alert", children: ["\u4E0A\u6B21", pending.input.mode === 'queue' ? '环节资料暂存' : '发送', "\u7ED3\u679C\u5F85\u6838\u5B9E\u3002", pending.input.mode === 'queue' && '这是旧版已经确认的原暂存请求，只可核对或重试原身份；新的资料补充入口在进程环节内。', _jsx("button", { style: button, onClick: () => { void finish(pending); }, children: "\u91CD\u8BD5\u539F\u8BF7\u6C42\uFF08\u4E0D\u4F1A\u91CD\u590D\u521B\u5EFA\u4EFB\u52A1\uFF09" })] }), error && _jsx("p", { role: "alert", children: error }), notice && _jsx("p", { role: "status", children: notice })] });
}
