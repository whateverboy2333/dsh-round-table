import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { taskNeedsAction, reviewState } from "../task-review.js";
import { taskRecoveryText } from "./TaskRecovery.js";
import { useEffect, useRef, useState } from 'react';
import { ReleasePanel } from "./ReleasePanel.js";
import { ResourcesPanel } from "./ResourcesPanel.js";
import { WorkflowPanel } from "./WorkflowPanel.js";
import { localScopeId, useLocalPersistence, scopedLocal } from "./ui-state.js";
import { memberCreationBatch, runMemberCreation, memberCreationStageText, MemberCreationStopped } from "./member-creation.js";
import { MinutesPanel } from "./MinutesPanel.js";
import { MeetingManagement } from "./MeetingManagement.js";
import { MeetingList } from "./MeetingList.js";
import { MemberSidebar } from "./MemberSidebar.js";
import { meetingShellStyles } from "./meeting-shell-style.js";
import { MemberTaskActions } from "./MemberTaskActions.js";
import { LegacyDrafts } from "./LegacyDrafts.js";
import { SessionPicker } from "./SessionPicker.js";
import { PresetKnightPicker } from "./PresetKnightPicker.js";
// ── 样式常量（与抽屉壳同款 inline 风格） ────────────────────────────────────
const textPrimary = { color: 'var(--dsw-alias-label-primary)' };
const textSecondary = { color: 'var(--dsw-alias-label-secondary)' };
const textTertiary = { color: 'var(--dsw-alias-label-tertiary)' };
const buttonBase = {
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-base)',
    fontFamily: 'inherit',
    fontSize: 12,
    lineHeight: '20px',
    padding: '3px 10px',
    cursor: 'pointer',
    ...textPrimary,
};
const primaryButton = {
    ...buttonBase,
    border: 'none',
    background: 'var(--dsw-alias-state-business-primary)',
    color: 'var(--dsw-alias-label-inverse, #fff)',
};
const inputStyle = {
    boxSizing: 'border-box',
    width: '100%',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-base)',
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: '20px',
    padding: '6px 8px',
    outline: 'none',
    ...textPrimary,
};
// ── 数据访问 ────────────────────────────────────────────────────────────────
const MEETINGS_URL = '/plugins/round-table/meetings';
const meetingCache = new Map();
async function fetchMeetings(detail, scope = localScopeId()) {
    if (!scope || scope !== localScopeId())
        throw new MemberCreationStopped();
    const url = `${MEETINGS_URL}?view=summary${detail ? `&detail=${encodeURIComponent(detail)}` : ''}`, key = `${scope}:${url}`, cached = meetingCache.get(key);
    const response = await fetch(url, { headers: cached ? { 'if-none-match': cached.etag } : {} });
    if (scope !== localScopeId())
        throw new MemberCreationStopped();
    if (response.status === 304 && cached)
        return cached.data;
    if (!response.ok)
        throw new Error(`读取会议列表失败（HTTP ${response.status}）`);
    const data = await response.json();
    if (scope !== localScopeId())
        throw new MemberCreationStopped();
    meetingCache.set(key, { etag: response.headers.get('etag') ?? '', data });
    return data;
}
async function postJsonForScope(url, body, scope = localScopeId()) {
    if (!scope || scope !== localScopeId())
        throw new MemberCreationStopped();
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-round-table-scope': scope },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => undefined);
        throw new Error(payload?.error ?? `请求失败（HTTP ${response.status}）`);
    }
    if (scope !== localScopeId())
        throw new MemberCreationStopped();
}
/** 会议标签协议：接收窗口凭此知道自己在开会（红线：必须带标签）。 */
export function meetingTag(title, text) {
    return `[圆桌会议「${title}」] from 用户：${text}`;
}
/** 解析窗口的投递 face；窗口不在当前会话列表（离线/已移除）时返回 undefined。 */
function resolveFace(rtCtx, sessionId) {
    const scoped = rtCtx.sessions.scope(sessionId);
    if (scoped === undefined)
        return undefined;
    return rtCtx.sessions.sessionOf(scoped);
}
/** 从会话历史提取最新一条助手消息的正文（text blocks 拼接）。 */
function latestReplyFromHistory(events) {
    for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]?.event;
        if (event?.type !== 'assistant/message')
            continue;
        const text = (event.data?.message?.content ?? [])
            .filter((block) => block.type === 'text')
            .map((block) => block.text ?? '')
            .join('')
            .trim();
        if (text !== '')
            return text;
    }
    return undefined;
}
async function fetchLatestReply(sessionId) {
    const response = await fetch('/api/session.history', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            type: 'client-request',
            rpcId: `rt-${Date.now()}`,
            method: 'session.history',
            payload: { sessionId },
        }),
    });
    if (!response.ok)
        return undefined;
    const body = await response.json();
    if (body.result?.ok !== true)
        return undefined;
    return latestReplyFromHistory(body.result.value?.events ?? []);
}
export function resolveKnightWorkspaces(knights, snapshot, currentSessionId) {
    const items = snapshot.items;
    if (snapshot.baselinesReady !== true || snapshot.phase !== 'ready' || snapshot.state === 'loading' || snapshot.state === 'error')
        return { ok: false, error: '工作区名册尚未就绪；请稍后重试或重新选择工作区' };
    const current = items.find((workspace) => currentSessionId !== undefined && workspace.sessionIds?.includes(currentSessionId));
    const workspaceIds = [];
    for (const knight of knights) {
        const id = knight.workspaceId ?? current?.workspaceId;
        if (id === undefined || !items.some((item) => item.workspaceId === id))
            return { ok: false, error: knight.workspaceId === undefined ? '“跟随当前”未能解析到有效工作区；请为每位骑士选择工作区' : '所选工作区已失效；请重新选择工作区' };
        workspaceIds.push(id);
    }
    return { ok: true, workspaceIds, currentLabel: current?.title };
}
export function MeetingPanel({ rtCtx, useSessions, useWorkspaces, connection }) {
    const mountScope = useRef(localScopeId()).current;
    const { readLocal, writeLocal, meetingCall } = scopedLocal(mountScope);
    const [managementNotice, setManagementNotice] = useState();
    const [recoveryOpen, setRecoveryOpen] = useState(0), [draftGeneration, setDraftGeneration] = useState(0);
    const [view, setView] = useState(() => readLocal('last-view', { kind: 'list' }));
    const active = useRef();
    active.current = view.kind === 'meeting' ? view.meetingId : undefined;
    useEffect(() => { writeLocal('last-view', view); }, [view]);
    const [meetings, setMeetings] = useState(undefined);
    const [loadError, setLoadError] = useState(undefined);
    const recovered = (entry) => { setDraftGeneration(v => v + 1); if (entry?.kind === 'meeting')
        setView({ kind: 'create' });
    else if (entry?.meetingId) {
        if (entry.kind === 'workflow')
            writeLocal(`tab.${entry.meetingId}`, 'workflow');
        setView({ kind: 'meeting', meetingId: entry.meetingId });
    } };
    // 轮询会议数据（面板挂载期间；打开面板才会挂载本组件）
    useEffect(() => {
        let alive = true;
        let inFlight = false;
        const tick = async () => {
            if (inFlight)
                return;
            inFlight = true;
            try {
                const data = await fetchMeetings(active.current, mountScope);
                if (!alive)
                    return;
                setMeetings(data.meetings);
                setLoadError(undefined);
            }
            catch (error) {
                if (alive)
                    setLoadError(String(error instanceof Error ? error.message : error));
            }
            finally {
                inFlight = false;
            }
        };
        void tick();
        const timer = setInterval(() => { void tick(); }, 5000);
        return () => { alive = false; clearInterval(timer); };
    }, []);
    const refresh = async () => {
        try {
            const data = await fetchMeetings(active.current, mountScope);
            setMeetings(data.meetings);
            setLoadError(undefined);
        }
        catch (error) {
            setLoadError(String(error instanceof Error ? error.message : error));
        }
    };
    useEffect(() => { void refresh(); }, [view.kind, view.kind === 'meeting' ? view.meetingId : '']);
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }, children: [loadError !== undefined && (_jsx("p", { role: "alert", style: { margin: '4px 0 8px', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }, children: loadError })), _jsx(LegacyDrafts, { home: connection.homePath?.() ?? '', profile: "\u5F53\u524D\u4F1A\u8BAE\u5E93", requestOpen: recoveryOpen, meetings: meetings ?? [], onImported: recovered }), managementNotice && _jsx("p", { role: "status", style: { fontSize: 12, overflowWrap: 'anywhere' }, children: managementNotice }), view.kind === 'list' && (_jsx(MeetingList, { meetings: meetings, onChanged: refresh, onCreate: () => { setView({ kind: 'create' }); }, onOpen: (meetingId) => { setView({ kind: 'meeting', meetingId }); } })), view.kind === 'create' && (_jsx(CreateMeeting, { useSessions: useSessions, useWorkspaces: useWorkspaces, connection: connection, onCancel: () => { setView({ kind: 'list' }); }, onCreated: async (meetingId) => {
                    await refresh();
                    setView({ kind: 'meeting', meetingId });
                } })), view.kind === 'meeting' && (_jsx(MeetingView, { onRecovery: () => setRecoveryOpen(v => v + 1), onJumpMeeting: meetingId => setView({ kind: 'meeting', meetingId }), rtCtx: rtCtx, useSessions: useSessions, useWorkspaces: useWorkspaces, connection: connection, meeting: meetings?.find((m) => m.meetingId === view.meetingId), onBack: () => { setView({ kind: 'list' }); }, onChanged: refresh, onDeleted: (message) => { setManagementNotice(message); setView({ kind: 'list' }); void refresh(); } }, `${view.meetingId}:${draftGeneration}:${!!meetings?.find(m => m.meetingId === view.meetingId)}`))] }));
}
/** 窗口行查询（displayTitle/running/在场判断；不在列表返回 undefined）。 */
function useSessionRows(useSessions) {
    const byId = useSessions((s) => s.byId);
    return (sessionId) => byId[sessionId];
}
function memberCreationResults(batch) {
    return _jsx("ul", { style: { paddingLeft: 18, margin: '4px 0', overflowWrap: 'anywhere' }, children: batch.members.map(step => _jsxs("li", { "data-member-creation-id": step.instanceId, children: [_jsx("b", { children: step.title }), "\uFF1A", memberCreationStageText(step), step.error && _jsx("p", { role: "alert", style: { margin: '3px 0' }, children: step.error }), _jsxs("small", { children: ["\u7A97\u53E3 ", step.sessionId, step.workspaceId ? ` · 工作区 ${step.workspaceId}` : ''] })] }, step.instanceId)) });
}
function CreateMeeting({ useSessions, useWorkspaces, connection, onCancel, onCreated }) {
    const mountScope = useRef(localScopeId()).current, mountHome = useRef(connection.homePath?.()).current;
    const { readLocal, writeLocal, meetingCall } = scopedLocal(mountScope);
    const isCurrent = () => mountScope === localScopeId() && (!connection.homePath || mountHome === connection.homePath());
    const postJson = (url, body) => { if (!isCurrent())
        return Promise.reject(new MemberCreationStopped()); return postJsonForScope(url, body, mountScope); };
    const [initial] = useState(() => readLocal('create-draft', {}));
    const [title, setTitle] = useState(initial.title ?? '');
    const [description, setDescription] = useState(initial.description ?? '');
    const [secretaryWorkspaceChoice, setSecretaryWorkspaceChoice] = useState(initial.workspace);
    const [checked, setChecked] = useState(new Set(initial.checked ?? []));
    const [knights, setKnights] = useState(initial.knights ?? []);
    useEffect(() => { writeLocal('create-draft', { title, description, workspace: secretaryWorkspaceChoice, checked: [...checked], knights }); }, [title, description, secretaryWorkspaceChoice, checked, knights]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(undefined);
    const [creation, setCreation] = useState(() => readLocal('create-progress', undefined));
    const creationRef = useRef(creation), createGuard = useRef(false);
    const persistence = useLocalPersistence();
    const [progressSaved, setProgressSaved] = useState(true);
    const saveCreation = (value) => { if (!isCurrent())
        throw new MemberCreationStopped(); creationRef.current = value; setCreation(value); if (!writeLocal('create-progress', value ?? null))
        setProgressSaved(false); };
    const locked = busy || !!creation;
    // 0 已选的建会确认（第一击武装，第二击才真创建空会议；勾选变化即复位）
    const [emptyArmed, setEmptyArmed] = useState(false);
    const rows = useSessions((s) => s.ids
        .map((id) => ({ id, row: s.byId[id] }))
        .filter((item) => item.row !== undefined));
    const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds);
    const workspaceSnapshot = useWorkspaces((s) => s);
    const workspaces = workspaceSnapshot.items;
    const currentSessionId = useSessions((s) => s.current);
    const followCurrentLabel = workspaces.find((workspace) => currentSessionId !== undefined && workspace.sessionIds?.includes(currentSessionId))?.title;
    const inferredSecretaryWorkspaceId = workspaces.find((workspace) => currentSessionId !== undefined && workspace.sessionIds?.includes(currentSessionId))?.workspaceId;
    const secretaryWorkspaceId = secretaryWorkspaceChoice ?? inferredSecretaryWorkspaceId;
    const toggle = (id) => {
        if (locked)
            return;
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
        setEmptyArmed(false); // 勾选变化即解除 0 人确认态
    };
    const submit = async () => {
        if (createGuard.current || (creationRef.current?.uncertain && !creationRef.current.requestSafe))
            return;
        if (!isCurrent()) {
            setError(new MemberCreationStopped().message);
            return;
        }
        let journal = creationRef.current;
        if (!journal) {
            if (title.trim() === '') {
                setError('请填写会议标题');
                return;
            }
            if (description.trim() === '') {
                setError('请填写会议说明');
                return;
            }
            if (secretaryWorkspaceId === undefined) {
                setError('请选择有效当前工作区作为会议默认工作区');
                return;
            }
            if (new Set(knights.map((knight) => knight.title.trim())).size !== knights.length || knights.some((knight) => knight.title.trim() === '')) {
                setError('同一会议的骑士名称必须非空且不重复');
                return;
            }
            const resolved = knights.length === 0 ? undefined : resolveKnightWorkspaces(knights, workspaceSnapshot, currentSessionId);
            if (resolved !== undefined && !resolved.ok) {
                setError(resolved.error);
                return;
            }
            if (!workspaces.some(w => w.workspaceId === secretaryWorkspaceId)) {
                setError('会议默认工作区已失效，请重新选择');
                return;
            }
            if (checked.size === 0 && knights.length === 0 && !emptyArmed) {
                setEmptyArmed(true);
                return;
            }
            journal = { ...memberCreationBatch([...checked].map(sessionId => ({ sessionId, title: rows.find(x => x.id === sessionId)?.row.displayTitle ?? sessionId })), knights, resolved?.ok ? resolved.workspaceIds : []), title: title.trim(), description: description.trim(), workspaceId: secretaryWorkspaceId, requestSafe: true };
            saveCreation(journal);
        }
        createGuard.current = true;
        setBusy(true);
        setError(undefined);
        try {
            if (!journal.meetingId) {
                try {
                    const scope = mountScope;
                    if (!scope || !isCurrent())
                        throw new MemberCreationStopped();
                    const response = await fetch(MEETINGS_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-round-table-scope': scope }, body: JSON.stringify({ title: journal.title, description: journal.description, secretaryWorkspaceId: journal.workspaceId, memberSessionIds: [], ...(journal.requestSafe ? { requestId: journal.id } : {}) }) });
                    const payload = await response.json();
                    if (!isCurrent())
                        throw new MemberCreationStopped();
                    if (!response.ok) {
                        if (payload.requestState === 'rejected')
                            saveCreation(undefined);
                        throw Error(payload.error ?? `创建失败（HTTP ${response.status}）`);
                    }
                    if (!payload.meeting)
                        throw Error('创建响应缺少会议身份');
                    journal = { ...journal, meetingId: payload.meeting.meetingId, uncertain: false };
                    saveCreation(journal);
                }
                catch (error) {
                    if (isCurrent() && creationRef.current && !creationRef.current.meetingId)
                        saveCreation({ ...journal, uncertain: true });
                    throw error;
                }
            }
            const meetingId = journal.meetingId;
            journal = await runMemberCreation(journal, connection, step => postJson(`${MEETINGS_URL}/${encodeURIComponent(meetingId)}/join`, { sessionId: step.sessionId, origin: step.presetId ? { source: 'preset', presetId: step.presetId, workspaceId: step.workspaceId } : { source: 'existing' }, ...(step.role ? { role: step.role } : {}) }), saveCreation, isCurrent);
            if (journal.members.some(x => x.stage !== 'done')) {
                setError('会议已创建；部分成员未完成，请查看逐项结果并重试。');
                return;
            }
            writeLocal('create-draft', {});
            await onCreated(meetingId);
            saveCreation(undefined);
        }
        catch (cause) {
            setError(String(cause instanceof Error ? cause.message : cause));
        }
        finally {
            createGuard.current = false;
            setBusy(false);
        }
    };
    return (_jsxs("div", { "data-round-table-create-form": "", style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', gap: 8 }, children: [_jsxs("div", { style: { flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("button", { type: "button", style: buttonBase, onClick: onCancel, children: "\u2190 \u8FD4\u56DE" }), _jsx("span", { style: { fontSize: 13, fontWeight: 500, ...textPrimary }, children: "\u65B0\u5EFA\u4F1A\u8BAE" })] }), _jsxs("div", { "data-round-table-create-scroll": "", style: { flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }, children: [_jsx("input", { "data-round-table-title": "", style: { ...inputStyle, flex: 'none' }, "aria-label": "\u4F1A\u8BAE\u6807\u9898", placeholder: "\u4F1A\u8BAE\u540D\u79F0\uFF0C\u4F8B\u5982\uFF1A\u79CB\u5B63\u6D3B\u52A8\u65B9\u6848\u8BC4\u5BA1", value: title, disabled: locked, onChange: (event) => { setTitle(event.target.value); } }), _jsx("textarea", { disabled: locked, "data-round-table-description": "", style: { ...inputStyle, flex: 'none', resize: 'vertical' }, "aria-label": "\u4F1A\u8BAE\u8BF4\u660E\uFF08\u5FC5\u586B\uFF09", placeholder: "\u8FD9\u573A\u4F1A\u8BAE\u8981\u89E3\u51B3\u4EC0\u4E48\u95EE\u9898\uFF1F\u5199\u6E05\u76EE\u6807\u3001\u80CC\u666F\u4E0E\u671F\u5F85\u4EA7\u51FA\uFF08\u5FC5\u586B\uFF09", value: description, onChange: (event) => setDescription(event.target.value) }), _jsxs("label", { style: { flex: 'none', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, fontSize: 12, ...textSecondary }, children: ["\u4F1A\u8BAE\u9ED8\u8BA4\u5DE5\u4F5C\u533A\uFF1A", _jsxs("select", { disabled: locked, style: { width: '100%', minWidth: 0, boxSizing: 'border-box' }, "data-round-table-secretary-workspace": "", value: secretaryWorkspaceId ?? '', onChange: (event) => setSecretaryWorkspaceChoice(event.target.value === '' ? undefined : event.target.value), children: [_jsx("option", { value: "", children: "\u8BF7\u9009\u62E9\u5DE5\u4F5C\u533A" }), workspaces.map((workspace) => _jsx("option", { value: workspace.workspaceId, children: workspace.title }, workspace.workspaceId))] })] }), _jsx("p", { style: { fontSize: 12, margin: 0 }, children: "\u9ED8\u8BA4\u5DE5\u4F5C\u533A\u7528\u4E8E\u65B0\u5B9E\u4F8B\u4E0E\u4E13\u5C5E\u79D8\u4E66\uFF1B\u5DF2\u6709\u6210\u5458\u4FDD\u7559\u5404\u81EA\u9879\u76EE\u6743\u9650\u3002" }), _jsxs("span", { style: { flex: 'none', fontSize: 12, ...textSecondary }, children: ["\u9080\u8BF7\u8C01\u53C2\u4E0E\uFF1A\u9009\u62E9\u5DF2\u6709\u7A97\u53E3\uFF08", checked.size, " \u5DF2\u9009\uFF09"] }), !creation && _jsxs(_Fragment, { children: [_jsx(SessionPicker, { rows: rows, archivedSessionIds: archivedSessionIds, checked: checked, onToggle: toggle }), _jsxs("details", { children: [_jsxs("summary", { children: ["\u6309\u9884\u8BBE\u65B0\u5EFA\u9A91\u58EB\u3001\u8BBE\u7F6E\u804C\u8D23\u4E0E\u72EC\u7ACB\u5DE5\u4F5C\u533A\uFF08", knights.length, " \u5DF2\u9009\uFF09"] }), _jsx(PresetKnightPicker, { api: connection.api, workspaces: workspaces, followCurrentLabel: followCurrentLabel, selected: knights, onChange: (next) => { if (locked)
                                            return; setKnights(next); setEmptyArmed(false); } })] })] }), creation && _jsxs("section", { "aria-label": "\u4F1A\u8BAE\u521B\u5EFA\u8FDB\u5EA6", children: [_jsx("b", { children: creation.meetingId ? `会议已创建 · ${creation.title}` : '正在创建会议' }), memberCreationResults(creation), creation.uncertain && _jsx("p", { role: "alert", children: creation.requestSafe ? '创建结果待核实，可重试原创建请求；沿用相同请求身份，不会另建会议。' : `旧创建记录没有请求身份，请返回列表确认是否已有「${creation.title}」。为避免重复创建，本次不会再次建会；创建记录已保留。` }), creation.meetingId && _jsx("button", { style: buttonBase, disabled: busy, onClick: () => { void onCreated(creation.meetingId).catch(e => setError(String(e))); }, children: "\u8FDB\u5165\u5DF2\u521B\u5EFA\u4F1A\u8BAE" })] }), (!persistence.available || !progressSaved) && _jsx("p", { role: "alert", children: "\u521B\u5EFA\u8FDB\u5EA6\u4EC5\u5728\u672C\u7A97\u53E3\u5185\u4FDD\u7559\uFF0C\u5173\u95ED\u6216\u5237\u65B0\u524D\u8BF7\u8BB0\u4E0B\u4F1A\u8BAE\u4E0E\u7A97\u53E3\u8EAB\u4EFD\u3002" }), error !== undefined && (_jsx("p", { role: "alert", style: { flex: 'none', margin: 0, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: error }))] }), _jsxs("div", { "data-round-table-create-footer": "", style: { flex: 'none', paddingTop: 8, borderTop: '1px solid var(--dsw-alias-border-l2)' }, children: [_jsx("p", { style: { fontSize: 12, margin: '0 0 8px' }, children: "\u521B\u5EFA\u540E\u4F1A\u7ED9\u6240\u9009\u6210\u5458\u53D1\u9001\u5165\u4F1A\u7B80\u62A5\uFF0C\u6210\u5458\u53EF\u80FD\u56DE\u5E94\uFF1B\u540E\u7EED\u4EFB\u52A1\u4ECD\u9700\u4F60\u660E\u786E\u653E\u884C\u3002\u79D8\u4E66\u72EC\u7ACB\u521B\u5EFA\uFF0C\u4E0D\u53C2\u4E0E\u666E\u901A\u8BA8\u8BBA\u3002" }), emptyArmed && checked.size === 0 && knights.length === 0 && (_jsx("p", { "data-round-table-empty-warn": "", style: { margin: '0 0 4px', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-state-error-primary)' }, children: "\u672A\u9009\u62E9\u4EFB\u4F55\u7A97\u53E3\u2014\u2014\u518D\u70B9\u4E00\u6B21\u300C\u786E\u8BA4\u521B\u5EFA\u7A7A\u4F1A\u8BAE\u300D\u5C06\u521B\u5EFA 0 \u6210\u5458\u4F1A\u8BAE\u3002" })), _jsx("button", { type: "button", "data-round-table-create-submit": "", style: primaryButton, disabled: busy || !!creation?.uncertain && !creation.requestSafe, onClick: () => { void submit(); }, children: busy ? '处理中…' : creation?.uncertain && creation.requestSafe ? '重试原创建请求' : creation ? '重试未完成步骤' : emptyArmed && checked.size === 0 && knights.length === 0 ? '确认创建空会议' : '创建会议' })] })] }));
}
/** Resolve only a member's own workspace; the meeting default does not imply membership. */
function memberWorkspaceInfo(sessionId, cwd, workspaces = []) {
    const normalize = (path) => {
        const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
        return /^[a-z]:[\\/]|^\\\\|^\/\//i.test(path) ? normalized.toLowerCase() : normalized;
    };
    const actual = cwd?.trim() ? cwd : undefined;
    const workspace = workspaces.find(w => w.sessionIds?.includes(sessionId) && (!actual || normalize(w.path) === normalize(actual)));
    const path = actual ?? workspace?.path;
    if (!path)
        return { label: '宿主未提供' };
    const title = workspace?.title.trim();
    const parts = path.split(/[\\/]+/).filter(Boolean);
    const short = /^(?:[a-z]:[\\/]*|\/+)$/i.test(path) ? path : parts.slice(-2).join('/') || path;
    return { label: title && normalize(title) !== normalize(path) && !(/^[a-z]:[\\/]|^[\\/]/i.test(title)) ? title : short, path };
}
/** 原会话状态与主要操作常显；完整路径、权限说明和最近回复收在详情中。 */
function MemberLive({ nameOf, sessionId, running, present, meetingId, onChanged, onRemove, onOpen, cwd, workspaces = [], releases = [], discussions = [], workflow, availability }) {
    const label = nameOf(sessionId);
    const workspace = memberWorkspaceInfo(sessionId, cwd, workspaces);
    const [reply, setReply] = useState(undefined);
    const [privatePreview, setPrivatePreview] = useState(false), [recoveryError, setRecoveryError] = useState(''), [recovering, setRecovering] = useState(false);
    const { meetingCall } = scopedLocal(useRef(localScopeId()).current);
    const affectedTasks = releases.flatMap(r => r.tasks.filter(t => t.toSessionId === sessionId && !['completed', 'failed', 'cancelled'].includes(t.status)).map(t => r.title ?? r.instruction.slice(0, 60)));
    const affectedDiscussion = discussions.filter(d => d.deliveries.some(v => v.toSessionId === sessionId && v.status !== 'cancelled')).map(d => `普通讨论：${d.instruction.slice(0, 60)}`);
    const affectedNodes = [...(workflow?.draft?.nodes ?? []), ...(workflow?.runs.filter(r => r.status === 'active').flatMap(r => r.definition.nodes) ?? [])].filter(n => n.memberIds.includes(sessionId)).map(n => `仍依赖此成员的环节：${n.title}`);
    const affected = [...affectedTasks, ...affectedDiscussion];
    // 移除：二次确认（第一击武装，第二击执行；切换他键即复位）
    const [removeArmed, setRemoveArmed] = useState(false);
    // 内容实况：session.history 只读轮询（5s，in-flight 防重叠；重启后历史同样可读）
    useEffect(() => {
        if (!present || !privatePreview)
            return undefined;
        let alive = true;
        let inFlight = false;
        const tick = async () => {
            if (inFlight)
                return;
            inFlight = true;
            try {
                const latest = (await meetingCall(meetingId, 'member-reply', { sessionId })).text;
                if (alive && latest !== undefined)
                    setReply(latest);
            }
            catch { /* 下一tick重试 */ }
            finally {
                inFlight = false;
            }
        };
        void tick();
        const timer = setInterval(() => { void tick(); }, 5000);
        return () => { alive = false; clearInterval(timer); };
    }, [sessionId, present, privatePreview]);
    return (_jsxs("section", { "data-round-table-member": sessionId, style: {
            border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '8px 10px',
            display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
        }, children: [_jsxs("header", { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0 }, children: [_jsx("span", { title: !present ? '原窗口未连接' : running ? '原窗口忙碌' : '可投递', style: {
                            flex: 'none', width: 8, height: 8, borderRadius: '50%',
                            background: !present
                                ? 'var(--dsw-alias-state-error-primary)'
                                : running ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-caption)',
                        } }), _jsx("span", { title: label, style: { fontSize: 12, fontWeight: 500, flex: '1 1 90px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...textPrimary }, children: label }), _jsx("span", { style: { marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap', ...textTertiary }, children: availability?.state === 'archived' ? '原会话已归档' : availability?.state === 'deleted' ? '原会话已删除' : availability?.state === 'unknown' ? '原会话状态待确认' : !present ? '确认执行后自动恢复' : running ? '原窗口忙碌' : '已就绪' }), _jsx("button", { type: "button", "data-round-table-open-session": sessionId, style: { ...buttonBase, flex: 'none', whiteSpace: 'nowrap', padding: '0 6px', fontSize: 11, lineHeight: '16px' }, onClick: () => onOpen(sessionId), children: "\u6253\u5F00\u4F1A\u8BDD" }), _jsx("button", { type: "button", "data-round-table-remove-member": sessionId, "data-armed": removeArmed || undefined, style: {
                            ...buttonBase, flex: 'none', whiteSpace: 'nowrap', padding: '0 6px', fontSize: 11, lineHeight: '16px',
                            ...(removeArmed ? { borderColor: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-state-error-primary)' } : {}),
                        }, onClick: () => {
                            if (!removeArmed) {
                                setRemoveArmed(true);
                                return;
                            }
                            setRemoveArmed(false);
                            void onRemove(sessionId);
                        }, children: removeArmed ? '确认移除？' : '移除' })] }), availability?.reason && _jsx("p", { role: ['archived', 'deleted', 'unknown', 'restore_failed'].includes(availability.state) ? 'alert' : 'status', children: availability.reason }), !present && !['archived', 'deleted'].includes(availability?.state ?? '') && _jsx("button", { style: buttonBase, disabled: recovering, onClick: () => { setRecovering(true); void meetingCall(meetingId, 'member-retry', { sessionId, confirmed: true }).then(() => onChanged()).catch(e => setRecoveryError(String(e instanceof Error ? e.message : e))).finally(() => setRecovering(false)); }, children: recovering ? '恢复原会话中…' : '在会议内重试恢复' }), recoveryError && _jsx("p", { role: "alert", children: recoveryError }), removeArmed && _jsxs("div", { role: "alertdialog", "aria-label": "\u786E\u8BA4\u79FB\u51FA\u4F1A\u8BAE", children: [_jsxs("p", { children: ["\u5C06\u300C", label, "\u300D\u79FB\u51FA\u672C\u4F1A\uFF0C\u7ED3\u675F ", affected.length, " \u9879\u672A\u5B8C\u6210\u7B49\u5F85\uFF1B\u539F\u4F1A\u8BDD\u3001\u5386\u53F2\u53D1\u8A00\u548C\u5DF2\u63D0\u4EA4\u7ED3\u679C\u4FDD\u7559\u3002\u4ECD\u4F9D\u8D56\u6B64\u6210\u5458\u7684\u73AF\u8282\u9700\u8981\u91CD\u65B0\u5B89\u6392\uFF0C\u4E0D\u4F1A\u89C6\u4F5C\u5B8C\u6210\u3002"] }), affectedNodes.length > 0 && _jsx("ul", { children: [...new Set(affectedNodes)].map(title => _jsx("li", { children: title }, title)) }), affected.length > 0 && _jsx("ul", { children: affected.map((title, i) => _jsx("li", { children: title }, i)) }), _jsx("button", { style: buttonBase, onClick: () => setRemoveArmed(false), children: "\u53D6\u6D88\u79FB\u9664" })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0, fontSize: 12, ...textSecondary }, children: [_jsx("span", { style: { flex: 'none' }, children: "\u539F\u5DE5\u4F5C\u533A\uFF1A" }), _jsx("span", { "data-round-table-workspace-label": sessionId, title: workspace.path, tabIndex: 0, "aria-label": `原工作区：${workspace.label}${workspace.path ? `，完整路径：${workspace.path}` : ''}`, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: workspace.label })] }), _jsxs("details", { "data-round-table-member-details": sessionId, onToggle: e => setPrivatePreview(e.currentTarget.open), style: { minWidth: 0, fontSize: 12 }, children: [_jsx("summary", { style: { cursor: 'pointer', width: 'fit-content', ...textSecondary }, children: "\u4F1A\u8BDD\u8BE6\u60C5" }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, minWidth: 0 }, children: [workspace.path && _jsxs("div", { children: [_jsx("small", { style: textTertiary, children: "\u5B8C\u6574\u5DE5\u4F5C\u533A\u8DEF\u5F84" }), _jsx("p", { "data-round-table-workspace-full": sessionId, style: { margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', userSelect: 'text' }, children: workspace.path })] }), _jsx("p", { style: { margin: 0, ...textTertiary }, children: "\u6587\u4EF6\u6743\u9650\u6CBF\u7528\u539F\u4F1A\u8BDD\u8BBE\u7F6E\u3002" }), _jsx("small", { children: "\u539F\u4F1A\u8BDD\u6700\u8FD1\u56DE\u590D\u9884\u89C8\uFF08\u53EF\u80FD\u5305\u542B\u5176\u4ED6\u5DE5\u4F5C\uFF0C\u4E0D\u81EA\u52A8\u53D1\u5E03\uFF09" }), _jsx("p", { style: {
                                    margin: 0, fontSize: 12, lineHeight: '18px', ...textSecondary,
                                    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 4, overflow: 'hidden',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }, children: !present ? '窗口不在当前会话列表（离线或已移除）' : (reply ?? '（暂无发言）') })] })] })] }));
}
/** 任务状态条的中文标签（与 flat-teams TaskStatus 对齐）。 */
const TASK_STATUS_LABEL = {
    pending: '待投递',
    delivered: '已派发',
    claimed: '已认领',
    in_progress: '进行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    timeout: '超时',
};
function taskStatusColor(status) {
    if (status === 'completed')
        return 'var(--dsw-alias-state-business-primary)';
    if (status === 'failed' || status === 'cancelled' || status === 'timeout')
        return 'var(--dsw-alias-state-error-primary)';
    return 'var(--dsw-alias-label-tertiary)';
}
/** @提及的草稿尾 token（只在光标位于文末时识别；R4 简化，报告中说明）。 */
function mentionTokenAtEnd(text, caret) {
    if (caret !== text.length)
        return undefined;
    const match = /(^|\s)@([^\s@]*)$/.exec(text);
    if (match === null)
        return undefined;
    return { start: match.index + (match[1] ?? '').length, query: match[2] ?? '' };
}
function MeetingView({ rtCtx, useSessions, useWorkspaces, connection, meeting, onBack, onChanged, onDeleted, onJumpMeeting, onRecovery }) {
    const mountScope = useRef(localScopeId()).current, mountHome = useRef(connection.homePath?.()).current;
    const { readLocal, writeLocal, meetingCall } = scopedLocal(mountScope);
    const isCurrent = () => mountScope === localScopeId() && (!connection.homePath || mountHome === connection.homePath());
    const postJson = (url, body) => { if (!isCurrent())
        return Promise.reject(new MemberCreationStopped()); return postJsonForScope(url, body, mountScope); };
    const [draft, setDraft] = useState(() => readLocal(`message-draft.${meeting?.meetingId}`, ''));
    const [focusTask, setFocusTask] = useState();
    const [tab, setTab] = useState(() => { const saved = readLocal(`tab.${meeting?.meetingId}`, 'discussion'); return ['members', 'tasks'].includes(saved) ? 'discussion' : saved; });
    const [sidebarOpen, setSidebarOpen] = useState(false), [selectedMember, setSelectedMember] = useState(null), [taskModal, setTaskModal] = useState(false), [overview, setOverview] = useState(false);
    const [immediateConfirm, setImmediateConfirm] = useState(false);
    useEffect(() => { if (meeting) {
        writeLocal(`message-draft.${meeting.meetingId}`, draft);
        writeLocal(`tab.${meeting.meetingId}`, tab);
    } }, [draft, tab, meeting?.meetingId]);
    const messageRequest = useRef();
    const saveBusy = useRef(false);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(undefined);
    // @派遣：target = 已选中的派遣对象；mentionQuery 非 null = 候选列表开着
    const [target, setTarget] = useState(undefined);
    const [mention, setMention] = useState(undefined);
    // 添加成员：展开态 + 选择器勾选 + 忙态
    const [addOpen, setAddOpen] = useState(() => !!readLocal(`member-create.${meeting?.meetingId}`, undefined));
    const [addChecked, setAddChecked] = useState(new Set());
    const [addTab, setAddTab] = useState('existing');
    const [addKnights, setAddKnights] = useState([]);
    const [addBusy, setAddBusy] = useState(false);
    const [addBatch, setAddBatch] = useState(() => readLocal(`member-create.${meeting?.meetingId}`, undefined));
    const addBatchRef = useRef(addBatch), addGuard = useRef(false);
    const persistence = useLocalPersistence(), [memberProgressSaved, setMemberProgressSaved] = useState(true);
    const saveAddBatch = (value) => { if (!isCurrent())
        throw new MemberCreationStopped(); addBatchRef.current = value; setAddBatch(value); if (!writeLocal(`member-create.${meeting?.meetingId}`, value ?? null))
        setMemberProgressSaved(false); };
    const [secretaryBusy, setSecretaryBusy] = useState(false);
    const [secretaryWorkspaceChoice, setSecretaryWorkspaceChoice] = useState('');
    const rowOf = useSessionRows(useSessions);
    const allRows = useSessions((s) => s.ids
        .map((id) => ({ id, row: s.byId[id] }))
        .filter((item) => item.row !== undefined));
    const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds);
    const workspaceSnapshot = useWorkspaces((s) => s);
    const workspaces = workspaceSnapshot.items;
    const currentSessionId = useSessions((s) => s.current);
    const followCurrentLabel = workspaces.find((workspace) => currentSessionId !== undefined && workspace.sessionIds?.includes(currentSessionId))?.title;
    const retrySecretary = async () => { if (meeting === undefined)
        return; const id = meeting.secretary?.workspaceId ?? (secretaryWorkspaceChoice || meeting.defaultWorkspaceId || ''); if (id === '' || secretaryBusy) {
        setSendError('请选择有效秘书工作区');
        return;
    } ; setSecretaryBusy(true); try {
        await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/retry-secretary`, { secretaryWorkspaceId: id });
        await onChanged();
    }
    catch (error) {
        setSendError(String(error));
    }
    finally {
        setSecretaryBusy(false);
    } };
    const nameOf = (sessionId) => rowOf(sessionId)?.displayTitle ?? meeting?.memberNames?.[sessionId] ?? `${sessionId.slice(0, 18)}…`;
    const nameStamp = meeting?.memberSessionIds.map(id => `${id}:${rowOf(id)?.displayTitle ?? ''}`).join('|');
    useEffect(() => { if (!meeting || meeting.archivedAt)
        return; const names = Object.fromEntries(meeting.memberSessionIds.filter(id => rowOf(id)?.displayTitle && meeting.memberNames?.[id] !== rowOf(id)?.displayTitle).map(id => [id, rowOf(id).displayTitle])); if (Object.keys(names).length)
        void meetingCall(meeting.meetingId, 'member-names', { names }).then(onChanged).catch(() => { }); }, [nameStamp]);
    const memberLabel = (sessionId) => { const row = rowOf(sessionId); return row?.agentPreset === undefined ? nameOf(sessionId) : `${nameOf(sessionId)} · ${row.agentPreset}`; };
    if (meeting === undefined) {
        return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsx("button", { type: "button", style: { ...buttonBase, alignSelf: 'flex-start' }, onClick: onBack, children: "\u2190 \u8FD4\u56DE" }), _jsx("p", { style: { margin: 0, fontSize: 12, ...textTertiary }, children: "\u4F1A\u8BAE\u4E0D\u5B58\u5728\u6216\u5DF2\u5220\u9664\uFF0C\u8BF7\u8FD4\u56DE\u5217\u8868\u3002" })] }));
    }
    /** 添加成员选择器的行：全局会话减去已在会成员（归档/subagent 由 SessionPicker 分层排除）。 */
    const nonMemberRows = allRows.filter(({ id }) => !meeting.memberSessionIds.includes(id));
    /** 移除成员（MemberLive 二次确认后调用）；@候选与广播名单随轮询自动同步。 */
    const removeMember = async (sessionId) => {
        setSendError(undefined);
        try {
            await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/leave`, { sessionId });
            await onChanged();
        }
        catch (cause) {
            setSendError(String(cause instanceof Error ? cause.message : cause));
        }
    };
    /** 添加成员：逐个走现有 join 端点（幂等）。 */
    const addMembers = async () => {
        if (addGuard.current || (!addBatchRef.current && (addTab === 'existing' ? addChecked.size === 0 : addKnights.length === 0)))
            return;
        addGuard.current = true;
        setAddBusy(true);
        setSendError(undefined);
        try {
            if (!isCurrent())
                throw new MemberCreationStopped();
            let batch = addBatchRef.current;
            if (!batch) {
                if (addTab === 'preset' && (new Set(addKnights.map((knight) => knight.title.trim())).size !== addKnights.length || addKnights.some((knight) => knight.title.trim() === '')))
                    throw new Error('同一会议的骑士名称必须非空且不重复');
                const resolved = resolveKnightWorkspaces(addTab === 'preset' ? addKnights : [], workspaceSnapshot, currentSessionId);
                if (addTab === 'preset' && !resolved.ok)
                    throw Error(resolved.error);
                batch = memberCreationBatch(addTab === 'existing' ? [...addChecked].map(sessionId => ({ sessionId, title: nameOf(sessionId) })) : [], addTab === 'preset' ? addKnights : [], resolved.ok ? resolved.workspaceIds : []);
                saveAddBatch(batch);
            }
            batch = await runMemberCreation(batch, connection, step => postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/join`, { sessionId: step.sessionId, origin: step.presetId ? { source: 'preset', presetId: step.presetId, workspaceId: step.workspaceId } : { source: 'existing' }, ...(step.role ? { role: step.role } : {}) }), saveAddBatch, isCurrent);
            if (batch.members.some(x => x.stage !== 'done'))
                setSendError('部分成员未完成；已加入的成员不会重复创建或再次简报。请查看逐项结果。');
            else {
                setAddChecked(new Set());
                setAddKnights([]);
            }
            await onChanged();
        }
        catch (cause) {
            setSendError(String(cause instanceof Error ? cause.message : cause));
        }
        finally {
            addGuard.current = false;
            setAddBusy(false);
        }
    };
    /** 广播核心（输入框与"结论发到会议"共用同一条投递通道——红线：不新造投递路径）。 */
    const broadcastText = async (text) => {
        if (text === '' || sending)
            return false;
        setSending(true);
        setSendError(undefined);
        const tagged = meetingTag(meeting.title, text);
        const deliveries = [];
        for (const sessionId of meeting.memberSessionIds) {
            const face = resolveFace(rtCtx, sessionId);
            if (face === undefined) {
                deliveries.push({ sessionId, status: 'undelivered', error: '窗口不在当前会话列表（离线或已移除）' });
                continue;
            }
            try {
                const result = await face.prompt([{ type: 'text', text: tagged }], 'queue');
                if (result.ok) {
                    deliveries.push({ sessionId, status: 'delivered' });
                }
                else {
                    deliveries.push({ sessionId, status: 'undelivered', error: result.error.message ?? String(result.error.code ?? '拒绝接收') });
                }
            }
            catch (cause) {
                deliveries.push({ sessionId, status: 'undelivered', error: String(cause instanceof Error ? cause.message : cause) });
            }
        }
        try {
            await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/broadcast`, { text, deliveries });
            await onChanged();
            return true;
        }
        catch (cause) {
            setSendError(String(cause instanceof Error ? cause.message : cause));
            return false;
        }
        finally {
            setSending(false);
        }
    };
    const broadcast = async () => {
        const text = draft.trim();
        if (await broadcastText(text))
            setDraft('');
    };
    /** 辩论结论发到会议（复用广播通道）。 */
    const publishConclusion = async (text) => {
        await broadcastText(text);
    };
    /** 辩论结论派给成员（复用 R4 dispatch 端点）。 */
    const dispatchConclusion = async (toSessionId, title, text) => {
        setSendError(undefined);
        try {
            await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/dispatch`, { toSessionId, title, text });
            await onChanged();
        }
        catch (cause) {
            setSendError(String(cause instanceof Error ? cause.message : cause));
        }
    };
    /** @派遣：host 端点内嵌圆桌任务投递。 */
    const dispatch = async () => {
        const text = draft.trim();
        if (text === '' || sending || target === undefined)
            return;
        setSending(true);
        setSendError(undefined);
        try {
            await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/dispatch`, {
                toSessionId: target.sessionId,
                title: text.length > 24 ? `${text.slice(0, 24)}…` : text,
                text,
            });
            setDraft('');
            setTarget(undefined);
            await onChanged();
        }
        catch (cause) {
            // 显示会议端点返回的具体失败原因，便于核对成员与输入。
            setSendError(String(cause instanceof Error ? cause.message : cause));
        }
        finally {
            setSending(false);
        }
    };
    const send = () => {
        void saveMessage();
    };
    const saveMessage = async () => {
        const text = draft.trim();
        if (!text || saveBusy.current)
            return;
        saveBusy.current = true;
        setSending(true);
        setSendError(undefined);
        if (messageRequest.current?.text !== text)
            messageRequest.current = { text, id: crypto.randomUUID() };
        try {
            await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/message`, { text, requestId: messageRequest.current.id });
            setDraft('');
            messageRequest.current = undefined;
            await onChanged();
        }
        catch (error) {
            setSendError(error instanceof Error ? error.message : String(error));
        }
        finally {
            saveBusy.current = false;
            setSending(false);
        }
    };
    // @候选：只能是本会参会窗口（红线）
    const candidates = mention === undefined ? [] : meeting.memberSessionIds
        .map((sessionId) => ({ sessionId, label: nameOf(sessionId) }))
        .filter((item) => mention.query === '' || item.label.includes(mention.query));
    const pickMention = (sessionId, label) => {
        if (mention === undefined)
            return;
        // 摘掉草稿尾的 @query token，派遣对象改由 chip 承载
        setDraft((value) => `${value.slice(0, mention.start)}${value.slice(mention.start + 1 + mention.query.length)}`);
        setTarget({ sessionId, label });
        setMention(undefined);
    };
    const history = meeting.events.filter((event) => event.kind !== 'create' && (tab !== 'tasks' || event.kind === 'task'));
    const taskAttention = meeting.releases?.flatMap(r => r.tasks).filter(t => taskNeedsAction(meeting, t)) ?? [];
    const faults = meeting.counts?.faults ?? taskAttention.filter(t => ['offline', 'uncertain', 'failed'].includes(t.status)).length;
    const awaitingReview = meeting.counts?.awaitingReview ?? taskAttention.filter(t => t.status === 'completed' && t.review !== 'accepted').length;
    const running = (meeting.counts?.running ?? taskAttention.filter(t => ['delivering', 'delivered', 'in_progress'].includes(t.status)).length) + taskAttention.filter(t => t.status === 'queued').length;
    const workflowRun = meeting.workflow?.runs.find(r => r.status === 'active') ?? meeting.workflow?.runs.at(-1);
    const latestMinutes = meeting.minutes?.at(-1);
    const nextAction = meeting.archivedAt ? { page: 'settings', label: '查看归档与恢复设置' } : faults ? { page: 'tasks', label: `核实 ${faults} 项投递或执行异常` } : awaitingReview ? { page: 'tasks', label: `验收 ${awaitingReview} 项已提交结果` } : meeting.memberSessionIds.length === 0 ? { page: 'members', label: '添加参会成员，开始这场会议' } : meeting.secretary?.status !== 'ready' ? { page: 'settings', label: meeting.secretary ? '重试秘书初始化' : '配置秘书，准备整理纪要' } : workflowRun?.status === 'active' && workflowRun.paused ? { page: 'workflow', label: '查看暂停原因与继续条件' } : latestMinutes?.integrity && !latestMinutes.integrity.reviewedAt ? { page: 'minutes', label: '核对最新纪要，再决定是否分享' } : workflowRun?.status === 'completed' && !latestMinutes ? { page: 'minutes', label: '流程已完成，整理会议纪要' } : running ? { page: 'tasks', label: `查看 ${running} 项等待／执行中的任务` } : workflowRun?.status === 'completed' ? { page: 'workflow', label: '本次运行已结束，查看记录或准备下一轮' } : { page: 'discussion', label: '记录会议内容，或 @ 成员提出问题' };
    const management = _jsx(MeetingManagement, { meeting: meeting, onChanged: onChanged, onDeleted: onDeleted ?? (() => onBack()) });
    const addPanel = (addOpen && (_jsxs("section", { "data-round-table-add-panel": "", style: {
            flex: 'none', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10,
            padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto',
        }, children: [!addBatch && _jsxs("div", { style: { display: 'flex', gap: 5 }, children: [_jsx("button", { type: "button", disabled: addBusy, style: buttonBase, "aria-pressed": addTab === 'existing', onClick: () => setAddTab('existing'), children: "\u9009\u62E9\u5DF2\u6709\u7A97\u53E3" }), _jsx("button", { type: "button", disabled: addBusy, style: buttonBase, "aria-pressed": addTab === 'preset', onClick: () => setAddTab('preset'), children: "\u6309\u9884\u8BBE\u65B0\u5EFA" })] }), !addBatch && addTab === 'existing' && _jsxs(_Fragment, { children: [_jsxs("span", { style: { fontSize: 12, ...textSecondary }, children: ["\u52FE\u9009\u7A97\u53E3\u52A0\u5165\u4F1A\u8BAE\uFF08", addChecked.size, " \u5DF2\u9009\uFF09"] }), _jsx(SessionPicker, { rows: nonMemberRows, archivedSessionIds: archivedSessionIds, checked: addChecked, onToggle: (id) => {
                            if (addBusy)
                                return;
                            setAddChecked((prev) => {
                                const next = new Set(prev);
                                if (next.has(id))
                                    next.delete(id);
                                else
                                    next.add(id);
                                return next;
                            });
                        } })] }), !addBatch && addTab === 'preset' && _jsx(PresetKnightPicker, { api: connection.api, workspaces: workspaces, followCurrentLabel: followCurrentLabel, selected: addKnights, onChange: next => { if (!addBusy)
                    setAddKnights(next); } }), addBatch && _jsxs("section", { "aria-label": "\u6210\u5458\u521B\u5EFA\u8FDB\u5EA6", children: [memberCreationResults(addBatch), addBatch.members.every(x => x.stage === 'done') && _jsx("p", { role: "status", children: "\u672C\u6279\u6210\u5458\u5DF2\u5168\u90E8\u52A0\u5165\u3002" })] }), (!persistence.available || !memberProgressSaved) && _jsx("p", { role: "alert", children: "\u521B\u5EFA\u8FDB\u5EA6\u4EC5\u5728\u672C\u7A97\u53E3\u5185\u4FDD\u7559\uFF0C\u5173\u95ED\u6216\u5237\u65B0\u524D\u8BF7\u8BB0\u4E0B\u7A97\u53E3\u8EAB\u4EFD\u3002" }), _jsx("button", { type: "button", "data-round-table-add-submit": "", style: { ...primaryButton, alignSelf: 'flex-start' }, disabled: addBusy || (!addBatch && (addTab === 'existing' ? addChecked.size === 0 : addKnights.length === 0)), onClick: () => { if (addBatch?.members.every(x => x.stage === 'done'))
                    saveAddBatch(undefined);
                else
                    void addMembers(); }, children: addBusy ? '加入中…' : addBatch ? addBatch.members.every(x => x.stage === 'done') ? '继续添加成员' : '重试未完成步骤' : addTab === 'existing' ? '加入所选' : '创建并加入' })] })));
    const openMember = (id, taskId) => { setSidebarOpen(true); setSelectedMember(id ?? null); if (taskId)
        setFocusTask({ id: taskId, nonce: Date.now() }); };
    const navigate = (page) => { if (page === 'members') {
        openMember();
        return;
    } if (page === 'tasks') {
        setTaskModal(true);
        return;
    } setTab(page); };
    if (meeting.deletion)
        return _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsx("button", { style: buttonBase, onClick: onBack, children: "\u8FD4\u56DE\u4F1A\u8BAE\u5217\u8868" }), management, _jsx("button", { style: buttonBase, onClick: onRecovery, children: "\u627E\u56DE\u65E7\u8349\u7A3F" })] });
    return (_jsxs("div", { className: "rt-meeting-shell", style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 4 }, children: [_jsx("style", { children: meetingShellStyles }), _jsxs("header", { className: "rt-meeting-header", "aria-label": "\u4F1A\u8BAE\u7BA1\u7406", children: [_jsxs("div", { className: "rt-meeting-title-row", children: [_jsx("button", { style: buttonBase, onClick: onBack, children: "\u2190 \u8FD4\u56DE" }), _jsx("b", { title: meeting.title, children: meeting.title }), _jsx("span", { "data-meeting-status": "", children: meeting.archivedAt ? '已归档' : meeting.releasePaused ? '暂停投递' : workflowRun?.status === 'completed' ? '本次运行已结束' : workflowRun?.paused ? '流程暂停' : '会议讨论' }), _jsx("button", { style: buttonBase, "aria-expanded": overview, onClick: () => setOverview(v => !v), children: "\u4F1A\u8BAE\u6982\u51B5" }), _jsx("button", { style: buttonBase, onClick: () => { openMember(); setAddOpen(true); }, disabled: !!meeting.archivedAt, children: "\u6DFB\u52A0\u6210\u5458" })] }), _jsxs("div", { className: "rt-meeting-summary-row", children: [_jsx("button", { style: buttonBase, onClick: () => openMember(), "aria-expanded": sidebarOpen, children: "\u6210\u5458" }), _jsxs("span", { children: [meeting.memberSessionIds.length, "\u4EBA \u00B7 ", faults, "\u9879\u5F02\u5E38 \u00B7 ", awaitingReview, "\u9879\u5F85\u9A8C\u6536"] }), _jsxs("button", { "data-meeting-next-action": "", style: buttonBase, onClick: () => nextAction.page === 'tasks' ? openMember(taskAttention[0]?.toSessionId, taskAttention[0]?.taskId) : navigate(nextAction.page), children: ["\u4E0B\u4E00\u6B65\uFF1A", nextAction.label] })] }), overview && _jsxs("section", { className: "rt-meeting-overview", children: [_jsx("p", { children: meeting.description || '尚未填写会议说明' }), _jsxs("p", { children: ["\u79D8\u4E66\uFF1A", meeting.secretary?.status === 'ready' ? '就绪' : '待配置', " \u00B7 ", running, "\u9879\u7B49\u5F85\uFF0F\u6267\u884C\u4E2D"] }), taskAttention.map(t => _jsxs("button", { style: buttonBase, onClick: () => openMember(t.toSessionId, t.taskId), children: [nameOf(t.toSessionId), " \u00B7 ", t.status === 'completed' ? reviewState(meeting, t) : taskRecoveryText(t)?.title ?? t.status, " \u2192 \u5DE5\u4F5C\u65E5\u5FD7"] }, t.taskId))] })] }), _jsxs("nav", { className: "rt-meeting-nav", "aria-label": "\u4F1A\u8BAE\u529F\u80FD", children: [[['discussion', '讨论'], ['workflow', '进程'], ['resources', '资料'], ['minutes', '纪要'], ['settings', '设置']].map(([id, label]) => _jsx("button", { type: "button", style: { ...buttonBase, fontWeight: tab === id ? 700 : 400, borderBottom: tab === id ? '2px solid var(--dsw-alias-state-business-primary)' : undefined, background: tab === id ? 'var(--dsw-alias-interactive-bg-hover)' : undefined }, "aria-pressed": tab === id, onClick: () => navigate(id), children: label }, id)), _jsx("button", { style: buttonBase, onClick: () => setTaskModal(true), children: "\u4EFB\u52A1\u5361" })] }), _jsxs("div", { className: "rt-meeting-body", "data-meeting-body": "", style: { flex: 1, minHeight: 0, display: 'flex', position: 'relative' }, children: [_jsxs("div", { className: "rt-meeting-content", style: { flex: 1, minWidth: 0, minHeight: 0, overflowY: tab === 'discussion' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsxs("div", { style: { display: tab === 'settings' ? 'contents' : 'none' }, children: [management, _jsx("button", { style: buttonBase, onClick: onRecovery, children: "\u627E\u56DE\u65E7\u8349\u7A3F" })] }), _jsx("div", { style: { display: tab === 'settings' ? 'contents' : 'none' }, children: _jsxs("section", { "data-round-table-secretary": "", style: { flex: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 7, fontSize: 12, ...textSecondary }, children: ["\u79D8\u4E66 \u00B7 ", meeting.secretary?.status === 'ready' ? '就绪' : meeting.secretary === undefined ? '尚未配置' : meeting.secretary.status === 'initializing' ? '正在初始化…' : '初始化失败', meeting.secretary?.error !== undefined ? `：${meeting.secretary.error}` : '', meeting.secretary?.status !== 'ready' && meeting.secretary?.status !== 'initializing' && _jsxs("div", { children: [_jsx(_Fragment, { children: meeting.secretary === undefined && _jsxs(_Fragment, { children: [_jsx("p", { style: { margin: 0 }, children: "\u6B64\u4F1A\u8BAE\u5C1A\u672A\u914D\u7F6E\u79D8\u4E66\u3002\u8BF7\u9009\u62E9\u5DE5\u4F5C\u533A\u8865\u5EFA\uFF1B\u4E0D\u4F1A\u91CD\u65B0\u521B\u5EFA\u4F1A\u8BAE\u6216\u5F71\u54CD\u666E\u901A\u6210\u5458\u3002" }), _jsxs("select", { "aria-label": "\u79D8\u4E66\u9ED8\u8BA4\u5DE5\u4F5C\u533A", value: secretaryWorkspaceChoice || meeting.defaultWorkspaceId || '', onChange: (e) => setSecretaryWorkspaceChoice(e.target.value), children: [_jsx("option", { value: "", children: "\u9009\u62E9\u9ED8\u8BA4\u5DE5\u4F5C\u533A" }), workspaces.map((w) => _jsx("option", { value: w.workspaceId, children: w.title }, w.workspaceId))] })] }) }), _jsx("button", { type: "button", disabled: secretaryBusy, onClick: () => { void retrySecretary(); }, children: secretaryBusy ? '正在配置…' : meeting.secretary ? '重试秘书初始化' : '补建会议秘书' })] })] }) }), _jsx("div", { style: { display: taskModal || ['discussion', 'tasks'].includes(tab) ? 'contents' : 'none' }, children: _jsx(ReleasePanel, { taskCards: meeting.taskCards, taskCardGenerations: meeting.taskCardGenerations, cardPublications: meeting.cardPublications, focusTask: focusTask, meetingId: meeting.meetingId, workflow: meeting.workflow, messages: meeting.messages, releases: meeting.releases, paused: meeting.releasePaused, archived: !!meeting.archivedAt, assets: meeting.assets, memberStatus: meeting.memberStatus, view: tab, discussions: meeting.discussions, onViewChange: navigate, taskModal: taskModal, onCloseTask: () => setTaskModal(false), onOpenMember: openMember, onOpenSession: id => rtCtx.uiWorkspace.openSession(id), onJumpMeeting: onJumpMeeting, names: meeting.memberNames, members: meeting.memberSessionIds.map(id => ({ id, name: nameOf(id) })), onChanged: onChanged }, meeting.meetingId) }), tab === 'workflow' && _jsx(WorkflowPanel, { onNavigate: navigate, meeting: meeting, members: meeting.memberSessionIds.map(id => ({ id, name: nameOf(id) })), onChanged: onChanged, onOpenSession: id => rtCtx.uiWorkspace.openSession(id) }, meeting.meetingId), tab === 'resources' && _jsx(ResourcesPanel, { meetingId: meeting.meetingId, assets: meeting.assets, folder: meeting.meetingFolder, folderError: meeting.meetingFolderError, archived: !!meeting.archivedAt, onChanged: onChanged }, meeting.meetingId), tab === 'minutes' && _jsx(MinutesPanel, { meetingId: meeting.meetingId, members: meeting.memberSessionIds.map(id => ({ id, name: nameOf(id) })), ready: meeting.secretary?.status === 'ready' && !meeting.archivedAt, minutes: meeting.minutes, publishedIds: (meeting.messages ?? []).filter(m => !!m.minutesId && !m.previewOnly).map(m => m.minutesId), job: meeting.minutesJob, formalOnly: meeting.minutesSource !== 'session', onChanged: onChanged }), tab === 'settings' && history.length > 0 && (_jsxs("details", { children: [_jsx("summary", { children: "\u5386\u53F2\u5E7F\u64AD\u4E0E\u65E7\u4EFB\u52A1" }), _jsxs("section", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 500, ...textSecondary }, children: "\u4F1A\u8BAE\u8BB0\u5F55" }), history.map((event) => {
                                                if (event.kind === 'rename')
                                                    return _jsxs("p", { style: { fontSize: 11, ...textTertiary }, children: ["\u4F1A\u8BAE\u6539\u540D\uFF1A", event.oldTitle, " \u2192 ", event.title] }, event.id);
                                                if (event.kind === 'description_update')
                                                    return _jsx("p", { style: { fontSize: 11, ...textTertiary }, children: "\u4F1A\u8BAE\u8BF4\u660E\u5DF2\u66F4\u65B0" }, event.id);
                                                if (event.kind === 'join' || event.kind === 'leave') {
                                                    return (_jsxs("p", { style: { margin: 0, fontSize: 11, ...textTertiary }, children: [new Date(event.time).toLocaleTimeString(), " ", nameOf(event.sessionId), " ", event.kind === 'join' ? `加入会议（${event.source === 'secretary' ? '会议秘书' : event.source === 'preset' ? `预设新建：${event.presetId ?? '未知预设'}${event.workspaceId === undefined ? '' : `，工作区 ${event.workspaceId}`}` : '已有窗口'}）` : '退出会议'] }, event.id));
                                                }
                                                if (event.kind === 'task') {
                                                    return (_jsxs("article", { "data-round-table-task": event.taskId, "data-round-table-task-status": event.status, style: {
                                                            border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '6px 10px',
                                                            display: 'flex', flexDirection: 'column', gap: 4,
                                                        }, children: [_jsxs("p", { style: { margin: 0, fontSize: 12, lineHeight: '18px', ...textPrimary }, children: ["\u4EFB\u52A1\uFF1A", event.title] }), _jsxs("footer", { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 11 }, children: [_jsx("span", { style: {
                                                                            lineHeight: '16px', padding: '0 6px', borderRadius: 999,
                                                                            border: '1px solid var(--dsw-alias-border-l2)', color: taskStatusColor(event.status),
                                                                        }, children: TASK_STATUS_LABEL[event.status] ?? event.status }), _jsxs("span", { style: textTertiary, children: ["\u2192 ", event.toMember, "\uFF08", event.teamName, "\uFF09"] })] }), event.status === 'completed' && event.result !== undefined && (_jsxs("p", { style: { margin: 0, fontSize: 12, lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...textSecondary }, children: ["\u7ED3\u679C\uFF1A", event.result] })), event.error !== undefined && (_jsx("p", { style: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }, children: event.error }))] }, event.id));
                                                }
                                                if (event.kind === 'minutes')
                                                    return _jsxs("p", { style: { fontSize: 11, margin: 0, ...textTertiary }, children: [new Date(event.time).toLocaleTimeString(), " \u79D8\u4E66\u5DF2\u751F\u6210\u7EAA\u8981\uFF08\u5728\u4E0A\u65B9\u9884\u89C8\uFF09"] }, event.id);
                                                if (event.kind !== 'broadcast')
                                                    return null;
                                                return (_jsxs("article", { "data-round-table-broadcast": event.id, style: {
                                                        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '6px 10px',
                                                        display: 'flex', flexDirection: 'column', gap: 4,
                                                    }, children: [_jsx("p", { style: { margin: 0, fontSize: 12, lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...textPrimary }, children: event.text }), _jsx("footer", { style: { display: 'flex', flexWrap: 'wrap', gap: 4 }, children: event.deliveries.map((delivery) => (_jsxs("span", { "data-round-table-delivery": delivery.status, title: delivery.error ?? delivery.status, style: {
                                                                    fontSize: 11, lineHeight: '16px', padding: '0 6px', borderRadius: 999,
                                                                    border: '1px solid var(--dsw-alias-border-l2)',
                                                                    color: delivery.status === 'delivered' ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-state-error-primary)',
                                                                }, children: [delivery.status === 'delivered' ? '✓' : '✗ 未送达', " ", nameOf(delivery.sessionId)] }, delivery.sessionId))) })] }, event.id));
                                            })] })] }))] }), _jsx(MemberSidebar, { open: sidebarOpen, meeting: meeting, members: [...new Set([...meeting.memberSessionIds, ...Object.keys(meeting.memberNames ?? {}), ...(meeting.releases ?? []).flatMap(r => r.tasks.map(t => t.toSessionId)), ...(meeting.discussions ?? []).flatMap(d => d.recipientIds)])].filter(id => !['user', 'secretary', meeting.secretary?.sessionId].includes(id)).map(id => ({ id, name: nameOf(id), historical: !meeting.memberSessionIds.includes(id), connected: meeting.memberStatus?.[id]?.connected, running: meeting.memberStatus?.[id]?.running, statusLabel: !meeting.memberSessionIds.includes(id) ? '已离会 · 历史记录' : meeting.memberStatus?.[id]?.availability?.reason ?? (meeting.memberStatus?.[id]?.connected ? '已就绪' : '尚未加载'), workspaceLabel: memberWorkspaceInfo(id, rowOf(id)?.cwd, workspaces).label })), selectedMemberId: selectedMember, onSelectMember: setSelectedMember, onClose: () => setSidebarOpen(false), focusTaskId: focusTask?.id, onNavigateTask: taskId => { const task = meeting.releases?.flatMap(r => r.tasks).find(t => t.taskId === taskId); if (task)
                            openMember(task.toSessionId, taskId); }, renderManagement: () => addPanel, renderMemberDetails: id => !meeting.memberSessionIds.includes(id) ? _jsx("p", { children: "\u8FD9\u4F4D\u6210\u5458\u5DF2\u79BB\u4F1A\uFF0C\u5386\u53F2\u53D1\u8A00\u3001\u4EFB\u52A1\u7ED3\u679C\u4E0E\u4FEE\u6539\u8BB0\u5F55\u4ECD\u53EF\u5728\u4F1A\u8BAE\u5DE5\u4F5C\u65E5\u5FD7\u67E5\u770B\u3002" }) : _jsx(MemberLive, { nameOf: nameOf, sessionId: id, running: meeting.memberStatus?.[id]?.running ?? false, present: meeting.memberStatus?.[id]?.connected ?? false, cwd: rowOf(id)?.cwd, workspaces: workspaces, meetingId: meeting.meetingId, onChanged: onChanged, onRemove: removeMember, onOpen: sessionId => rtCtx.uiWorkspace.openSession(sessionId), releases: meeting.releases, discussions: meeting.discussions, workflow: meeting.workflow, availability: meeting.memberStatus?.[id]?.availability }, id), renderTaskActions: id => _jsx(MemberTaskActions, { meetingId: meeting.meetingId, memberId: id, memberName: nameOf(id), discussions: meeting.discussions ?? [], releases: meeting.releases ?? [], onChanged: onChanged, focusTaskId: focusTask?.id }, id) })] }), sendError !== undefined && (_jsx("p", { role: "alert", style: { flex: 'none', margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }, children: sendError })), tab === 'settings' && _jsxs("details", { style: { flex: 'none', fontSize: 12 }, children: [_jsx("summary", { children: "\u7ACB\u5373\u64CD\u4F5C\uFF08\u4F1A\u5524\u9192\u6210\u5458\uFF0C\u4E0D\u53D7\u653E\u884C\u961F\u5217\u6682\u505C\u7EA6\u675F\uFF09" }), _jsx("textarea", { "aria-label": "\u7ACB\u5373\u53D1\u9001\u5185\u5BB9", rows: 3, style: inputStyle, value: draft, placeholder: "\u8F93\u5165\u8981\u7ACB\u5373\u53D1\u9001\u7684\u5185\u5BB9", onChange: e => setDraft(e.target.value) }), _jsxs("select", { "aria-label": "\u7ACB\u5373\u53D1\u9001\u5BF9\u8C61", style: inputStyle, value: target?.sessionId ?? '', onChange: e => setTarget(e.target.value ? { sessionId: e.target.value, label: nameOf(e.target.value) } : undefined), children: [_jsx("option", { value: "", children: "\u5168\u5458\u5E7F\u64AD" }), meeting.memberSessionIds.map(id => _jsx("option", { value: id, children: nameOf(id) }, id))] }), _jsxs("button", { type: "button", style: buttonBase, disabled: sending || !!meeting.archivedAt || !draft.trim() || !meeting.memberSessionIds.length, onClick: () => setImmediateConfirm(true), children: [target ? `立即派遣给 ${target.label}` : '立即广播全员', "\u2026"] }), immediateConfirm && _jsxs("div", { role: "alertdialog", "aria-label": "\u786E\u8BA4\u7ACB\u5373\u5524\u9192", children: [_jsxs("p", { children: ["\u5C06\u7ACB\u5373\u53D1\u9001\u7ED9", target?.label ?? `${meeting.memberSessionIds.length} 位成员`, "\u3002\u539F\u7A97\u53E3\u53EF\u80FD\u5F00\u59CB\u5DE5\u4F5C\u5E76\u6D88\u8017 Token\u3002"] }), _jsx("button", { style: buttonBase, disabled: sending, onClick: () => { setImmediateConfirm(false); if (target)
                                    void dispatch();
                                else
                                    void broadcast(); }, children: "\u786E\u8BA4\u7ACB\u5373\u53D1\u9001" }), _jsx("button", { style: buttonBase, onClick: () => setImmediateConfirm(false), children: "\u53D6\u6D88" })] })] })] }));
}
