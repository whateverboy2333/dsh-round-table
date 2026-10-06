/**
 * 会议持久化：`<DSH_HOME>/round-table/<meetingId>/meeting.json`。
 *
 * 磁盘是真相源：所有变更都在 promise 链锁内完成"读 → 改 → 原子写"，
 * 写盘成功后才把新状态返回给调用方；插件不持有权威内存副本。
 * （模式照抄 dsh-flat-teams 的 registry，本插件不依赖它。）
 *
 * 消息记录的取舍：meeting.json 的 events 只存"会议事件"——创建、入会将、
 * 广播投递（谁被投递了什么、送达/未送达）。完整对话内容以各窗口会话自身的
 * 日志为准（会话存储本来就在 DSH_HOME 全局共享），会议簿记不复制对话正文。
 * @module dsh-round-table/meetings
 */
import type { MinutesRecord, MinutesJob } from './minutes-types.ts';
import { type ReleaseDraft } from './meeting-flow-types.ts';
import type { WorkflowState } from './workflow-types.ts';
import { type DiscussionRecord } from './discussion-types.ts';
import { type MeetingFolder } from './meeting-folder-types.ts';
import { type MemberBriefing } from './member-briefing-types.ts';
import { type TaskCardMeetingFields } from './task-card-types.ts';
/** DSH_HOME 下的状态目录名。 */
export declare const STATE_DIR = "round-table";
/** 全局状态根（<DSH_HOME>/round-table）：按调用解析（env 可变）。 */
export declare function stateRoot(): string;
/** 单条投递结果（broadcast 事件的 per-member 明细）。 */
export interface Delivery {
    sessionId: string;
    status: 'delivered' | 'undelivered';
    /** 未送达原因（窗口离线/会话已移除/RPC 拒绝）。 */
    error?: string;
}
/** 会议派遣任务的状态（与 flat-teams TaskStatus 对齐，字符串直存避免跨包类型耦合）。 */
export type MeetingTaskStatus = 'pending' | 'delivered' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'timeout';
/** 辩论单轮单视角发言记录。 */
export interface DebateTurn {
    round: number;
    /** 视角 key（supporter/opponent/realist 或自定义）。 */
    perspective: string;
    /** 视角显示名。 */
    label: string;
    text: string;
    /** 子代理收尾原因；非 completed 计入并展示。 */
    stopReason: string;
}
/** 辩论结构化结论（收敛子代理 outputSchema 的形状）。 */
export interface DebateConclusion {
    conclusion: string;
    confidence: number;
    keyPoints: string[];
}
/** 会议事件（消息记录的取舍见模块注释）。 */
export type MeetingEvent = {
    id: string;
    kind: 'message';
    time: number;
    by: string;
    text: string;
    taskId?: string;
    replyTo?: string[];
    source?: import('./meeting-flow-types.ts').ResultSource;
    assetIds?: string[];
    chat?: import('./chat-types.ts').ChatRequestMeta;
    minutesId?: string;
    discussionId?: string;
    contextTaskId?: string;
} | {
    id: string;
    kind: 'create';
    time: number;
    title: string;
} | {
    id: string;
    kind: 'rename';
    time: number;
    oldTitle: string;
    title: string;
} | {
    id: string;
    kind: 'description_update';
    time: number;
    oldDescription: string;
    description: string;
} | {
    id: string;
    kind: 'join';
    time: number;
    sessionId: string;
    source?: 'existing' | 'preset' | 'secretary';
    presetId?: string;
    workspaceId?: string;
} | {
    id: string;
    kind: 'leave';
    time: number;
    sessionId: string;
} | {
    id: string;
    kind: 'broadcast';
    time: number;
    by: 'user' | 'secretary';
    text: string;
    deliveries: Delivery[];
    minutesId?: string;
} | {
    id: string;
    kind: 'minutes';
    time: number;
    minutesId: string;
    title: string;
} | {
    id: string;
    kind: 'task';
    time: number;
    /** 会议内嵌任务 id。 */
    taskId: string;
    /** 新记录使用 meetingId/meetingTitle；旧 team 字段读取兼容。 */
    meetingId?: string;
    meetingTitle?: string;
    teamId?: string;
    teamName?: string;
    toSessionId: string;
    toMember: string;
    title: string;
    status: MeetingTaskStatus;
    /** 完成时的结果摘要（取自 task_completed 事件 data.result）。 */
    result?: string;
    /** 失败/取消/超时原因。 */
    error?: string;
} | {
    id: string;
    kind: 'debate';
    time: number;
    topic: string;
    /** 父窗口（辩论以它的名义/工作区 spawn 子代理）。 */
    sponsorSessionId: string;
    status: 'running' | 'converged' | 'failed';
    rounds: number;
    perspectiveLabels: string[];
    turns: DebateTurn[];
    conclusion?: DebateConclusion;
    /** 收敛子代理的 stopReason（非 completed 上报）。 */
    conclusionStopReason?: string;
    /** 失败原因（编排层异常）。 */
    error?: string;
    /** 模型调用计数（轮数×视角+1 为预算上限）。 */
    calls: number;
};
/** 会议记录。 */
export interface Meeting extends TaskCardMeetingFields {
    meetingId: string;
    toolCreatorSessionId?: string;
    toolCreatorIdentity?: {
        createdAt: number;
        cwd: string;
    };
    creationRequest?: {
        requestId: string;
        fingerprint: string;
    };
    title: string;
    /** 老记录缺席时视为 ''；新建会议由 UI/路由强制填写。 */
    description?: string;
    memberRoles?: Record<string, string>;
    briefedSessionIds?: string[];
    memberBriefings?: MemberBriefing[];
    /** P9: 专用秘书不进入普通成员列表。 */
    secretary?: {
        sessionId: string;
        workspaceId: string;
        status: 'ready' | 'failed' | 'initializing';
        created?: boolean;
        error?: string;
    };
    defaultWorkspaceId?: string;
    meetingFolder?: MeetingFolder;
    meetingFolderError?: string;
    secretaryTitleError?: string;
    deletion?: {
        startedAt: number;
        notify: boolean;
        deliveries: Delivery[];
        secretaryDeleted?: boolean;
        error?: string;
    };
    minutes?: MinutesRecord[];
    minutesJob?: MinutesJob;
    releases?: ReleaseDraft[];
    discussions?: DiscussionRecord[];
    workflow?: WorkflowState;
    releasePaused?: boolean;
    archivedAt?: number;
    pinnedAt?: number;
    minutesSource?: 'formal' | 'session';
    memberNames?: Record<string, string>;
    templates?: {
        id: string;
        title: string;
        instruction: string;
        recipientIds: string[];
    }[];
    assets?: import('./meeting-flow-types.ts').MeetingAsset[];
    memberSessionIds: string[];
    createdAt: number;
    events: MeetingEvent[];
}
export declare function isMeeting(value: unknown, meetingId: string): value is Meeting;
export declare function withMeetingLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
/**
 * 用同目录临时文件 + rename 原子替换目标文件；Windows 上目标被短暂占用
 * （无 FILE_SHARE_DELETE 打开）时 rename 抛 EPERM，重试几次后降级为直接覆写
 * （此时内容已完整落在临时文件，直写是内容等价的降级路径）。
 */
export declare function atomicWriteText(file: string, content: string): Promise<void>;
/** 读取会议记录；不存在返回 undefined；形状非法抛错。 */
export declare function readMeeting(root: string, meetingId: string): Promise<Meeting | undefined>;
/** 列出状态根下全部会议（按创建时间升序）；状态根不存在时为空。 */
export declare function listMeetings(root: string): Promise<Meeting[]>;
/**
 * 创建会议（锁内落盘初始记录 + create 事件）。
 * 成员列表去重；空标题/非法成员由调用方（工具/路由）先行拒绝。
 */
export declare function createMeeting(root: string, title: string, memberSessionIds: string[], description?: string, request?: {
    requestId: string;
    workspaceId: string;
}): Promise<Meeting>;
/**
 * 锁内"读 → 改 → 写"一个会议：mutate 返回**新的** Meeting 对象（纯函数风格），
 * 磁盘先更新，写盘成功后返回最新记录。会议不存在抛错；mutate 抛错时不写盘。
 */
export declare function mutateMeeting(root: string, meetingId: string, mutate: (meeting: Meeting) => Meeting | Promise<Meeting>, management?: boolean): Promise<Meeting>;
export declare function requireActiveMeeting(root: string, meetingId: string): Promise<Meeting>;
/** 拉窗口入会（幂等：已在会则只返回现状，不重复记 join 事件）。 */
export interface JoinOrigin {
    source: 'existing' | 'preset' | 'secretary';
    presetId?: string;
    workspaceId?: string;
}
export declare function joinMeeting(root: string, meetingId: string, sessionId: string, origin?: JoinOrigin): Promise<Meeting>;
/** 移除参会窗口（不在会则抛错；记 leave 事件）。 */
export declare function leaveMeeting(root: string, meetingId: string, sessionId: string): Promise<Meeting>;
/** 记录一次广播投递（含每个成员的送达/未送达明细）。 */
export declare function appendBroadcast(root: string, meetingId: string, text: string, deliveries: Delivery[]): Promise<Meeting>;
/** 记录一次任务派遣（初始状态 delivered/pending，后续由事件回流更新）。 */
export declare function appendTaskEvent(root: string, meetingId: string, task: {
    taskId: string;
    meetingId?: string;
    meetingTitle?: string;
    /** 旧调用兼容，读取既有会议记录时保留。 */
    teamId?: string;
    teamName?: string;
    toSessionId: string;
    toMember: string;
    title: string;
    status: MeetingTaskStatus;
}): Promise<Meeting>;
/**
 * 回流更新会议内某任务事件的状态（按 taskId 匹配；状态不变则不写盘）。
 * completed 带 result 摘要；failed/cancelled/timeout 带 error。
 * 会议内无此 taskId 时返回 undefined（不报错——任务可能与本会议无关）。
 */
export declare function updateTaskStatus(root: string, meetingId: string, taskId: string, status: MeetingTaskStatus, detail?: {
    result?: string;
    error?: string;
}): Promise<Meeting | undefined>;
