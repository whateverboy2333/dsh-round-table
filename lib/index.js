import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { registerMeetingTools } from "./tools-meeting.js";
import { registerMeetingsRoute } from "./route-meetings.js";
import { attachSecretaryLifecycle, purgeOrphanSecretaryCache } from "./secretary.js";
import { attachMinutesLifecycle, recoverMinutesJobs } from "./minutes.js";
import { stateRoot } from "./meetings.js";
import { recoverReleases, attachReleaseLifecycle } from "./meeting-flow.js";
import { recoverWorkflows } from "./workflow-runtime.js";
import { attachAutomaticWorkflowLifecycle } from "./workflow-auto.js";
import { TESTED_RUNTIME_VERSIONS, runtimeCompatibilityProblems } from "./runtime-compatibility.js";
import { attachDiscussionLifecycle, recoverDiscussions } from "./discussion.js";
export const name = 'round-table';
export const inject = ['tools', 'agents', 'subagents'];
export const Config = z.object({});
/** 插件自身版本（读包根 package.json，build 产物 lib/index.js 的 ../ 即包根）。 */
const PLUGIN_VERSION = (() => {
    try {
        const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        return manifest.version ?? '0.0.0-unknown';
    }
    catch {
        return '0.0.0-unknown';
    }
})();
/**
 * 运行时版本守卫：peerDependencies 的运行时对照。
 * pnpm 对 peer 版本不匹配只警告不报错，DSH 预览期 API 不稳，
 * 因此在 apply 最前面 fail-loud，拒绝在未知运行时上加载。
 * 约束必须与 package.json 的 peerDependencies 保持同义。
 */
function assertCompatibleRuntime() {
    const require = createRequire(import.meta.url);
    const versions = {};
    for (const pkg of Object.keys(TESTED_RUNTIME_VERSIONS)) {
        try {
            versions[pkg] = require(`${pkg}/package.json`).version;
        }
        catch {
            versions[pkg] = undefined;
        }
    }
    const problems = runtimeCompatibilityProblems(versions);
    if (problems.length > 0) {
        throw new Error(`[dsh-round-table] 运行时版本不兼容，拒绝加载：${problems.join('；')}`);
    }
}
export async function apply(ctx, _config) {
    // 版本守卫必须在任何注册行为之前
    assertCompatibleRuntime();
    attachSecretaryLifecycle(ctx);
    attachMinutesLifecycle(ctx);
    await recoverMinutesJobs(stateRoot());
    await recoverReleases(ctx);
    await recoverDiscussions(ctx);
    await recoverWorkflows(stateRoot());
    await purgeOrphanSecretaryCache(ctx, stateRoot());
    ctx.inject(['sessionProjectionCache', 'storageDomain', 'sessionPersistence', 'workspaceRegistry'], scope => {
        const cleanup = purgeOrphanSecretaryCache(scope, stateRoot()).then(count => { if (count)
            scope.logger.info(`已清理 ${count} 条无会话的圆桌秘书投影缓存`); }).catch(error => scope.logger.warn(`秘书投影缓存清理未完成：${String(error)}`));
        scope.effect(() => () => cleanup, 'round-table: orphan secretary cache cleanup');
    });
    attachReleaseLifecycle(ctx);
    attachDiscussionLifecycle(ctx);
    attachAutomaticWorkflowLifecycle(ctx);
    ctx.tools.register(defineTool({
        name: 'round_table_ping',
        description: 'dsh-round-table 插件自检。调用以确认插件已加载且运行时兼容；返回 pong 与插件版本号。无副作用。',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    pong: { type: 'boolean', required: true },
                    version: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: `pong (dsh-round-table v${value.version})` }],
        },
        async execute() {
            return { pong: true, version: PLUGIN_VERSION };
        },
    }));
    // 会议模型：agent 面工具 + client 面 HTTP 端点（共用 meetings store）
    registerMeetingTools(ctx);
    registerMeetingsRoute(ctx);
}
