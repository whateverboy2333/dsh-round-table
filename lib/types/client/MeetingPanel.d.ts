/**
 * 圆桌会议面板（R3 聊天室核心 + R4 派遣 + R6 辩论 + P1 选择器 + P2 成员管理）：
 * 会议列表 / 新建会议 / 会议视图。
 *
 * 数据源：
 * - 会议数据：轮询 host 路由 GET /plugins/round-table/meetings（5s，no-store，in-flight 防重叠）；
 * - 会话枚举：框架注入的 useSessions / useWorkspaces 标准 props（排除 origin==='subagent' 与已归档）；
 * - 窗口实况：session.history 只读轮询（SessionFace 快照对未打开会话不装配历史，见 notes/20）；
 * - 广播：rtCtx.sessions.scope(id) → sessionOf() → face.prompt(content, 'queue') 逐窗口投递，
 *   失败标记"未送达"（绝不静默），结果 POST 回 host 簿记。
 * 纯展示组件：不持有权威状态（磁盘是真相源，见 src/meetings.ts）。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type KnightSelection, type WorkspaceWire } from './PresetKnightPicker.tsx';
/** useSessions 标准 props 的最小结构面（选择器钩子；框架实参结构上是其超集）。 */
interface SessionRowLike {
    displayTitle: string;
    agentPreset?: string;
    cwd?: string;
    running: boolean;
    origin?: string;
    blank: boolean;
    retainedBy?: Readonly<Record<string, number>>;
}
interface SessionListSlice {
    ids: readonly string[];
    byId: Record<string, SessionRowLike | undefined>;
    current?: string;
}
export type UseSessionsLike = <T>(selector: (state: SessionListSlice) => T) => T;
/** useWorkspaces 标准 props 的最小结构面（只取归档集合）。 */
export type UseWorkspacesLike = <T>(selector: (state: {
    archivedSessionIds: readonly string[];
    phase?: 'pending' | 'ready';
    baselinesReady?: boolean;
}) => T) => T;
/** 会议标签协议：接收窗口凭此知道自己在开会（红线：必须带标签）。 */
export declare function meetingTag(title: string, text: string): string;
interface PanelProps {
    rtCtx: ClientContext;
    useSessions: UseSessionsLike;
    useWorkspaces: UseWorkspacesLike;
    connection: RoundTableConnection;
}
/** 仅取公开 wire client 的会话/预设调用面；不依赖私有 seat controller。 */
export interface RoundTableConnection {
    homePath?: () => string | undefined;
    api: {
        agentPresets: {
            list(input: {}): Promise<{
                result: ({
                    ok: true;
                    value: {
                        presets: Array<{
                            id: string;
                            trust?: 'system' | 'user';
                            name?: string;
                            description?: string;
                            broken?: string;
                        }>;
                    };
                } | {
                    ok: false;
                    error: {
                        message: string;
                    };
                });
            }>;
        };
        sessions: {
            create(input: {
                sessionId?: string;
                workspaceId?: string;
                cwd?: string;
                agentPreset: string;
            }): Promise<{
                result: ({
                    ok: true;
                    value: {
                        sessionId: string;
                        agentPreset?: string;
                    };
                } | {
                    ok: false;
                    error: {
                        message: string;
                    };
                });
            }>;
            rename(input: {
                sessionId: string;
                title: string;
            }): Promise<{
                result: ({
                    ok: true;
                    value: unknown;
                } | {
                    ok: false;
                    error: {
                        message: string;
                    };
                });
            }>;
        };
        workspace: {
            list(input: {}): Promise<{
                result: ({
                    ok: true;
                    value: {
                        items: WorkspaceWire[];
                    };
                } | {
                    ok: false;
                    error: {
                        message: string;
                    };
                });
            }>;
        };
    };
}
interface WorkspaceSnapshot {
    items: readonly WorkspaceWire[];
    baselinesReady: boolean;
    state: 'idle' | 'loading' | 'error';
    phase: 'pending' | 'ready';
    error: unknown | null;
}
export declare function resolveKnightWorkspaces(knights: readonly KnightSelection[], snapshot: WorkspaceSnapshot, currentSessionId?: string): {
    ok: true;
    workspaceIds: string[];
    currentLabel?: string;
} | {
    ok: false;
    error: string;
};
export declare function MeetingPanel({ rtCtx, useSessions, useWorkspaces, connection }: PanelProps): React.ReactNode;
export {};
