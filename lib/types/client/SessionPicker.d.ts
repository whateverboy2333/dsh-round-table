/**
 * 窗口选择器（P1 整顿，建会表单与后续"添加成员"共用的组件）：
 * - 数据源分层：useSessions 行（running 区分 live/离线）+ useWorkspaces 的
 *   archivedSessionIds（归档会话直接排除）；origin==='subagent' 排除（既有纪律）。
 * - 展示：live（正在工作）置顶带绿点；离线窗口置灰折叠进「离线窗口（N）」分组
 *   （默认收起；离线窗口仍可勾选——广播会拉起它们）；每行标题 + cwd 缩写。
 * - 搜索：按标题/cwd 过滤（不分组限制，命中离线分组时该组自动展开）。
 */
/** useSessions 行（结构面；框架实参是超集）。 */
export interface SessionRowLike {
    displayTitle: string;
    cwd?: string;
    running: boolean;
    origin?: string;
    blank: boolean;
    connected?: boolean;
}
export interface PickerRow {
    id: string;
    row: SessionRowLike;
}
export interface SessionPartition {
    live: PickerRow[];
    offline: PickerRow[];
}
/**
 * 分层纯函数（冒烟可测）：排除 subagent/已归档，按 running 分 live/离线两组；
 * query 非空时按标题/cwd 过滤（大小写不敏感）。
 */
export declare function partitionSessionRows(rows: readonly PickerRow[], archivedSessionIds: readonly string[], query: string): SessionPartition;
/** cwd 缩写：取末两段（太长的单段截断）。 */
export declare function shortCwd(cwd: string | undefined): string | undefined;
export declare function SessionPicker({ rows, archivedSessionIds, checked, onToggle }: {
    rows: readonly PickerRow[];
    archivedSessionIds: readonly string[];
    checked: ReadonlySet<string>;
    onToggle: (id: string) => void;
}): React.ReactNode;
