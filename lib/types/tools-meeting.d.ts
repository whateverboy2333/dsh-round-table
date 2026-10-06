/**
 * 会议工具：meeting_create / meeting_list / meeting_join。
 *
 * 磁盘为真相源：每个工具都经 meetings 的锁内"读 → 改 → 写"，不持有权威内存状态。
 * 工具是 agent 面的数据能力；UI（浏览器面板）走 route-meetings 的 HTTP 端点，
 * 两边共用同一套 store 函数。
 * @module dsh-round-table/tools-meeting
 */
import type { Context } from '@deepseek-ai/cordis';
export declare function registerMeetingTools(ctx: Context): void;
