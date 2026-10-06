/**
 * 会议数据路由（client 面专用通道）：
 * - GET  /plugins/round-table/meetings                     → { meetings }
 * - POST /plugins/round-table/meetings                     body: { title, memberSessionIds? }
 * - POST /plugins/round-table/meetings/<meetingId>/join    body: { sessionId }
 * - POST /plugins/round-table/meetings/<meetingId>/leave   body: { sessionId }
 * - POST /plugins/round-table/meetings/<meetingId>/broadcast body: { text, deliveries }
 * - POST /plugins/round-table/meetings/<meetingId>/dispatch  body: { toSessionId, title, text }
 *
 * 浏览器=用户=管理者，不做身份校验（同 flat-teams 的管理端点约定）。
 * 投递本身发生在 client 面（SessionFace.prompt），这里只负责簿记。
 * 懒注册 + 双键回退（webServer/httpServer）+ internal/service 事件补注册。
 * @module dsh-round-table/route-meetings
 */
import type { Context } from '@deepseek-ai/cordis';
/** 会议集合端点（exact）。 */
export declare const MEETINGS_ROUTE_PATH = "/plugins/round-table/meetings";
/** 会议动作端点前缀（prefix 不带尾斜杠——webserver 的匹配是 startsWith(prefix+'/')）。 */
export declare const MEETINGS_ROUTE_PREFIX = "/plugins/round-table/meetings";
/** 注册会议路由（幂等；服务未绑定时挂 internal/service 事件补注册）。 */
export declare function registerMeetingsRoute(ctx: Context): void;
