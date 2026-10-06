import { workflowSchemaSupported } from "./workflow-types.js";
import { previewTaskRevision, startTaskRevision, RevisionStartRejected } from "./task-revision.js";
import { storageScope } from "./local-scope.js";
import { ReleaseRequestRejected } from "./meeting-flow.js";
import { appendBroadcast, createMeeting, joinMeeting, leaveMeeting, listMeetings, readMeeting, mutateMeeting, stateRoot, } from "./meetings.js";
import { dispatchMeetingTask } from "./task-relay.js";
import { transitionTask } from "./tasks.js";
import { createSecretary } from "./secretary.js";
import { startMinutes, cancelMinutes, sendMinutes, meetingMinutesData } from "./minutes.js";
import { editMeeting, deleteMeeting } from "./meeting-management.js";
import { withMeetingActivity } from "./meeting-activity.js";
import { requireActiveMeeting } from "./meetings.js";
import { saveMeetingMessage, saveReleaseDraft, releaseDraft, retryReleaseTask, stopReleaseTask, findReleaseTask, meetingMessageStream, listPublishCandidates, publishSelectedReply, setReleasePaused } from "./meeting-flow.js";
import { SessionId } from '@deepseek-ai/dsh-session';
import { createHash } from 'node:crypto';
import { manageMeeting, addMeetingAsset, readMeetingAsset, exportMeeting, liveStatus, liveStatusAsync, taskCounts, activityTime, repairUnsupportedImage } from "./meeting-ux.js";
import { workflowAction } from "./workflow-routes.js";
import { workflowViews } from "./workflow-projection.js";
import { markMeetingConclusion } from "./meeting-flow.js";
import { memberForExecution, inspectMember } from "./member-session.js";
import { ensureMemberBriefing } from "./member-briefing.js";
import { beginFileUpload, appendFileUpload, finishFileUpload, cancelFileUpload, openMeetingAssetDownload, FileUploadRejected } from "./meeting-file-upload.js";
import { retryDiscussionDelivery, closeDiscussionDelivery, pumpDiscussions } from "./discussion.js";
import { previewChat, commitChat, publishChatMinutes, ChatConflict } from "./chat.js";
import { imageRecipientCapabilities } from "./image-preflight.js";
import { ensureMeetingFolder, meetingFolderSnapshot, readMeetingDocument } from "./meeting-folder.js";
import { syncMeetingFolderInstructions } from "./meeting-folder.js";
import { startTaskCardGeneration, adjustTaskCard, editTaskCard, adoptTaskCardProposal, publishTaskCards, TaskCardRequestRejected } from "./task-cards.js";
/** 会议集合端点（exact）。 */
export const MEETINGS_ROUTE_PATH = '/plugins/round-table/meetings';
/** 会议动作端点前缀（prefix 不带尾斜杠——webserver 的匹配是 startsWith(prefix+'/')）。 */
export const MEETINGS_ROUTE_PREFIX = '/plugins/round-table/meetings';
function sendJson(res, status, value) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
}
/** 读请求体 JSON（空体视为 {}；非法 JSON 抛错由调用方转 400）。 */
async function readJsonBody(req) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        bytes += buffer.length;
        if (bytes > 4000000)
            throw new Error('请求内容过大，请拆分资料');
        chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw.trim() === '')
        return {};
    const value = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('body must be a JSON object');
    return value;
}
function stringArray(value) {
    return Array.isArray(value) ? value.map(String).filter((item) => item.trim() !== '') : [];
}
function parseDeliveries(value) {
    if (!Array.isArray(value))
        throw new Error('broadcast requires a "deliveries" array');
    return value.map((item) => {
        const v = item;
        if (typeof v?.['sessionId'] !== 'string' || (v['status'] !== 'delivered' && v['status'] !== 'undelivered')) {
            throw new Error('delivery requires { sessionId, status: "delivered" | "undelivered" }');
        }
        return {
            sessionId: v['sessionId'],
            status: v['status'],
            ...(typeof v['error'] === 'string' ? { error: v['error'] } : {}),
        };
    });
}
/** 可选入会来源仅作审计记录；预设 id / workspace id 都不在这里解析或写入。 */
function parseJoinOrigin(value) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('join origin must be an object');
    const raw = value;
    if (raw['source'] !== 'existing' && raw['source'] !== 'preset')
        throw new Error('join origin requires source "existing" or "preset"');
    if (raw['presetId'] !== undefined && typeof raw['presetId'] !== 'string')
        throw new Error('join origin presetId must be a string');
    if (raw['workspaceId'] !== undefined && typeof raw['workspaceId'] !== 'string')
        throw new Error('join origin workspaceId must be a string');
    return {
        source: raw['source'],
        ...(typeof raw['presetId'] === 'string' ? { presetId: raw['presetId'] } : {}),
        ...(typeof raw['workspaceId'] === 'string' ? { workspaceId: raw['workspaceId'] } : {}),
    };
}
/** 会议集合端点：GET 列表 / POST 创建。 */
async function meetingsHandler(ctx, req, res) {
    try {
        const root = stateRoot();
        if (req.method === 'GET') {
            const query = new URL(req.url ?? '/', 'http://localhost').searchParams, all = await listMeetings(root), compact = query.get('view') === 'summary', detail = query.get('detail');
            const value = { meetings: await Promise.all(all.map(async (m) => {
                    const activeRun = m.workflow && workflowSchemaSupported(m.workflow.schemaVersion) ? m.workflow.runs.find(r => r.status === 'active') : undefined;
                    const lastRun = m.workflow && workflowSchemaSupported(m.workflow.schemaVersion) ? m.workflow.runs.at(-1) : undefined;
                    const common = { meetingId: m.meetingId, title: m.title, description: m.description, createdAt: m.createdAt, memberSessionIds: m.memberSessionIds, memberNames: m.memberNames, secretary: m.secretary, deletion: m.deletion, archivedAt: m.archivedAt, pinnedAt: m.pinnedAt, releasePaused: m.releasePaused, lastActivity: activityTime(m), counts: taskCounts(m), defaultWorkspaceId: m.defaultWorkspaceId, workflowStatus: activeRun ? (activeRun.paused ? 'paused' : 'active') : lastRun?.status, listReadOnly: !!m.workflow && !workflowSchemaSupported(m.workflow.schemaVersion) };
                    return compact && detail !== m.meetingId ? { ...common, events: [] } : { ...m, ...common, messages: meetingMessageStream(m), memberStatus: await liveStatusAsync(ctx, m, all), ...(activeRun ? { workflowViews: workflowViews(m, activeRun) } : {}) };
                })) };
            const etag = '"' + createHash('sha256').update(JSON.stringify(value)).digest('hex') + '"';
            if (req.headers?.['if-none-match'] === etag) {
                res.writeHead(304);
                res.end();
                return;
            }
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', etag });
            res.end(JSON.stringify(value));
            return;
        }
        if (req.method === 'POST') {
            const body = await readJsonBody(req);
            if (body['action'] === 'availability') {
                const ids = Array.isArray(body['ids']) ? body['ids'].slice(0, 500).filter((x) => typeof x === 'string') : [];
                sendJson(res, 200, { connections: Object.fromEntries(ids.map(id => [id, !!ctx.agents.get(SessionId(id))])) });
                return;
            }
            const title = typeof body['title'] === 'string' ? body['title'].trim() : '';
            if (title === '') {
                sendJson(res, 400, { error: 'create requires a non-empty "title" field' });
                return;
            }
            const description = typeof body['description'] === 'string' ? body['description'].trim() : '';
            if (description === '') {
                sendJson(res, 400, { error: 'create requires a non-empty "description" field' });
                return;
            }
            const secretaryWorkspaceId = typeof body['secretaryWorkspaceId'] === 'string' ? body['secretaryWorkspaceId'] : '';
            if (secretaryWorkspaceId === '') {
                sendJson(res, 400, { error: 'create requires secretaryWorkspaceId' });
                return;
            }
            const registry = ctx.get('workspaceRegistry');
            const workspace = registry?.get(secretaryWorkspaceId);
            if (workspace === undefined || workspace.id !== secretaryWorkspaceId) {
                sendJson(res, 400, { error: '秘书默认工作区不可用' });
                return;
            }
            const requestId = body['requestId'];
            if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))) {
                sendJson(res, 400, { error: '非法建会请求ID', requestState: 'rejected' });
                return;
            }
            const meeting = await createMeeting(root, title, stringArray(body['memberSessionIds']), description, typeof requestId === 'string' ? { requestId, workspaceId: secretaryWorkspaceId } : undefined);
            if (!requestId)
                await mutateMeeting(root, meeting.meetingId, m => ({ ...m, defaultWorkspaceId: secretaryWorkspaceId }));
            try {
                await ensureMeetingFolder(ctx, meeting.meetingId);
                await mutateMeeting(root, meeting.meetingId, m => ({ ...m, meetingFolderError: undefined }));
            }
            catch (error) {
                await mutateMeeting(root, meeting.meetingId, m => ({ ...m, meetingFolderError: String(error instanceof Error ? error.message : error) }));
            }
            try {
                sendJson(res, 200, { meeting: await createSecretary(ctx, root, (await readMeeting(root, meeting.meetingId)), { workspaceId: workspace.id, path: workspace.path }) });
            }
            catch (error) {
                sendJson(res, 200, { meeting: await readMeeting(root, meeting.meetingId), secretaryFailed: String(error) });
            }
            return;
        }
        sendJson(res, 405, { error: 'method not allowed' });
    }
    catch (error) {
        sendJson(res, 400, { error: String(error instanceof Error ? error.message : error) });
    }
}
/** 会议动作端点：/<meetingId>/join、/<meetingId>/broadcast、/<meetingId>/dispatch。 */
async function meetingActionHandler(ctx, req, res) {
    try {
        if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method not allowed' });
            return;
        }
        const pathname = new URL(req.url ?? '/', 'http://x').pathname;
        const rest = pathname.startsWith(MEETINGS_ROUTE_PREFIX) ? pathname.slice(MEETINGS_ROUTE_PREFIX.length) : '';
        const segments = rest.split('/').filter((segment) => segment !== '');
        if (segments.length !== 2) {
            sendJson(res, 404, { error: 'unknown round-table meetings endpoint' });
            return;
        }
        let meetingId;
        try {
            meetingId = decodeURIComponent(segments[0]);
        }
        catch {
            sendJson(res, 400, { error: 'malformed meeting id encoding' });
            return;
        }
        const action = segments[1];
        const body = await readJsonBody(req);
        const root = stateRoot();
        if (action === 'delete') {
            sendJson(res, 200, await deleteMeeting(ctx, meetingId, body['confirmed'] === true, body['notify'] !== false));
            return;
        }
        await requireActiveMeeting(root, meetingId);
        if ((await requireActiveMeeting(root, meetingId)).archivedAt && !['archive', 'pin', 'export', 'lookup-message', 'asset-read', 'asset-download', 'minutes-data', 'member-status', 'member-reply', 'publish-candidates', 'list-templates', 'meeting-folder-status', 'meeting-file-read'].includes(action))
            throw new Error('会议已归档，请先恢复');
        if (action?.startsWith('workflow-')) {
            sendJson(res, 200, await workflowAction(ctx, meetingId, action, body));
            return;
        }
        if (action === 'chat-preview') {
            const m = await requireActiveMeeting(root, meetingId), plan = previewChat(m, body.input);
            sendJson(res, 200, { plan: { ...plan, imageCapabilities: body.input?.mode === 'send' ? await imageRecipientCapabilities(ctx, m, plan.recipientIds, plan.assetIds) : [] } });
            return;
        }
        if (action === 'meeting-folder-status') {
            sendJson(res, 200, { snapshot: await meetingFolderSnapshot(meetingId) });
            return;
        }
        if (action === 'meeting-folder-connect') {
            if (body.confirmed !== true)
                throw Error('请确认将本会材料和历史记录保存到会议工作区目录；此操作不会执行任务');
            const { connectMeetingFolder } = await import("./meeting-files-sync.js");
            sendJson(res, 200, { meeting: await connectMeetingFolder(ctx, meetingId) });
            return;
        }
        if (action === 'meeting-file-read') {
            const value = await readMeetingDocument(meetingId, String(body.fileId ?? ''));
            sendJson(res, 200, { file: { ref: value.ref, text: value.text, ...(value.bytes ? { data: Buffer.from(value.bytes).toString('base64') } : {}), referenceOnly: value.referenceOnly } });
            return;
        }
        if (action?.startsWith('task-card-')) {
            try {
                const rid = String(body.requestId ?? '');
                let value;
                if (action === 'task-card-generate')
                    value = await startTaskCardGeneration(ctx, meetingId, { recipientIds: stringArray(body.recipientIds), instruction: typeof body.instruction === 'string' ? body.instruction : '', messageIds: stringArray(body.messageIds), assetIds: stringArray(body.assetIds) }, rid);
                else if (action === 'task-card-adjust')
                    value = await adjustTaskCard(ctx, meetingId, String(body.cardId ?? ''), { expectedVersion: Number(body.expectedVersion), note: String(body.note ?? '') }, rid);
                else if (action === 'task-card-edit')
                    value = await editTaskCard(meetingId, String(body.cardId ?? ''), { expectedVersion: Number(body.expectedVersion), title: String(body.title ?? ''), body: String(body.body ?? ''), assigneeSessionId: typeof body.assigneeSessionId === 'string' ? body.assigneeSessionId : undefined }, rid);
                else if (action === 'task-card-adopt')
                    value = await adoptTaskCardProposal(meetingId, String(body.cardId ?? ''), String(body.proposalId ?? ''), Number(body.expectedVersion), rid);
                else if (action === 'task-card-publish') {
                    if (body.execute !== undefined && typeof body.execute !== 'boolean')
                        throw new TaskCardRequestRejected('发布执行方式非法');
                    value = await publishTaskCards(ctx, meetingId, { cards: body.cards, ...(typeof body.execute === 'boolean' ? { execute: body.execute } : {}) }, rid);
                }
                else
                    throw new TaskCardRequestRejected('未知任务卡操作');
                sendJson(res, 200, action === 'task-card-edit' || action === 'task-card-adopt' ? { card: value } : action === 'task-card-publish' ? { publication: value } : { generation: value });
            }
            catch (error) {
                const rejected = error instanceof TaskCardRequestRejected;
                sendJson(res, rejected ? 409 : 500, { error: error instanceof Error ? error.message : String(error), ...(rejected ? { requestState: 'rejected' } : {}) });
            }
            return;
        }
        if (action === 'discussion-retry') {
            await retryDiscussionDelivery(ctx, meetingId, String(body.discussionId ?? ''), String(body.sessionId ?? ''));
            await pumpDiscussions(ctx);
            sendJson(res, 200, { ok: true });
            return;
        }
        if (action === 'discussion-close') {
            await closeDiscussionDelivery(meetingId, String(body.discussionId ?? ''), String(body.sessionId ?? ''), body.confirmed === true);
            sendJson(res, 200, { ok: true });
            return;
        }
        if (action === 'member-retry') {
            const meeting = await requireActiveMeeting(root, meetingId), id = String(body.sessionId ?? '');
            if (body.confirmed !== true || !meeting.memberSessionIds.includes(id))
                throw Error('请确认恢复本会原成员');
            await memberForExecution(ctx, id);
            sendJson(res, 200, { status: await inspectMember(ctx, id) });
            return;
        }
        if (action === 'chat-send') {
            try {
                sendJson(res, 200, { receipt: await commitChat(meetingId, body.input, String(body.fingerprint ?? ''), String(body.requestId ?? ''), ctx) });
            }
            catch (error) {
                sendJson(res, error instanceof ChatConflict ? 409 : 500, { error: error instanceof Error ? error.message : String(error), ...(error instanceof ChatConflict ? { requestState: 'rejected' } : {}) });
            }
            return;
        }
        if (action === 'revision-preview') {
            const m = await readMeeting(root, meetingId);
            if (!m)
                throw Error('会议不存在');
            sendJson(res, 200, { plan: previewTaskRevision(m, String(body.taskId ?? ''), String(body.note ?? '')) });
            return;
        }
        if (action === 'revision-start') {
            try {
                sendJson(res, 200, { release: await startTaskRevision(meetingId, { taskId: String(body.taskId ?? ''), note: String(body.note ?? ''), fingerprint: String(body.fingerprint ?? ''), requestId: String(body.requestId ?? ''), confirmed: body.confirmed === true }) });
            }
            catch (error) {
                sendJson(res, error instanceof RevisionStartRejected ? 409 : 500, { error: error instanceof Error ? error.message : String(error), ...(error instanceof RevisionStartRejected ? { requestState: 'rejected' } : {}) });
            }
            return;
        }
        if (action === 'publish-minutes') {
            await publishChatMinutes(meetingId, String(body.minutesId ?? ''));
            sendJson(res, 200, { ok: true });
            return;
        }
        if (action === 'mark-conclusion') {
            if (typeof body.messageId !== 'string')
                throw new Error('缺少来源消息');
            sendJson(res, 200, { meeting: await markMeetingConclusion(meetingId, body.messageId) });
            return;
        }
        if (action === 'list-templates') {
            sendJson(res, 200, { templates: (await listMeetings(root)).filter(m => !m.deletion).flatMap(m => (m.templates ?? []).map(t => ({ ...t, sourceMeetingId: m.meetingId, title: `${m.title} / ${t.title}` }))) });
            return;
        }
        if (action === 'member-reply') {
            const page = await listPublishCandidates(ctx, meetingId, String(body['sessionId']));
            sendJson(res, 200, { text: page.items[0]?.text.slice(0, 1800) });
            return;
        }
        if (action === 'repair-image-input') {
            sendJson(res, 200, await repairUnsupportedImage(ctx, meetingId, String(body['taskId']), body['confirmed'] === true));
            return;
        }
        if (['close-task', 'review-task', 'review-minutes', 'archive', 'pin', 'minutes-source', 'delete-draft', 'save-template', 'delete-template', 'member-names'].includes(action)) {
            sendJson(res, 200, { meeting: await manageMeeting(meetingId, action, body) });
            return;
        }
        if (action?.startsWith('asset-upload-')) {
            try {
                if (action === 'asset-upload-begin')
                    sendJson(res, 200, { upload: await beginFileUpload(ctx, meetingId, { requestId: String(body.requestId ?? ''), name: String(body.name ?? ''), mimeType: String(body.mimeType ?? 'application/octet-stream'), totalBytes: Number(body.totalBytes) }) });
                else if (action === 'asset-upload-chunk')
                    sendJson(res, 200, { upload: await appendFileUpload(ctx, meetingId, { uploadId: String(body.uploadId ?? ''), offset: Number(body.offset), data: String(body.data ?? '') }) });
                else if (action === 'asset-upload-finish')
                    sendJson(res, 200, { asset: await finishFileUpload(ctx, meetingId, { uploadId: String(body.uploadId ?? '') }) });
                else if (action === 'asset-upload-cancel')
                    sendJson(res, 200, await cancelFileUpload(ctx, meetingId, { uploadId: String(body.uploadId ?? '') }));
                else
                    throw new FileUploadRejected('未知文件加载动作');
            }
            catch (error) {
                const rejected = error instanceof FileUploadRejected;
                sendJson(res, rejected ? 400 : 500, { error: error instanceof Error ? error.message : String(error), ...(rejected ? { requestState: 'rejected', retryable: false, code: error.code } : {}) });
            }
            return;
        }
        if (action === 'asset-download') {
            const { asset, stream } = await openMeetingAssetDownload(meetingId, String(body.id ?? ''));
            try {
                res.writeHead(200, { 'content-type': asset.mimeType || 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`, 'content-length': asset.bytes, 'cache-control': 'no-store' });
                await new Promise((resolve, reject) => { res.on('finish', resolve); res.on('close', () => { stream.destroy(); resolve(); }); stream.on('error', reject); stream.pipe(res); });
            }
            finally {
                stream.destroy();
            }
            return;
        }
        if (action === 'asset-upload') {
            sendJson(res, 200, { asset: await addMeetingAsset(ctx, meetingId, body) });
            return;
        }
        if (action === 'asset-read') {
            sendJson(res, 200, { asset: await readMeetingAsset(meetingId, String(body['id'])) });
            return;
        }
        if (action === 'export') {
            sendJson(res, 200, { markdown: exportMeeting(await requireActiveMeeting(root, meetingId)) });
            return;
        }
        if (action === 'lookup-message') {
            const message = meetingMessageStream(await requireActiveMeeting(root, meetingId)).find(x => x.id === body['id']);
            if (!message)
                throw new Error('消息不存在');
            sendJson(res, 200, { message });
            return;
        }
        if (action === 'member-status') {
            sendJson(res, 200, { members: liveStatus(ctx, await requireActiveMeeting(root, meetingId), await listMeetings(root)) });
            return;
        }
        if (action === 'release-pause') {
            if (typeof body['paused'] !== 'boolean')
                throw new Error('缺少暂停状态');
            await setReleasePaused(meetingId, body['paused']);
            sendJson(res, 200, { ok: true });
            return;
        }
        if (action === 'publish-candidates') {
            if (typeof body['sessionId'] !== 'string')
                throw new Error('缺少来源会话');
            sendJson(res, 200, await listPublishCandidates(ctx, meetingId, body['sessionId'], typeof body['before'] === 'number' ? body['before'] : undefined));
            return;
        }
        if (action === 'publish-reply') {
            if (typeof body['sessionId'] !== 'string' || typeof body['seq'] !== 'number' || typeof body['digest'] !== 'string' || typeof body['requestId'] !== 'string' || (body['taskId'] !== undefined && typeof body['taskId'] !== 'string'))
                throw new Error('缺少回复来源');
            sendJson(res, 200, { meeting: await publishSelectedReply(ctx, meetingId, { sessionId: body['sessionId'], seq: body['seq'], digest: body['digest'], requestId: body['requestId'], confirmed: body['confirmed'] === true, ...(typeof body['excerpt'] === 'string' ? { excerpt: body['excerpt'] } : {}), ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}), ...(typeof body['taskId'] === 'string' ? { taskId: body['taskId'] } : {}) }) });
            return;
        }
        if (action === 'message') {
            if (typeof body['text'] !== 'string' || typeof body['requestId'] !== 'string')
                throw new Error('消息需要正文和请求ID');
            sendJson(res, 200, { meeting: await saveMeetingMessage(meetingId, body['text'], body['requestId']) });
            return;
        }
        if (action === 'release-draft') {
            if (typeof body['id'] !== 'string' || typeof body['instruction'] !== 'string' || !Array.isArray(body['messageIds']) || !Array.isArray(body['recipientIds']))
                throw new Error('资料包字段缺失');
            sendJson(res, 200, { draft: await saveReleaseDraft(meetingId, { id: body['id'], instruction: body['instruction'], messageIds: body['messageIds'], recipientIds: body['recipientIds'], ...(Array.isArray(body['assetIds']) ? { assetIds: body['assetIds'] } : {}), ...(typeof body['title'] === 'string' ? { title: body['title'] } : {}), ...(typeof body['parentTaskId'] === 'string' ? { parentTaskId: body['parentTaskId'] } : {}), ...(typeof body['version'] === 'number' ? { version: body['version'] } : {}) }) });
            return;
        }
        if (action === 'release') {
            if (typeof body['draftId'] !== 'string' || typeof body['version'] !== 'number')
                throw new Error('缺少草稿版本');
            const draft = await releaseDraft(ctx, meetingId, body['draftId'], body['version']);
            sendJson(res, 200, { draft });
            return;
        }
        if (action === 'retry-release' || action === 'stop-release') {
            if (typeof body['taskId'] !== 'string')
                throw new Error('缺少任务ID');
            if (action === 'retry-release')
                await retryReleaseTask(ctx, meetingId, body['taskId'], body['allowDuplicate'] === true);
            else
                await stopReleaseTask(meetingId, body['taskId']);
            sendJson(res, 200, { ok: true });
            return;
        }
        if (action === 'edit') {
            if (typeof body['title'] !== 'string' || typeof body['description'] !== 'string')
                throw new Error('请输入会议标题和说明');
            sendJson(res, 200, { meeting: await editMeeting(ctx, meetingId, body['title'], body['description']) });
            return;
        }
        if (action === 'join') {
            if (typeof body['sessionId'] !== 'string' || body['sessionId'].trim() === '') {
                sendJson(res, 400, { error: 'join requires a non-empty "sessionId" field' });
                return;
            }
            const sessionId = body['sessionId'];
            if ((await readMeeting(root, meetingId))?.secretary?.sessionId === sessionId)
                throw new Error('秘书不可作为普通成员加入');
            let meeting = await joinMeeting(root, meetingId, sessionId, parseJoinOrigin(body['origin']));
            const role = typeof body['role'] === 'string' && body['role'].trim() !== '' ? body['role'].trim() : '参会成员';
            meeting = await ensureMemberBriefing(ctx, meetingId, sessionId, role);
            sendJson(res, 200, { meeting });
            return;
        }
        if (action === 'leave') {
            if (typeof body['sessionId'] !== 'string' || body['sessionId'].trim() === '') {
                sendJson(res, 400, { error: 'leave requires a non-empty "sessionId" field' });
                return;
            }
            const current = await requireActiveMeeting(root, meetingId);
            if (current.memberSessionIds.includes(body['sessionId']))
                await leaveMeeting(root, meetingId, body['sessionId']);
            else if (!current.events.some(e => e.kind === 'leave' && e.sessionId === body['sessionId']))
                throw Error('此窗口未曾从本会退出，不能确认移除');
            sendJson(res, 200, { meeting: await mutateMeeting(root, meetingId, m => syncMeetingFolderInstructions(m)) });
            return;
        }
        if (action === 'broadcast') {
            if (typeof body['text'] !== 'string' || body['text'].trim() === '') {
                sendJson(res, 400, { error: 'broadcast requires a non-empty "text" field' });
                return;
            }
            sendJson(res, 200, { meeting: await appendBroadcast(root, meetingId, body['text'], parseDeliveries(body['deliveries'])) });
            return;
        }
        if (action === 'dispatch') {
            const toSessionId = typeof body['toSessionId'] === 'string' ? body['toSessionId'].trim() : '';
            const title = typeof body['title'] === 'string' ? body['title'].trim() : '';
            const text = typeof body['text'] === 'string' ? body['text'].trim() : '';
            if (toSessionId === '' || title === '' || text === '') {
                sendJson(res, 400, { error: 'dispatch requires non-empty "toSessionId", "title" and "text" fields' });
                return;
            }
            const task = await dispatchMeetingTask(ctx, meetingId, toSessionId, title, text);
            sendJson(res, 200, { dispatch: { taskId: task.taskId, status: task.status, attemptId: task.attemptId } });
            return;
        }
        if (action === 'cancel') {
            const taskId = typeof body['taskId'] === 'string' ? body['taskId'].trim() : '';
            const attemptId = typeof body['attemptId'] === 'string' ? body['attemptId'] : undefined;
            if (taskId === '') {
                sendJson(res, 400, { error: 'cancel requires taskId' });
                return;
            }
            if (findReleaseTask(await requireActiveMeeting(root, meetingId), taskId)) {
                await stopReleaseTask(meetingId, taskId);
                sendJson(res, 200, { ok: true });
                return;
            }
            sendJson(res, 200, { task: await transitionTask(meetingId, taskId, 'cancelled', { expectedAttemptId: attemptId, error: '用户取消' }) });
            return;
        }
        if (action === 'retry-secretary') {
            const secretaryWorkspaceId = typeof body['secretaryWorkspaceId'] === 'string' ? body['secretaryWorkspaceId'] : '';
            const registry = ctx.get('workspaceRegistry');
            const workspace = registry?.get(secretaryWorkspaceId);
            const meeting = await readMeeting(root, meetingId);
            if (meeting === undefined || workspace === undefined || workspace.id !== secretaryWorkspaceId) {
                sendJson(res, 400, { error: '秘书默认工作区不可用或会议不存在' });
                return;
            }
            if (meeting.secretary?.created && meeting.secretary.workspaceId !== secretaryWorkspaceId)
                throw new Error('已创建的秘书必须沿用原工作区');
            try {
                sendJson(res, 200, { meeting: await createSecretary(ctx, root, meeting, { workspaceId: workspace.id, path: workspace.path }) });
            }
            catch (error) {
                sendJson(res, 200, { meeting: await readMeeting(root, meetingId), secretaryFailed: String(error) });
            }
            return;
        }
        if (action === 'minutes' || action === 'minutes-data') {
            const scope = body['scope'];
            if (scope !== 'full' && scope !== 'since_last')
                throw new Error('请选择全量或自上次以来');
            sendJson(res, 200, action === 'minutes' ? await startMinutes(ctx, meetingId, scope) : { data: await meetingMinutesData(ctx, meetingId, scope) });
            return;
        }
        if (action === 'cancel-minutes') {
            await cancelMinutes(meetingId);
            sendJson(res, 200, { ok: true });
            return;
        }
        if (action === 'send-minutes') {
            if (typeof body['minutesId'] !== 'string')
                throw new Error('缺少纪要ID');
            sendJson(res, 200, { meeting: await sendMinutes(ctx, meetingId, body['minutesId']) });
            return;
        }
        sendJson(res, 404, { error: `unknown action "${action}"` });
    }
    catch (error) {
        const message = String(error instanceof Error ? error.message : error);
        if (res.headersSent) {
            res.destroy(error instanceof Error ? error : Error(message));
            return;
        }
        // 会议不存在 → 404；其余管理操作校验失败 → 400。
        const status = error instanceof ReleaseRequestRejected ? 400 : message.includes('不存在') ? 404 : 400;
        sendJson(res, status, { error: message, ...(error instanceof ReleaseRequestRejected ? { requestState: 'rejected' } : {}) });
    }
}
/** 注册会议路由（幂等；服务未绑定时挂 internal/service 事件补注册）。 */
export function registerMeetingsRoute(ctx) {
    let registered = false;
    const tryRegister = () => {
        if (registered)
            return;
        const web = (ctx.get('webServer') ?? ctx.get('httpServer'));
        if (web === undefined)
            return;
        ctx.effect(() => {
            const profile = () => ctx.get('profileContext');
            const rejectScope = (req, res) => { const expected = req.headers?.['x-round-table-scope']; if (expected && expected !== storageScope(profile())) {
                sendJson(res, 409, { error: 'DSH 实例已变化，请重新打开圆桌并核对草稿', requestState: 'rejected', retryable: false });
                return true;
            } return false; };
            const disposeCollection = web.register({ kind: 'exact', path: MEETINGS_ROUTE_PATH, handler: (req, res) => { if (!rejectScope(req, res))
                    return meetingsHandler(ctx, req, res); } });
            const disposeActions = web.register({ kind: 'prefix', path: MEETINGS_ROUTE_PREFIX, handler: async (req, res) => {
                    if (rejectScope(req, res))
                        return;
                    const segments = new URL(req.url ?? '/', 'http://localhost').pathname.slice(MEETINGS_ROUTE_PREFIX.length).split('/').filter(Boolean);
                    if (segments[1] === 'delete')
                        return meetingActionHandler(ctx, req, res);
                    try {
                        await withMeetingActivity(stateRoot(), decodeURIComponent(segments[0] ?? ''), () => meetingActionHandler(ctx, req, res));
                    }
                    catch (error) {
                        sendJson(res, 409, { error: String(error instanceof Error ? error.message : error) });
                    }
                } });
            const disposeScope = web.register({ kind: 'exact', path: '/plugins/round-table/local-scope', handler: (req, res) => {
                    if (req.method !== 'GET') {
                        sendJson(res, 405, { error: 'Read-only instance identity' });
                        return;
                    }
                    const facts = profile(), scope = storageScope(facts);
                    sendJson(res, scope ? 200 : 503, scope ? { scope, profileName: facts?.name } : { error: '当前宿主未提供 home/profile 身份，暂不加载草稿' });
                } });
            return () => { disposeScope(); disposeCollection(); disposeActions(); };
        }, 'round-table: meetings route');
        registered = true;
    };
    tryRegister();
    ctx.on('internal/service', (name) => {
        if (name === 'webServer' || name === 'httpServer')
            tryRegister();
    });
}
