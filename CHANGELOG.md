# Changelog / 更新记录

## [1.0.0] - 待发布 / Unreleased

- 按用户指定，将当前源码及包版本从0.1.18调整为1.0.0，功能和运行逻辑保持已验收基线。
- 当前main提供精简的中英README、完整使用指南和7张功能截图；新安装包需要对应新版本发布，不替换既有0.1.18标签或资产。
- 此条记录版本编号调整，不代表npm或GitHub Release的1.0.0已公开发布。

Version renumbering from 0.1.18 to 1.0.0 with the same verified runtime behavior. The current source includes concise bilingual documentation and seven interface screenshots. npm and GitHub Release publication for 1.0.0 remains pending; existing 0.1.18 releases are preserved.

## [0.1.18] - 2026-10-06

首个面向DeepSeek Harness 0.2.0-rc.2 Windows桌面版的公开发行版本。

### 新增与改进

- 普通讨论与任务卡分别由用户选择；指定成员依据会议上下文生成可编辑任务清单，核对后明确发布。
- 每场会议有独立工作文件夹，统一保存材料、任务卡、成果和纪要；成员只读访问批准的本会文件版本。
- 输入框可同条发送文字、图片和文档，资料页保留上传归档及版本。Enter提交，Ctrl/⌘+Enter换行。
- 成员详情及工作日志放入右侧边栏；执行时核对并恢复原Agent会话，归档/删除/身份变化明确阻止投递。
- 新步骤列表从空白开始：标题原位命名、每行选择成员、任意阶段设置并行，支持插入、移动和删除。自动接收上游信息并运行默认关闭。
- 步骤标题栏常驻删除入口，折叠/未选中/并行分支可直接操作；删除未选中项保留当前选择。
- 380px默认侧栏与原Agent页面并排，完整工作台、画布适配及Ctrl+滚轮缩放保持。

### 执行与兼容边界

- 保存不执行；首阶段明确预览并授权，后续未勾选步骤手动开始，正式结果推进。
- 运行结构与已开始字段冻结，重启及未来规则变更需明确恢复；旧图和历史保持，schema1/2/3支持，未来schema只读。
- 内部并行依赖不派发成员/秘书任务；投递不确定不盲目重发。
- 本版仅支持所述桌面宿主，旧Web rc.6不在支持范围。

### 验证

124套常规回归、14套225项真实浏览器检查、18项包检查及正式桌面显示核验通过。测试使用隔离数据和确定性Host；不会据此保证任意模型输出质量。

### English

First public Windows desktop release for DeepSeek Harness 0.2.0-rc.2. Includes discussion, user-selected editable task cards, verified meeting folders/material versions, original-session recovery, member-side work logs, blank user-defined sequential/parallel steps, permanent per-card deletion, and responsive dock/workbench views. Automation remains opt-in, starts are explicitly previewed, active work is frozen, legacy history is preserved, and future schemas remain read-only. Verified with 124 regression suites, 225 browser checks and 18 package checks.
