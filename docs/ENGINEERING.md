---
status: live
type: engineering
module: dsh-round-table
last_updated: 2026-10-06
---

# 0.1.18工程维护说明

当前main运行逻辑仍对应已发行0.1.18，后续变更只是文档。产品合同见[PRD](PRD.md)，实际接口见[API](产品实现速查.md)，Agent导航见[CLAUDE](../CLAUDE.md)。历史发行[tag/安装包](https://github.com/whateverboy2333/dsh-round-table/releases/tag/v0.1.18)保持固定，main文档不被当作重新打包的同版资产。

## 目录、宿主与验证

本仓库根就是插件根：src生产源码、lib已构建产物、docs用户/维护说明。scripts仅包含构建清理与包门禁；维护者的内部全量回归和业务证据不公开。npm ci、npm run typecheck、npm run build、npm run verify、npm run verify:package可在仓库根执行，public verify为类型/包检查；不要把它报告为内部124套/225浏览器检查。

目标为Windows DeepSeek Harness 0.2.0-rc.2，Cordis4.0.4、Schemastery3.18.4，Node引擎为^22.19.0或>=24.0.0。[运行时守卫](../src/runtime-compatibility.ts)在[注册入口](../src/index.ts)检查精确已解析版本。旧Web rc.6未获本版兼容保证，不能放宽未知SDK以跳过守卫。

## 主要模块

| 文件 | 当前职责 |
|---|---|
| [MeetingPanel](../src/client/MeetingPanel.tsx)、[client入口](../src/client/index.tsx) | 主导航、宿主挂载、成员右栏及桌面布局。内部members/tasks路由不代表独立用户页。 |
| [HostingComposer](../src/client/HostingComposer.tsx)、[ChatDiscussion](../src/client/ChatDiscussion.tsx) | 普通讨论、@选人、直接图文、Enter提交及生成任务卡入口。 |
| [TaskCardsPanel](../src/client/TaskCardsPanel.tsx)、[task-cards](../src/task-cards.ts) | 原成员生成、清单编辑/建议/版本和明确发布；生成不执行。 |
| [WorkflowPanel](../src/client/WorkflowPanel.tsx)、[WorkflowSteps](../src/client/WorkflowSteps.tsx) | 查看/保存/预览/运行控制、空白阶段编排、原位命名、常驻成员选择和标题栏删除。 |
| [Canvas](../src/client/WorkflowCanvas.tsx)、[Inspector](../src/client/WorkflowInspector.tsx) | 旧图编辑，新steps图仅依赖查看；不得绕开阶段结构。 |
| [MemberSidebar](../src/client/MemberSidebar.tsx)、[work-log](../src/client/member-work-log.ts) | 本会成员信息及结构化请求/投递/回传/修改/验收日志，不是全私聊模型归纳。 |
| [meetings](../src/meetings.ts)、[route-meetings](../src/route-meetings.ts)、[tools-meeting](../src/tools-meeting.ts) | 会议账本、用户HTTP与真实Agent工具，准入/锁/存储及权限。 |
| [discussion](../src/discussion.ts)、[meeting-flow](../src/meeting-flow.ts)、[task-review](../src/task-review.ts) | 普通FIFO回应、正式任务投递/结果、修订谱系与可用成果。 |
| [member-session-state](../src/member-session-state.ts)、[member-briefing](../src/member-briefing.ts) | 仅恢复原身份原会话，持久身份/工作区检查及简报幂等。 |
| [meeting-folder](../src/meeting-folder.ts)、[meeting-file-io](../src/meeting-file-io.ts)、[asset-reference](../src/asset-reference.ts) | 本会目录/身份/批准账本/SHA和完整文件引用。 |
| [secretary](../src/secretary.ts)、[minutes](../src/minutes.ts)、[minutes-facts](../src/minutes-facts.ts) | 专属秘书、按需受限生成及结构化事实核对，不替普通成员撰写任务卡。 |

## 步骤结构与执行合同

编排链：[workflow-steps](../src/workflow-steps.ts) → [graph](../src/workflow-graph.ts) → [projection](../src/workflow-projection.ts) → [runtime](../src/workflow-runtime.ts)，调度由[workflow-auto](../src/workflow-auto.ts)在已有授权下决定，不做LLM意图分类。

- schema1旧策略、schema2逐节点策略保留；自由steps采用schema3，未知4+只读。具体形状见[types](../src/workflow-types.ts)及[state校验](../src/workflow-state.ts)。
- steps.version=1的有序stages/nodeIds是结构依据。新用户节点仅work，每项单Agent，同Agent可重复；draft允许空/未完整，运行必须严格完整。
- compileStepsDefinition生成规范entry和parallel join，严格校验图/元数据一致。helpers透明传播真实上游，不能有activation/release/secretary job/配额/额外输入，不是可指定的用户环节。
- 首轮initial-preview/start列出第一阶段全部真实项，confirmed与指纹/版本绑定。确认立即启动首阶段（其checkbox off也可明确手动授权），并授权预览中明确勾选的未来规则。新steps没有全局手动/自动下拉；未勾选的后续手动，内部automatic容器不是全部节点自动权限。
- 默认autoReceiveAndRun=false，true须includeIncoming=true。正式可用结果才推进；普通回应/生成草稿不当完成，退回/修订与已有验收关口仍拦截。初始manual项草稿警告与真正自动项阻断按实际item区分。
- 保存不执行。活动结构/已激活字段冻结，暂停也不解除；未来字段改变需要现有confirmedFuture检查，保存后暂停待明确恢复。重启不续跑；未保存改动/旧预览/旧响应不能改变已冻结输入。
- 删除只操作草稿稳定ID：未选中删除保留当前选择，并行2→1收缩，末项删除为空。busy/history/archive/active及旧回调拒绝；MaterialPicker旧回调不能复活删除项。
- 旧图和历史不隐式转平，活动结束后显式准备空白步骤；兼容choice/loop/partial/minutes接口不意味着新列表有这些默认结构。

## 会议数据、文件与权限

会议账本按DSH_HOME持久化；本会文件位于选定工作区的圆桌会议目录，身份/说明/索引和材料/任务卡/成果/纪要有各自登记。文件使用精确批准版本和SHA，落盘先于发布通知；缺失、篡改、索引/目录不一致阻止相关输入。旧会接入必须确认，归档/删除不抹掉用户工作目录。上传归档、草稿引用和向成员发送是不同动作。

普通文件最大256MiB、512KiB分块；图片/直接解析小文本最多2MiB，文本100000字符。PDF/Office/RAR保留原件引用不自动解析/解压；图片投递要求目标模型能力，不能从上传成功推断模型读懂。

原成员恢复仅resolveAgent原ID，持久身份、原header/预设/工作区与当前Agent对象都需核对；归档/删除/未知不新建替代。队列nextTurn/nextStep状态及持久送达证据需一致，uncertain不盲目重发。逻辑状态保存/发送指纹与请求身份不能在错误恢复时换号重复授权。

[meeting-tool-auth](../src/meeting-tool-auth.ts)只授权当前真实未归档Agent读取所参加/可信创建/专属秘书的本会；普通成员不能自行加入陌生会或邀请他人。用户管理HTTP与Agent工具是不同主体，管理HTTP不是面向公网独立鉴权API，依赖宿主访问边界。浏览器草稿/请求按home/profile scope分区，无效旧异步回应不能写新实例。

## 维护门禁

行为变更应同步PRD、此工程说明、API和相应验证。仅文档变更检查链接、版本、合同及代码不变，不执行正式会议或模型。运行验证用隔离DSH_HOME与明确Host，不能把示例HTML、mockHTTP或本地pack称正式模型/远端发布。

记录正式运行字节/版本、恢复证据、模型实际调用及限制。次数额度不是货币/Token硬上限，冻结资料不隔离原窗口记忆/文件权限。不得复制凭据进源仓库或安装包。

已发行v0.1.18标签和资产保持不变；main后来新增文档，不要从main重新pack同版并替换公开资产。npm仍待正式发布验证，以当前README/发行页为准。继续发布时核对真实身份、前置条件及官方远端结果，不能绕过自动审批拒绝。
