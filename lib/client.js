window.__ModuleLoader__.load({
	id: "dsh-round-table",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		//#region lib/client/desktop-connection.js
		/** 0.2 Remote calls return Result directly; the 0.1 wire adapter wrapped it. */
		function desktopConnection(remote) {
			return {
				homePath: () => remote.$host?.home,
				api: {
					sessions: {
						create: async (input) => ({ result: await remote.session.create(input) }),
						rename: async (input) => ({ result: await remote.session.rename(input) })
					},
					workspace: { list: async () => {
						const iterator = remote.workspace.follow(AbortSignal.timeout(1e4))[Symbol.asyncIterator]();
						try {
							const first = await iterator.next();
							if (first.done || first.value.type !== "baseline") throw new Error("工作区名册尚未就绪");
							return { result: {
								ok: true,
								value: { items: [...first.value.value.items] }
							} };
						} finally {
							await iterator.return?.();
						}
					} },
					agentPresets: { list: async () => {
						const result = await remote.agentPresets.list();
						return { result: result.ok ? {
							ok: true,
							value: { presets: [...result.value.presets] }
						} : result };
					} }
				}
			};
		}
		//#endregion
		//#region lib/client/ui-state.js
		let localScope;
		const failures = /* @__PURE__ */ new Map();
		const listeners = /* @__PURE__ */ new Set();
		let persistence = {
			available: false,
			reason: "尚未识别当前 DSH 实例"
		};
		const publishPersistence = () => {
			const reason = !localScope ? "尚未识别当前 DSH 实例" : failures.values().next().value;
			const next = {
				available: !reason,
				...reason ? { reason } : {}
			};
			if (JSON.stringify(next) !== JSON.stringify(persistence)) {
				persistence = next;
				listeners.forEach((fn) => fn());
			}
		};
		/** Opaque stable home/profile ID supplied by this plugin's authenticated host route. */
		function configureLocalScope(scope) {
			const next = scope && /^[a-zA-Z0-9._-]{1,160}$/.test(scope) ? scope : void 0;
			if (localScope !== next) {
				localScope = next;
				failures.clear();
				publishPersistence();
			}
		}
		const localScopeId = () => localScope;
		const localPersistenceSnapshot = () => persistence;
		function useLocalPersistence() {
			const [value, setValue] = (0, react.useState)(localPersistenceSnapshot);
			(0, react.useEffect)(() => {
				const update = () => setValue(localPersistenceSnapshot());
				listeners.add(update);
				update();
				return () => {
					listeners.delete(update);
				};
			}, []);
			return value;
		}
		function readLocal(key, fallback, expectedScope = localScope) {
			if (!expectedScope || expectedScope !== localScope) return fallback;
			try {
				const storageKey = `round-table.${expectedScope}.${key}`, value = localStorage.getItem(storageKey);
				if (value === "undefined") {
					localStorage.removeItem(storageKey);
					failures.delete(key);
					publishPersistence();
					return fallback;
				}
				return value === null ? fallback : JSON.parse(value);
			} catch {
				failures.set(key, "本地存储不可读取或草稿格式损坏");
				publishPersistence();
				return fallback;
			}
		}
		function writeLocal(key, value, expectedScope = localScope) {
			if (!expectedScope || expectedScope !== localScope) return false;
			try {
				const storageKey = `round-table.${expectedScope}.${key}`;
				if (value === void 0) localStorage.removeItem(storageKey);
				else localStorage.setItem(storageKey, JSON.stringify(value));
				failures.delete(key);
				publishPersistence();
				return true;
			} catch {
				failures.set(key, "本地存储已满或不可用");
				publishPersistence();
				return false;
			}
		}
		async function meetingCall(meetingId, action, body = {}, expectedScope = localScope) {
			if (expectedScope && expectedScope !== localScope) throw Object.assign(Error("DSH 实例已变化，请重新打开圆桌"), {
				status: 409,
				requestState: "rejected",
				retryable: false
			});
			const response = await fetch(`/plugins/round-table/meetings/${encodeURIComponent(meetingId)}/${action}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...expectedScope ? { "x-round-table-scope": expectedScope } : {}
				},
				body: JSON.stringify(body)
			});
			const value = await response.json();
			if (!response.ok) throw Object.assign(new Error(value.error ?? `HTTP ${response.status}`), {
				status: response.status,
				...value.requestState === "rejected" ? { requestState: "rejected" } : {},
				...typeof value.retryable === "boolean" ? { retryable: value.retryable } : {},
				...typeof value.code === "string" ? { code: value.code } : {}
			});
			return value;
		}
		/** Late completions belong to their mounting instance and must never write a newer one. */
		function scopedLocal(scope) {
			return {
				readLocal: (key, fallback) => scope ? readLocal(key, fallback, scope) : fallback,
				writeLocal: (key, value) => !!scope && writeLocal(key, value, scope),
				meetingCall: (id, action, body = {}) => {
					if (!scope) return Promise.reject(Object.assign(Error("DSH 实例身份未知"), {
						status: 409,
						requestState: "rejected",
						retryable: false
					}));
					return meetingCall(id, action, body, scope);
				}
			};
		}
		function downloadText(name, text, type = "text/markdown;charset=utf-8") {
			const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement("a");
			a.href = url;
			a.download = name;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1e3);
		}
		const uiButton = {
			font: "inherit",
			padding: "6px 10px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base)",
			color: "inherit",
			cursor: "pointer"
		};
		const uiInput = {
			...uiButton,
			width: "100%",
			boxSizing: "border-box",
			minWidth: 0,
			cursor: "text"
		};
		function clampPanelWidth(width, viewport) {
			const max = Math.max(1, Math.min(1100, viewport - 24));
			return Math.min(max, Math.max(Math.min(320, max), Number.isFinite(width) ? width : 380));
		}
		function draggedPanelWidth(initial, startX, currentX, viewport) {
			return clampPanelWidth(initial + startX - currentX, viewport);
		}
		/** The official AppFrame sets its grid columns inline; the entry lives in its sidebar column. */
		function sidebarColumn(entry) {
			let column = entry;
			while (column?.parentElement) {
				if (column.parentElement.style.gridTemplateColumns) return column;
				column = column.parentElement;
			}
		}
		function expandedPanelLeft(column, viewport) {
			const right = column?.getBoundingClientRect().right;
			return typeof right === "number" && Number.isFinite(right) ? Math.max(0, Math.min(Math.max(0, viewport - 1), right)) : 0;
		}
		function dockWidth(requested, available) {
			const space = Math.max(2, available), max = space >= 640 ? space - 320 : space / 2;
			return Math.max(Math.min(320, max), Math.min(max, Number.isFinite(requested) ? requested : 380));
		}
		function dockColumns(entry) {
			const sidebar = sidebarColumn(entry), main = sidebar?.nextElementSibling, frame = sidebar?.parentElement;
			if (!sidebar || !main || !frame) return void 0;
			return {
				sidebar,
				main,
				frame,
				right: main.nextElementSibling
			};
		}
		function dockGeometry(entry, requested, viewport) {
			const columns = dockColumns(entry);
			if (!columns) return {
				width: dockWidth(requested, viewport),
				right: 0,
				available: viewport,
				supported: false
			};
			const frame = columns.frame.getBoundingClientRect(), sidebar = columns.sidebar.getBoundingClientRect(), right = columns.right?.getBoundingClientRect().width ?? 0;
			const available = Math.max(2, frame.right - sidebar.right - right);
			return {
				width: dockWidth(requested, available),
				right: Math.max(0, viewport - frame.right + right),
				available,
				supported: true
			};
		}
		/** Reserve actual centre-column space without reparenting or unmounting the original Agent UI. */
		function reserveHostDock(entry, width) {
			const main = dockColumns(entry)?.main;
			if (!main) return () => {};
			const property = "margin-right", previous = main.style.getPropertyValue(property), priority = main.style.getPropertyPriority(property), owned = `${width}px`;
			main.style.setProperty(property, owned);
			return () => {
				if (main.style.getPropertyValue(property) !== owned) return;
				if (previous) main.style.setProperty(property, previous, priority);
				else main.style.removeProperty(property);
			};
		}
		//#endregion
		//#region lib/client/panel-file-drop.js
		/** Own file drags only inside this pane; the official host owns all other targets. */
		const PANEL_FILE_DROP = "round-table-file-drop";
		const PANEL_FILE_DRAG = "round-table-file-drag";
		function installPanelFileDrop(panel) {
			const doc = panel.ownerDocument, view = doc.defaultView;
			let active = false, resettingHost = false;
			const composer = () => Array.from(panel.querySelectorAll("[data-hosting-composer]")).find((node) => node.getClientRects().length > 0);
			const modal = () => Array.from(panel.querySelectorAll("[aria-modal=\"true\"]")).some((node) => node.getClientRects().length > 0);
			const notify = (detail) => {
				const target = composer();
				if (target) target.dispatchEvent(new CustomEvent(detail.files || detail.error ? PANEL_FILE_DROP : PANEL_FILE_DRAG, { detail }));
			};
			const hint = (text) => {
				panel.dataset.fileDropNotice = text;
				panel.dispatchEvent(new CustomEvent("round-table-file-hint", { detail: text }));
			};
			const reset = () => {
				active = false;
				panel.dataset.fileDrag = "idle";
				delete panel.dataset.fileDropNotice;
				notify({ active: false });
				panel.dispatchEvent(new CustomEvent("round-table-file-hint", { detail: "" }));
			};
			const file = (event) => event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");
			const own = (event) => event.target instanceof Element && event.target.closest("[data-round-table-panel]") === panel;
			const stop = (event) => {
				event.preventDefault();
				event.stopPropagation();
			};
			const clearHost = (event) => {
				resettingHost = true;
				try {
					doc.body.dispatchEvent(new DragEvent("dragleave", {
						bubbles: true,
						cancelable: true,
						dataTransfer: event.dataTransfer,
						clientX: -1,
						clientY: -1
					}));
				} finally {
					resettingHost = false;
				}
			};
			const ready = (event) => !!composer() && !modal() && event.target instanceof Element && !!event.target.closest(".rt-chat") && composer().dataset.fileDropEnabled === "true";
			const enter = (event) => {
				if (!file(event) || !own(event)) return;
				stop(event);
				if (!active) {
					active = true;
					clearHost(event);
				}
				panel.dataset.fileDrag = "active";
				const accepting = ready(event);
				event.dataTransfer.dropEffect = accepting ? "copy" : "none";
				notify({ active: true });
				hint(accepting ? "松开即可加载到本会草稿" : composer() && !modal() ? "请拖到本会讨论区；只读或待核实期间不能加载" : "请回到讨论区拖入；不会加载到原 Agent 会话");
			};
			const leave = (event) => {
				if (resettingHost || !file(event)) return;
				if (own(event)) {
					stop(event);
					if (!(event.relatedTarget instanceof Node && panel.contains(event.relatedTarget))) reset();
				} else if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= view.innerWidth || event.clientY >= view.innerHeight) reset();
			};
			const drop = (event) => {
				if (!file(event) || !own(event)) return;
				stop(event);
				clearHost(event);
				const accepting = ready(event), files = Array.from(event.dataTransfer.files);
				const directory = Array.from(event.dataTransfer.items ?? []).some((item) => item.webkitGetAsEntry?.()?.isDirectory);
				reset();
				if (directory || !files.length) {
					const error = "请拖入具体文件；暂不加载文件夹，原会话未接收。";
					notify({
						active: false,
						error
					});
					hint(error);
					return;
				}
				if (!accepting) {
					const error = "此处不能加载文件；请回到可编辑的讨论区，原会话未接收。";
					if (!modal()) notify({
						active: false,
						error
					});
					hint(error);
					return;
				}
				notify({
					active: false,
					files
				});
			};
			const escape = (event) => {
				if (event.key === "Escape" && (active || panel.dataset.fileDropNotice)) reset();
			};
			panel.addEventListener("dragenter", enter, true);
			panel.addEventListener("dragover", enter, true);
			panel.addEventListener("drop", drop, true);
			doc.addEventListener("dragleave", leave, true);
			view.addEventListener("dragend", reset);
			view.addEventListener("blur", reset);
			view.addEventListener("keydown", escape);
			return () => {
				panel.removeEventListener("dragenter", enter, true);
				panel.removeEventListener("dragover", enter, true);
				panel.removeEventListener("drop", drop, true);
				doc.removeEventListener("dragleave", leave, true);
				view.removeEventListener("dragend", reset);
				view.removeEventListener("blur", reset);
				view.removeEventListener("keydown", escape);
				reset();
			};
		}
		//#endregion
		//#region lib/task-review.js
		function revisionChild(m, t) {
			return t.review === "changes_requested" ? m.releases?.filter((r) => r.parentTaskId === t.taskId && r.status === "released" && r.tasks.some((x) => x.status !== "cancelled")).at(-1) : void 0;
		}
		function effectiveTask(m, t, seen = /* @__PURE__ */ new Set()) {
			if (seen.has(t.taskId)) return t;
			seen.add(t.taskId);
			const child = revisionChild(m, t)?.tasks.find((x) => x.toSessionId === t.toSessionId);
			return child ? effectiveTask(m, child, seen) : t;
		}
		const effectiveReleaseTasks = (m, r) => r.tasks.map((t) => effectiveTask(m, t));
		function taskNeedsAction(m, t) {
			return !revisionChild(m, t) && (!["completed", "cancelled"].includes(t.status) || t.status === "completed" && t.review !== "accepted");
		}
		function reviewState(m, t) {
			if (revisionChild(m, t)) {
				const latest = effectiveTask(m, t);
				return latest.status === "completed" ? latest.review === "accepted" ? "修改结果已通过（原结果保留）" : "修改结果待验收" : latest.status === "failed" ? "修改任务执行失败" : "等待修改结果";
			}
			return t.review === "accepted" ? "已通过" : t.review === "changes_requested" ? "修改要求待发送" : t.status === "completed" ? "待验收" : "";
		}
		//#endregion
		//#region lib/client/TaskRecovery.js
		function taskRecoveryText(task) {
			if (task.restoration?.state === "restoring") return {
				title: "正在恢复原成员会话",
				next: "插件正在恢复同一窗口与原工作区，完成后继续这次已授权投递；无需离开会议打开窗口。"
			};
			switch (task.status) {
				case "offline": return {
					title: "恢复或投递需要处理",
					next: task.error ?? "在成员边栏重试原会话恢复；已归档或已删除时可以移出会议。不会创建替代成员或复制任务。"
				};
				case "queued": return {
					title: "已授权，正在等待投递条件",
					next: "检查原窗口忙碌状态或前一项任务。已有授权的队列满足条件后可以继续，无需重复点击开始。"
				};
				case "delivered":
				case "in_progress": return {
					title: "已送达，等待正式结果",
					next: "先查看原窗口。如果已经回答却没有提交，可选择准确的原回复人工补交；不再需要时结束本会等待。"
				};
				case "uncertain": return {
					title: "还不能确定原窗口是否收到",
					next: "先查看原窗口及投递记录。重试可能重复执行，必须核对后明确确认。"
				};
				case "failed": return task.attempts === 0 ? {
					title: "未投递，需要调整输入",
					next: "查看具体原因，调整资料或模型能力后复制为新任务；此任务尚不能人工补交。"
				} : {
					title: "任务未成功提交",
					next: "先查看原窗口与失败原因；有可用回复可人工补交，否则重新准备，或结束本会等待。"
				};
				default: return;
			}
		}
		function TaskRecovery({ task }) {
			const info = taskRecoveryText(task);
			return info ? (0, react_jsx_runtime.jsxs)("div", {
				"data-task-recovery": task.taskId,
				style: {
					padding: 8,
					margin: "7px 0",
					background: "var(--dsw-alias-interactive-bg-hover)",
					borderRadius: 7,
					fontSize: 12
				},
				children: [(0, react_jsx_runtime.jsx)("b", { children: info.title }), (0, react_jsx_runtime.jsx)("p", {
					style: { margin: "4px 0 0" },
					children: info.next
				})]
			}) : null;
		}
		//#endregion
		//#region lib/workflow-types.js
		function isWorkflowCardBinding(x) {
			if (!x || typeof x !== "object" || Array.isArray(x)) return false;
			const b = x;
			return Object.keys(b).length === 5 && [
				"publicationId",
				"cardId",
				"fileId"
			].every((k) => typeof b[k] === "string" && !!b[k]) && Number.isSafeInteger(b.version) && Number(b.version) > 0 && typeof b.sha256 === "string" && /^[a-f0-9]{64}$/.test(b.sha256);
		}
		const workflowSchemaSupported = (version) => version === 1 || version === 2 || version === 3;
		const DEFAULT_WORKFLOW_LIMITS = {
			nodeAttempts: 2,
			workAttempts: 30,
			minutesStarts: 5
		};
		const validWorkflowId = (x) => typeof x === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(x) && ![
			"constructor",
			"prototype",
			"__proto__"
		].includes(x);
		/** Editing future authorization or restarting requires a separate whole-run resume. */
		const workflowNeedsExplicitResume = (r) => r.executionPolicy === "per-node-v1" && r.paused && !!r.automatic?.pauseReason && (r.automatic.pauseReason.startsWith("尚未开始的环节配置已保存") || r.automatic.pauseReason.includes("服务重启"));
		//#endregion
		//#region lib/client/RevisionPanel.js
		/** Shared by discussion, task and workflow. Opening/editing/previewing never sends. */
		function RevisionPanel({ meetingId, task, memberName, onChanged, onClose }) {
			const { readLocal, writeLocal, meetingCall } = scopedLocal((0, react.useRef)(localScopeId()).current);
			const key = `revision.${meetingId}.${task.taskId}`;
			const persistence = useLocalPersistence();
			const [note, setNote] = (0, react.useState)(() => readLocal(key, task.reviewNote ?? "")), [preview, setPreview] = (0, react.useState)(), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(""), [notice, setNotice] = (0, react.useState)("");
			const [pending, setPending] = (0, react.useState)(() => readLocal(key + ".pending", void 0));
			const guard = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				writeLocal(key, note);
			}, [note, key]);
			(0, react.useEffect)(() => {
				writeLocal(key + ".pending", pending ?? null);
			}, [pending, key]);
			const action = async (fn) => {
				if (guard.current) return;
				guard.current = true;
				setBusy(true);
				setError("");
				try {
					await fn();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					guard.current = false;
					setBusy(false);
				}
			};
			const save = async () => {
				await meetingCall(meetingId, "review-task", {
					taskId: task.taskId,
					review: "changes_requested",
					note
				});
				await onChanged();
			};
			const finish = async (request) => {
				setPending(request);
				writeLocal(key + ".pending", request);
				try {
					await meetingCall(meetingId, "revision-start", request);
				} catch (error) {
					const rejection = error;
					if (rejection.requestState === "rejected" && [
						400,
						409,
						422
					].includes(rejection.status ?? 0) || rejection.status === 400 && rejection.message === "任务或输入已变化，请重新预览") {
						setPending(void 0);
						writeLocal(key + ".pending", null);
						setPreview(void 0);
						setNotice("本次发送已被明确拒绝，未创建修改任务。意见已保留，请重新预览。");
					}
					throw error;
				}
				setPending(void 0);
				writeLocal(key + ".pending", null);
				writeLocal(key, "");
				await onChanged();
				onClose();
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				role: "region",
				"aria-label": "修改意见与预览",
				style: {
					border: "2px solid var(--dsw-alias-border-l2)",
					padding: 12,
					borderRadius: 10,
					display: "flex",
					flexDirection: "column",
					gap: 9,
					minWidth: 0
				},
				children: [
					!persistence.available && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						children: [persistence.reason, "。未保存到会议的意见与发送请求仅本次窗口有效；关闭前请复制意见并核对原请求。"]
					}),
					(0, react_jsx_runtime.jsxs)("strong", { children: ["要求修改 · ", memberName] }),
					(0, react_jsx_runtime.jsx)("p", {
						style: { margin: 0 },
						children: "原结果保留。填写意见后预览，只有“确认发送修改任务”才通知这位成员；不会自动唤醒其他人。"
					}),
					(0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "核对原结果" }), (0, react_jsx_runtime.jsx)("p", {
						style: {
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere"
						},
						children: task.result
					})] }),
					(0, react_jsx_runtime.jsx)("textarea", {
						"aria-label": "修改意见",
						style: uiInput,
						rows: 4,
						value: note,
						disabled: busy || !!pending,
						placeholder: "指出需要改哪里、保留什么，以及完成标准",
						onChange: (e) => {
							setNote(e.target.value);
							setPreview(void 0);
							setNotice("");
						}
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6,
							flexWrap: "wrap"
						},
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy || !!pending || !note.trim(),
								onClick: () => {
									action(async () => {
										await save();
										setNotice("修改意见已保存，尚未发送。");
									});
								},
								children: "保存修改意见"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy || !!pending || !note.trim(),
								onClick: () => {
									action(async () => {
										await save();
										const v = await meetingCall(meetingId, "revision-preview", {
											taskId: task.taskId,
											note
										});
										setPreview(v.plan);
									});
								},
								children: "预览修改任务"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: onClose,
								children: "稍后处理（保留草稿）"
							})
						]
					}),
					preview && (0, react_jsx_runtime.jsxs)("div", {
						role: "region",
						"aria-label": "修改任务发送确认",
						children: [
							(0, react_jsx_runtime.jsxs)("b", { children: ["将仅发送给 ", memberName] }),
							(0, react_jsx_runtime.jsx)("p", {
								style: {
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere"
								},
								children: preview.instruction
							}),
							(0, react_jsx_runtime.jsxs)("p", { children: [
								"附带 ",
								preview.messageIds.length,
								" 条已选消息／原结果、",
								preview.assetIds.length,
								" 份附件；原任务关联保留。"
							] }),
							!preview.ready && (0, react_jsx_runtime.jsx)("ul", { children: preview.missing.map((x) => (0, react_jsx_runtime.jsx)("li", { children: x }, x)) }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy || !preview.ready || !!pending,
								onClick: () => {
									action(() => finish({
										taskId: task.taskId,
										note,
										fingerprint: preview.fingerprint,
										requestId: crypto.randomUUID(),
										confirmed: true
									}));
								},
								children: "确认发送修改任务"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => setPreview(void 0),
								children: "取消修改预览"
							})
						]
					}),
					pending && !busy && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						children: ["发送结果待核实，先核对任务记录。", (0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							onClick: () => {
								action(() => finish(pending));
							},
							children: "重试同一次修改发送"
						})]
					}),
					notice && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: notice
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region lib/client/use-scoped-operations.js
		/** An async operation keeps its original owner through waits and component disposal. */
		function useScopedOperations() {
			const scope = (0, react.useRef)(localScopeId()).current, alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			const local = scopedLocal(scope), isCurrent = () => alive.current && !!scope && scope === localScopeId();
			const meetingCall = (id, action, body = {}) => {
				if (!isCurrent()) return Promise.reject(Object.assign(Error("DSH 实例已变化或页面已关闭，请重新打开原会议"), {
					status: 409,
					requestState: "rejected"
				}));
				return local.meetingCall(id, action, body);
			};
			return {
				meetingCall,
				isCurrent
			};
		}
		//#endregion
		//#region lib/client/PublishPanel.js
		const style = {
			font: "inherit",
			padding: 6,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			background: "var(--dsw-alias-bg-base)",
			color: "inherit",
			maxWidth: "100%"
		};
		function PublishPanel({ meetingId, members, releases, onChanged, initialTarget, open: controlledOpen, onClose }) {
			const { meetingCall, isCurrent } = useScopedOperations();
			const [expanded, setOpen] = (0, react.useState)(!!initialTarget), [sessionId, setSession] = (0, react.useState)(initialTarget?.sessionId ?? ""), [items, setItems] = (0, react.useState)([]), [next, setNext] = (0, react.useState)(), [selected, setSelected] = (0, react.useState)(), [taskId, setTask] = (0, react.useState)(initialTarget?.taskId ?? ""), [preview, setPreview] = (0, react.useState)(false), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)();
			const modal = controlledOpen !== void 0, open = controlledOpen ?? expanded, [purpose, setPurpose] = (0, react.useState)(initialTarget ? "task" : "meeting");
			const dialog = (0, react.useRef)(null), returnFocus = (0, react.useRef)();
			(0, react.useEffect)(() => {
				if (!modal || !open) return;
				if (typeof document !== "undefined") returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : void 0;
				dialog.current?.focus();
				return () => returnFocus.current?.focus();
			}, [modal, open]);
			const [query, setQuery] = (0, react.useState)(""), [excerpt, setExcerpt] = (0, react.useState)(""), [note, setNote] = (0, react.useState)("");
			const guard = (0, react.useRef)(false), request = (0, react.useRef)();
			const clear = () => {
				setSelected(void 0);
				setPreview(false);
				setExcerpt("");
				setNote("");
				request.current = void 0;
			};
			const close = () => {
				if (guard.current) return;
				setOpen(false);
				clear();
				onClose?.();
				returnFocus.current?.focus();
			};
			const onDialogKey = (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					close();
					return;
				}
				if (event.key !== "Tab") return;
				const controls = dialog.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex=\"0\"]");
				if (!controls?.length) {
					event.preventDefault();
					dialog.current?.focus();
					return;
				}
				const first = controls[0], last = controls[controls.length - 1];
				if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
					event.preventDefault();
					first.focus();
				}
			};
			const call = (action, body) => meetingCall(meetingId, action, body);
			const run = async (fn) => {
				if (guard.current || !isCurrent()) return;
				guard.current = true;
				setBusy(true);
				setError(void 0);
				try {
					await fn();
				} catch (e) {
					if (isCurrent()) setError(String(e instanceof Error ? e.message : e));
				} finally {
					guard.current = false;
					if (isCurrent()) setBusy(false);
				}
			};
			const load = (before) => run(async () => {
				clear();
				const v = await call("publish-candidates", {
					sessionId,
					...before !== void 0 ? { before } : {}
				});
				if (!isCurrent()) return;
				setItems(v.items);
				setNext(v.nextBefore);
			});
			const targetTask = modal && purpose === "meeting" ? "" : taskId;
			const publish = () => run(async () => {
				if (!selected || !preview || modal && purpose === "task" && !targetTask) return;
				request.current ??= crypto.randomUUID();
				await call("publish-reply", {
					sessionId,
					seq: selected.seq,
					digest: selected.digest,
					requestId: request.current,
					confirmed: true,
					...excerpt !== selected.text ? { excerpt } : {},
					...note.trim() ? { note } : {},
					...targetTask ? { taskId: targetTask } : {}
				});
				if (!isCurrent()) return;
				clear();
				setOpen(false);
				onClose?.();
				returnFocus.current?.focus();
				try {
					await onChanged();
				} catch (e) {
					if (isCurrent()) setError(`公开已接受，列表刷新失败，请刷新查看，无需重复公开：${String(e)}`);
				}
			});
			const tasks = releases.flatMap((r) => r.tasks.map((t) => ({
				...t,
				instruction: r.instruction
			}))).filter((t) => t.toSessionId === sessionId && t.attempts !== 0 && [
				"delivered",
				"in_progress",
				"uncertain",
				"failed"
			].includes(t.status));
			if (modal && !open) return null;
			const content = (0, react_jsx_runtime.jsxs)("section", {
				ref: dialog,
				role: modal ? "dialog" : void 0,
				"aria-modal": modal ? true : void 0,
				"aria-label": modal ? "导入成员回复" : void 0,
				tabIndex: modal ? -1 : void 0,
				onKeyDown: modal ? onDialogKey : void 0,
				className: modal ? "rt-import-dialog" : void 0,
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					minWidth: 0,
					fontSize: 12,
					...modal ? {
						background: "var(--dsw-alias-bg-base)",
						border: "1px solid var(--dsw-alias-border-l2)",
						borderRadius: 12,
						padding: 16,
						width: "min(660px,100%)",
						maxHeight: "88vh",
						overflow: "auto",
						boxSizing: "border-box"
					} : {}
				},
				children: [
					modal ? (0, react_jsx_runtime.jsxs)("header", {
						style: {
							display: "flex",
							justifyContent: "space-between",
							gap: 8,
							alignItems: "center"
						},
						children: [(0, react_jsx_runtime.jsx)("h3", {
							style: { margin: 0 },
							children: "导入成员回复"
						}), (0, react_jsx_runtime.jsx)("button", {
							style,
							disabled: busy,
							onClick: close,
							children: "取消导入"
						})]
					}) : (0, react_jsx_runtime.jsx)("button", {
						style,
						disabled: busy,
						onClick: () => {
							setOpen(!open);
							clear();
						},
						children: open ? "关闭人工发布" : "从原会话发布 / 补交结果"
					}),
					open && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsxs)("p", {
							style: { margin: 0 },
							children: [modal ? "从成员原窗口选择回复，加入本会资料；不会通知其他成员。打开此窗口不会读取原会话，请先选择成员并主动读取。" : "只读取你选择的原会话回复；先预览再确认。", "不会自动公开思考或工具日志。单条超过 10 万字符的回复不列入候选。"]
						}),
						(0, react_jsx_runtime.jsxs)("select", {
							"aria-label": "来源成员",
							style,
							value: sessionId,
							disabled: busy,
							onChange: (e) => {
								setSession(e.target.value);
								setItems([]);
								setNext(void 0);
								setTask("");
								clear();
							},
							children: [(0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: "选择来源成员"
							}), members.map((m) => (0, react_jsx_runtime.jsx)("option", {
								value: m.id,
								children: m.name
							}, m.id))]
						}),
						(0, react_jsx_runtime.jsx)("button", {
							style,
							disabled: busy || !sessionId,
							onClick: () => {
								load();
							},
							children: "读取近期回复"
						}),
						(0, react_jsx_runtime.jsx)("input", {
							"aria-label": "搜索原回复",
							style,
							value: query,
							onChange: (e) => setQuery(e.target.value),
							placeholder: "在本页回复中搜索"
						}),
						(0, react_jsx_runtime.jsx)("div", {
							style: {
								maxHeight: 240,
								overflow: "auto"
							},
							children: items.filter((item) => !query || item.text.includes(query)).map((item) => (0, react_jsx_runtime.jsxs)("label", {
								style: {
									display: "block",
									marginBottom: 7,
									overflowWrap: "anywhere"
								},
								children: [
									(0, react_jsx_runtime.jsx)("input", {
										type: "radio",
										name: modal ? `import-candidate-${meetingId}` : `publish-${meetingId}`,
										disabled: busy,
										checked: selected?.seq === item.seq,
										onChange: () => {
											clear();
											setSelected(item);
											setExcerpt(item.text);
										}
									}),
									new Date(item.time).toLocaleString(),
									" · #",
									item.seq,
									(0, react_jsx_runtime.jsx)("p", {
										style: {
											margin: 0,
											whiteSpace: "pre-wrap"
										},
										children: item.text.length > 250 ? `${item.text.slice(0, 250)}…（预览可看全文）` : item.text
									})
								]
							}, item.seq))
						}),
						sessionId && !items.length && (0, react_jsx_runtime.jsx)("span", { children: "尚无候选；点击读取，或选择其他成员。" }),
						next !== void 0 && (0, react_jsx_runtime.jsx)("button", {
							style,
							disabled: busy,
							onClick: () => {
								load(next);
							},
							children: "更早回复"
						}),
						modal ? (0, react_jsx_runtime.jsxs)("fieldset", {
							style: {
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: 8,
								padding: 10
							},
							children: [
								(0, react_jsx_runtime.jsx)("legend", { children: "这份回复用于" }),
								(0, react_jsx_runtime.jsxs)("label", {
									style: { display: "block" },
									children: [(0, react_jsx_runtime.jsx)("input", {
										type: "radio",
										name: `import-purpose-${meetingId}`,
										"aria-label": "加入本会资料",
										checked: purpose === "meeting",
										disabled: busy,
										onChange: () => {
											setPurpose("meeting");
											setPreview(false);
											request.current = void 0;
										}
									}), "加入本会资料 · 不通知其他成员"]
								}),
								(0, react_jsx_runtime.jsxs)("label", {
									style: {
										display: "block",
										marginTop: 7
									},
									children: [(0, react_jsx_runtime.jsx)("input", {
										type: "radio",
										name: `import-purpose-${meetingId}`,
										"aria-label": "补交工作任务结果",
										checked: purpose === "task",
										disabled: busy,
										onChange: () => {
											setPurpose("task");
											setPreview(false);
											request.current = void 0;
										}
									}), "补交工作任务结果 · 提交后仍需主持人验收"]
								}),
								purpose === "task" && (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": "补交到任务",
									style: {
										...style,
										width: "100%",
										marginTop: 8
									},
									value: taskId,
									disabled: busy,
									onChange: (e) => {
										setTask(e.target.value);
										setPreview(false);
										request.current = void 0;
									},
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "选择这位成员的任务"
									}), tasks.map((t) => (0, react_jsx_runtime.jsx)("option", {
										value: t.taskId,
										children: t.instruction.slice(0, 70)
									}, t.taskId))]
								}),
								purpose === "task" && !tasks.length && (0, react_jsx_runtime.jsx)("p", { children: "这位成员没有可补交的任务。可改为加入本会资料。" })
							]
						}) : (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": "发布用途",
							style,
							value: taskId,
							disabled: busy,
							onChange: (e) => {
								setTask(e.target.value);
								setPreview(false);
								request.current = void 0;
							},
							children: [(0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: "发布为独立会议消息"
							}), tasks.map((t) => (0, react_jsx_runtime.jsxs)("option", {
								value: t.taskId,
								children: [
									"补交：",
									t.instruction.slice(0, 35),
									" · ",
									t.taskId
								]
							}, t.taskId))]
						}),
						(0, react_jsx_runtime.jsx)("button", {
							style,
							disabled: busy || !selected || modal && purpose === "task" && !taskId,
							onClick: () => setPreview(true),
							children: modal ? "预览将加入的内容" : "预览将公开的内容"
						}),
						selected && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("label", { children: ["公开全文或连续片段", (0, react_jsx_runtime.jsx)("textarea", {
							"aria-label": "公开片段",
							rows: 4,
							style: {
								...style,
								width: "100%",
								boxSizing: "border-box"
							},
							value: excerpt,
							onChange: (e) => {
								setExcerpt(e.target.value);
								setPreview(false);
								request.current = void 0;
							}
						})] }), (0, react_jsx_runtime.jsxs)("label", { children: ["主持人补充（单独标注）", (0, react_jsx_runtime.jsx)("textarea", {
							"aria-label": "主持人补充",
							rows: 2,
							style: {
								...style,
								width: "100%",
								boxSizing: "border-box"
							},
							value: note,
							onChange: (e) => {
								setNote(e.target.value);
								setPreview(false);
								request.current = void 0;
							}
						})] })] }),
						preview && selected && (0, react_jsx_runtime.jsxs)("div", {
							role: "region",
							"aria-label": "人工发布确认",
							style: {
								border: "1px solid var(--dsw-alias-border-l2)",
								padding: 8,
								overflowWrap: "anywhere"
							},
							children: [
								(0, react_jsx_runtime.jsxs)("b", { children: [
									targetTask ? "补交到任务" : "加入本会资料",
									" · 来源：",
									members.find((m) => m.id === sessionId)?.name,
									"原窗口 · 回复 #",
									selected.seq
								] }),
								targetTask && (0, react_jsx_runtime.jsxs)("p", { children: [
									"任务：",
									tasks.find((t) => t.taskId === targetTask)?.instruction,
									"。补交是提交结果，尚不代表验收通过。"
								] }),
								(0, react_jsx_runtime.jsxs)("p", {
									style: { whiteSpace: "pre-wrap" },
									children: [excerpt, note.trim() ? `\n\n【主持人补充】\n${note}` : ""]
								}),
								(0, react_jsx_runtime.jsx)("p", { children: "确认后会成为正式会议资料，可供后续选用和秘书整理；不会通知或唤醒其他成员。原回复身份和内容校验保留。" }),
								(0, react_jsx_runtime.jsx)("button", {
									style,
									disabled: busy,
									onClick: () => {
										publish();
									},
									children: modal ? targetTask ? "确认导入并补交" : "确认加入本会资料" : `确认公开${taskId ? "并补交" : ""}`
								}),
								(0, react_jsx_runtime.jsx)("button", {
									style,
									disabled: busy,
									onClick: () => setPreview(false),
									children: "取消预览"
								})
							]
						})
					] }),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					})
				]
			});
			return modal ? (0, react_jsx_runtime.jsx)("div", {
				className: "rt-import-overlay",
				style: {
					position: "fixed",
					inset: 0,
					zIndex: 110,
					display: "grid",
					placeItems: "center",
					background: "rgba(0,0,0,.28)",
					padding: 16
				},
				children: content
			}) : content;
		}
		const REFERENCE_CHUNK_BYTES = 512 * 1024;
		async function uploadFileReference(call, meetingId, file, requestId, cancelled, progress) {
			const invalid = (message) => Object.assign(Error(message), { retryable: false });
			if (!file.size || file.size > 268435456) throw invalid("文件需有内容且不超过256MB；请保留原件，此限制不能通过重试改变。");
			const state = await call(meetingId, "asset-upload-begin", {
				requestId,
				name: file.name,
				mimeType: file.type || "application/octet-stream",
				totalBytes: file.size
			}), upload = state.upload ?? state;
			const cancel = async () => {
				await call(meetingId, "asset-upload-cancel", { uploadId: upload.uploadId });
			};
			if (cancelled()) {
				await cancel();
				return;
			}
			let offset = upload.offset;
			if (!Number.isInteger(offset) || offset < 0 || offset > file.size) throw Error("文件加载进度无法核对；原请求保留，请重试原文件。");
			while (offset < file.size) {
				if (cancelled()) {
					await cancel();
					return;
				}
				const bytes = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + REFERENCE_CHUNK_BYTES)).arrayBuffer());
				if (cancelled()) {
					await cancel();
					return;
				}
				const pieces = [];
				for (let i = 0; i < bytes.length; i += 16384) pieces.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
				const result = await call(meetingId, "asset-upload-chunk", {
					uploadId: upload.uploadId,
					offset,
					data: btoa(pieces.join(""))
				}), next = result.upload ?? result;
				if (next.uploadId !== upload.uploadId || next.offset !== offset + bytes.length) throw Error("文件块回执不匹配；原加载身份保持，不能确认已完成。");
				offset = next.offset;
				progress?.(offset, file.size);
			}
			if (cancelled()) {
				await cancel();
				return;
			}
			const value = await call(meetingId, "asset-upload-finish", { uploadId: upload.uploadId });
			if (cancelled()) {
				await cancel();
				return;
			}
			const asset = value.asset ?? value;
			if (!asset.id || asset.bytes !== file.size) throw Error("原件保存回执无法核对；请使用原加载请求重试。");
			return asset;
		}
		async function downloadMeetingAsset(meetingId, asset, scope, current) {
			if (!scope || scope !== localScopeId() || !current()) throw Error("当前会议实例已变化，未下载文件");
			const response = await fetch(`/plugins/round-table/meetings/${encodeURIComponent(meetingId)}/asset-download`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-round-table-scope": scope
				},
				body: JSON.stringify({ id: asset.id })
			});
			if (!response.ok) {
				const error = await response.json();
				throw Error(error.error ?? "文件原件无法下载");
			}
			const blob = await response.blob();
			if (!current() || scope !== localScopeId()) return;
			if (blob.size !== asset.bytes) throw Error("文件下载长度与批准版本不同，未保存副本");
			const url = URL.createObjectURL(blob), link = document.createElement("a");
			link.href = url;
			link.download = asset.name;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1e3);
		}
		//#endregion
		//#region lib/client/asset-style.js
		/** Match rc.2 draft thumbnails and the application's blue document references. */
		const assetStyles = `
.rt-asset-list{display:flex;gap:8px;flex-wrap:wrap;min-width:0;align-items:flex-start}
.rt-asset-list.compact{gap:6px;display:block}.rt-asset-images{display:flex;gap:10px;flex-wrap:wrap;min-width:0}.rt-asset-files{display:flex;gap:4px;flex-wrap:wrap;min-width:0;margin-top:6px;align-items:center}
.rt-asset-tile{position:relative;min-width:0;max-width:100%;font-size:13px;border:0;padding:0;background:transparent}.rt-asset-tile[data-asset-kind=image]{flex:none;width:64px}.rt-asset-tile[data-asset-kind=file]{display:inline-flex;align-items:center;gap:2px;max-width:100%;color:var(--dsw-alias-state-business-primary,#3964fe)}
.rt-asset-preview{font:inherit;color:inherit;cursor:pointer;padding:0;border:0;background:transparent}
.rt-asset-tile[data-asset-kind=image]>.rt-asset-preview{width:64px;height:64px;border:.5px solid var(--dsw-alias-border-l2-darkmode-thin,#e1e5ea);border-radius:var(--dsw-radius-xl,16px);background:var(--dsw-alias-interactive-bg-hover,#f2f5f8);overflow:hidden;cursor:zoom-in;display:grid;place-items:center}
.rt-asset-preview img{width:100%;height:100%;object-fit:cover;display:block}.rt-asset-loading{font-size:10px;padding:3px;color:var(--dsw-alias-label-tertiary,#65758b)}
.rt-asset-tile[data-asset-kind=file]>.rt-asset-preview{display:inline-flex;align-items:center;gap:3px;max-width:100%;min-width:0;text-align:left;line-height:22px}.rt-asset-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rt-asset-file-icon{width:14px;height:14px;flex:none}
.rt-asset-remove{width:18px;height:18px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:var(--dsw-alias-button-contrast-fill,#27313f);color:var(--dsw-alias-label-primary-inverted,#fff);cursor:pointer;opacity:0;transition:opacity .2s ease;flex:none}
.rt-asset-tile[data-asset-kind=image]>.rt-asset-remove{position:absolute;top:4px;right:4px;z-index:1}.rt-asset-tile[data-asset-kind=file]>.rt-asset-remove{width:16px;height:16px;background:transparent;color:var(--dsw-alias-label-tertiary,#66717e)}
.rt-asset-tile:hover>.rt-asset-remove,.rt-asset-tile:focus-within>.rt-asset-remove{opacity:1}.rt-asset-remove:disabled{cursor:not-allowed;opacity:.35}.rt-asset-preview:focus-visible,.rt-asset-remove:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#3964fe);outline-offset:2px}
@media(pointer:coarse){.rt-asset-remove{opacity:1}}@media(prefers-reduced-motion:reduce){.rt-asset-remove{transition:none}}
.rt-asset-tile p{margin:3px 0}.rt-asset-error{max-width:220px;font-size:11px;color:var(--dsw-alias-label-tertiary,#65758b)}
.rt-asset-overlay{position:absolute;inset:8px;z-index:12;pointer-events:auto!important;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#dce3ed);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.rt-asset-overlay header{display:flex;justify-content:space-between;gap:8px;flex:none}.rt-asset-overlay pre{min-height:0;flex:1}.rt-asset-overlay img{min-height:0;flex:1}.rt-asset-overlay small{flex:none;overflow-wrap:anywhere}
.rt-native-draft{border:1px solid var(--chat-line,var(--dsw-alias-border-l2,#e1e5ea));border-radius:16px;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-base,#fff));padding:10px;min-width:0}.rt-native-draft .rt-asset-list{margin-bottom:4px}.rt-native-draft textarea{border:0!important;border-radius:0!important;background:transparent!important;padding:2px 0!important;box-shadow:none!important;resize:none}.rt-native-draft textarea:focus,.rt-native-draft textarea:focus-visible{outline:none!important;box-shadow:none!important}
`;
		//#endregion
		//#region lib/client/ChatAssetPreview.js
		function AssetTile({ meetingId, asset, onRemove, disabled, compact }) {
			const { meetingCall, isCurrent } = useScopedOperations(), [data, setData] = (0, react.useState)(), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [open, setOpen] = (0, react.useState)(false), [retry, setRetry] = (0, react.useState)(0);
			const anchor = (0, react.useRef)(null), dialog = (0, react.useRef)(null), returnFocus = (0, react.useRef)(null), [layer, setLayer] = (0, react.useState)(null);
			const owner = (0, react.useRef)(localScopeId()).current;
			const [referenceMetadata, setReferenceMetadata] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let current = true;
				setData(void 0);
				setError("");
				if (!asset.image || asset.referenceOnly) return;
				setBusy(true);
				meetingCall(meetingId, "asset-read", { id: asset.id }).then((v) => {
					if (current && isCurrent()) setData(v.asset.data);
				}).catch((e) => {
					if (current && isCurrent()) setError(e instanceof Error ? e.message : String(e));
				}).finally(() => {
					if (current && isCurrent()) setBusy(false);
				});
				return () => {
					current = false;
				};
			}, [
				meetingId,
				asset.id + ":" + asset.version + ":" + asset.sha256,
				retry
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				setLayer(anchor.current?.closest(".rt-chat")?.querySelector("[data-rt-chat-floating-layer]") ?? null);
				const previously = typeof document === "undefined" ? null : document.activeElement;
				returnFocus.current = typeof HTMLElement !== "undefined" && previously instanceof HTMLElement ? previously : null;
				const timer = setTimeout(() => dialog.current?.querySelector("button")?.focus(), 0);
				return () => {
					clearTimeout(timer);
					returnFocus.current?.focus();
				};
			}, [open, layer]);
			const show = async () => {
				if (!isCurrent()) return;
				if (data !== void 0) {
					setOpen(true);
					return;
				}
				setBusy(true);
				setError("");
				try {
					const value = await meetingCall(meetingId, "asset-read", { id: asset.id });
					if (isCurrent()) {
						if (asset.referenceOnly && (value.asset.id !== asset.id || value.asset.sha256 !== asset.sha256 || value.asset.bytes !== asset.bytes)) throw Error("引用元信息与批准版本不同，未打开其他版本");
						if (asset.referenceOnly) setReferenceMetadata(value.asset);
						else setData(value.asset.data);
						setOpen(true);
					}
				} catch (e) {
					if (isCurrent()) setError(e instanceof Error ? e.message : String(e));
				} finally {
					if (isCurrent()) setBusy(false);
				}
			};
			const close = () => setOpen(false);
			const image = !!asset.image && !asset.referenceOnly && data !== void 0 ? `data:${asset.mimeType};base64,${data}` : void 0;
			const overlay = open && (0, react_jsx_runtime.jsxs)("div", {
				ref: dialog,
				role: "dialog",
				"aria-modal": "true",
				"aria-label": `附件预览 ${asset.name}`,
				className: "rt-asset-overlay",
				onKeyDown: (e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation();
						close();
					} else if (e.key === "Tab") {
						const controls = Array.from(dialog.current?.querySelectorAll("button,[href],[tabindex=\"0\"]") ?? []), first = controls[0], last = controls.at(-1);
						if (e.shiftKey && document.activeElement === first) {
							e.preventDefault();
							last?.focus();
						} else if (!e.shiftKey && document.activeElement === last) {
							e.preventDefault();
							first?.focus();
						}
					}
				},
				children: [
					(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsxs)("b", { children: [
						asset.name,
						" · v",
						asset.version
					] }), (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						onClick: close,
						children: "关闭附件预览"
					})] }),
					asset.referenceOnly ? (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": "完整文件引用",
						children: [
							(0, react_jsx_runtime.jsx)("p", { children: "完整原件已保存；未自动解压或解析，本次引用不向模型发送二进制内容。" }),
							(0, react_jsx_runtime.jsxs)("p", { children: [
								asset.name,
								" · ",
								(asset.bytes / 1024 / 1024).toFixed(2),
								"MB · ",
								asset.mimeType
							] }),
							(0, react_jsx_runtime.jsxs)("p", { children: ["保存位置：", referenceMetadata?.fileReference?.folderPath ? `${referenceMetadata.fileReference.folderPath}/${referenceMetadata.fileReference.relativePath}` : referenceMetadata?.fileReference?.relativePath ?? (referenceMetadata?.storageLocation === "internal-assets" ? "本会资料档案（工作区目录尚未关联）" : referenceMetadata?.storageLabel ?? "保存位置暂未核验")] }),
							(0, react_jsx_runtime.jsxs)("small", { children: [
								"批准版本 v",
								asset.version,
								" · SHA256 ",
								asset.sha256
							] }),
							(0, react_jsx_runtime.jsx)("p", { children: (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => {
									if (!isCurrent()) return;
									setBusy(true);
									downloadMeetingAsset(meetingId, asset, owner, isCurrent).catch((e) => {
										if (isCurrent()) setError(e instanceof Error ? e.message : String(e));
									}).finally(() => {
										if (isCurrent()) setBusy(false);
									});
								},
								children: "下载此版本原件"
							}) })
						]
					}) : image ? (0, react_jsx_runtime.jsx)("img", {
						alt: `${asset.name} 原图 · v${asset.version}`,
						src: image,
						style: {
							maxWidth: "100%",
							maxHeight: "calc(100% - 70px)",
							objectFit: "contain"
						}
					}) : (0, react_jsx_runtime.jsx)("pre", {
						style: {
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
							overflow: "auto"
						},
						children: data === void 0 ? "正在读取…" : new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)))
					}),
					(0, react_jsx_runtime.jsxs)("small", { children: [
						"本会归档原件 · ",
						asset.bytes,
						"字节 · 版本",
						asset.version,
						"；预览与移除草稿引用均不唤醒成员。"
					] })
				]
			});
			const remove = () => {
				if (onRemove && !disabled && isCurrent()) onRemove();
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: anchor,
				className: `rt-asset-tile ${compact ? "compact" : ""}`,
				"data-asset-preview": asset.id,
				"data-asset-kind": asset.image ? "image" : "file",
				onKeyDown: (e) => {
					if (!onRemove || disabled || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent?.isComposing || e.keyCode === 229) return;
					if (e.target instanceof HTMLElement && e.target.closest("[role=\"dialog\"]")) return;
					if (e.key === "Backspace" || e.key === "Delete") {
						e.preventDefault();
						e.stopPropagation();
						remove();
					}
				},
				children: [
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "rt-asset-preview",
						title: `${asset.name} · v${asset.version} · 点击预览`,
						"aria-label": `预览${asset.image ? "图片" : "文件"} ${asset.name} · v${asset.version}`,
						disabled: busy,
						onClick: () => {
							show();
						},
						children: asset.image ? image ? (0, react_jsx_runtime.jsx)("img", {
							alt: `${asset.name} 缩略图`,
							src: image
						}) : (0, react_jsx_runtime.jsx)("span", {
							className: "rt-asset-loading",
							children: "图片加载中…"
						}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("svg", {
							className: "rt-asset-file-icon",
							viewBox: "0 0 16 16",
							fill: "none",
							"aria-hidden": "true",
							children: [(0, react_jsx_runtime.jsx)("rect", {
								x: "3",
								y: "2",
								width: "10",
								height: "12",
								rx: "1.5",
								stroke: "currentColor"
							}), (0, react_jsx_runtime.jsx)("path", {
								d: "M5.5 5h5M5.5 8h5M5.5 11h3",
								stroke: "currentColor"
							})]
						}), (0, react_jsx_runtime.jsx)("span", {
							className: "rt-asset-file-name",
							children: asset.name
						})] })
					}),
					onRemove && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "rt-asset-remove",
						disabled,
						"aria-label": `移除草稿附件 ${asset.name}`,
						title: `移除 ${asset.name} 的草稿引用`,
						onClick: remove,
						children: (0, react_jsx_runtime.jsx)("svg", {
							width: "12",
							height: "12",
							viewBox: "0 0 12 12",
							fill: "none",
							"aria-hidden": "true",
							children: (0, react_jsx_runtime.jsx)("path", {
								d: "m3 3 6 6m0-6L3 9",
								stroke: "currentColor",
								strokeWidth: "1.6",
								strokeLinecap: "round"
							})
						})
					}),
					busy && (0, react_jsx_runtime.jsx)("small", {
						role: "status",
						children: "正在读取原件…"
					}),
					error && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						className: "rt-asset-error",
						children: [
							"预览未成功：",
							error,
							" ",
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => {
									asset.image ? setRetry((x) => x + 1) : show();
								},
								children: "重试读取"
							})
						]
					}),
					overlay && (layer ? (0, react_dom.createPortal)(overlay, layer) : overlay)
				]
			});
		}
		function ChatAssetPreview({ meetingId, assets, assetIds, onRemove, disabled, compact = false }) {
			const selected = [...new Set(assetIds)], ordered = [...selected.filter((id) => assets.find((a) => a.id === id)?.image), ...selected.filter((id) => !assets.find((a) => a.id === id)?.image)];
			const tile = (id) => {
				const asset = assets.find((a) => a.id === id);
				return asset ? (0, react_jsx_runtime.jsx)(AssetTile, {
					meetingId,
					asset,
					disabled,
					compact,
					onRemove: onRemove ? () => onRemove(id) : void 0
				}, asset.id + ":" + asset.version) : (0, react_jsx_runtime.jsxs)("span", {
					role: "alert",
					children: ["引用的历史附件未找到，请核对资料来源。", onRemove && (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						disabled,
						onClick: () => {
							if (!disabled) onRemove(id);
						},
						children: "移除缺失引用"
					})]
				}, id);
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: `rt-asset-list ${compact ? "compact" : ""}`,
				"aria-label": onRemove ? "草稿附件" : "消息附件",
				children: [(0, react_jsx_runtime.jsx)("style", { children: assetStyles }), compact ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
					className: "rt-asset-images",
					children: ordered.filter((id) => assets.find((a) => a.id === id)?.image).map(tile)
				}), (0, react_jsx_runtime.jsx)("div", {
					className: "rt-asset-files",
					children: ordered.filter((id) => !assets.find((a) => a.id === id)?.image).map(tile)
				})] }) : ordered.map(tile)]
			});
		}
		function ComposerAttachments({ meetingId, disabled, onUploaded, onBlockingChange, register }) {
			const scope = (0, react.useRef)(localScopeId()).current, { meetingCall } = scopedLocal(scope), [items, setItems] = (0, react.useState)([]), [error, setError] = (0, react.useState)(""), [notice, setNotice] = (0, react.useState)(""), live = (0, react.useRef)([]), alive = (0, react.useRef)(true), disabledRef = (0, react.useRef)(disabled), cancelled = (0, react.useRef)(/* @__PURE__ */ new Set());
			disabledRef.current = disabled;
			const update = (next) => {
				live.current = next;
				if (alive.current) {
					setItems(next);
					onBlockingChange(next.length > 0);
				}
			};
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			const upload = async (entry) => {
				try {
					const invalid = (message) => Object.assign(Error(message), { retryable: false });
					if (entry.file.size === 0) throw invalid("空文件未加载；请保留原件，此限制不能通过重试改变。");
					const extension = entry.file.name.split(".").at(-1)?.toLowerCase(), mimeType = entry.file.type || {
						png: "image/png",
						jpg: "image/jpeg",
						jpeg: "image/jpeg",
						webp: "image/webp"
					}[extension ?? ""] || "text/plain";
					const readable = [
						"image/png",
						"image/jpeg",
						"image/webp"
					].includes(mimeType) || ".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.diff,.patch,.yaml,.yml,.log,.html,.css,.xml,.sql,.png,.jpg,.jpeg,.webp".split(",").some((ext) => entry.file.name.toLowerCase().endsWith(ext));
					if (entry.file.size > 2 * 1024 * 1024 || !readable) {
						const asset = await uploadFileReference(meetingCall, meetingId, entry.file, entry.id, () => cancelled.current.has(entry.id) || scope !== localScopeId(), (loaded) => update(live.current.map((x) => x.id === entry.id ? {
							...x,
							loaded
						} : x)));
						if (asset && !cancelled.current.has(entry.id)) onUploaded(asset);
						update(live.current.filter((x) => x.id !== entry.id));
						return;
					}
					const bytes = new Uint8Array(await entry.file.arrayBuffer());
					if (scope !== localScopeId()) throw Error("DSH实例已切换，请回原会议重试；未发送资料");
					if (cancelled.current.has(entry.id)) return;
					let binary = "";
					for (const byte of bytes) binary += String.fromCharCode(byte);
					const value = await meetingCall(meetingId, "asset-upload", {
						name: entry.file.name,
						mimeType,
						data: btoa(binary),
						record: false
					});
					if (!cancelled.current.has(entry.id)) onUploaded(value.asset);
					update(live.current.filter((x) => x.id !== entry.id));
				} catch (e) {
					const error = e;
					update(live.current.map((x) => x.id === entry.id ? {
						...x,
						status: "failed",
						error: e instanceof Error ? e.message : String(e),
						retryable: error.retryable !== false && ![
							400,
							413,
							415,
							422
						].includes(error.status ?? 0)
					} : x));
				}
			};
			const receive = (files) => {
				if (disabledRef.current || scope !== localScopeId() || !alive.current) return;
				setError("");
				setNotice("");
				const next = files.filter((file) => !live.current.some((x) => x.file.name === file.name && x.file.size === file.size && x.file.lastModified === file.lastModified)).map((file) => ({
					id: crypto.randomUUID(),
					file,
					status: "uploading",
					attempt: 1
				}));
				update([...live.current, ...next]);
				for (const item of next) upload(item);
			};
			(0, react.useEffect)(() => {
				register(receive);
				return () => register(() => {});
			}, [meetingId]);
			if (!items.length && !error && !notice) return null;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "rt-compose-uploads",
				"aria-label": "直接添加会议资料",
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: `.rt-native-upload-list{display:flex;flex-direction:column;gap:3px;min-width:0}.rt-native-upload{display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;padding:2px 0;font-size:13px}.rt-native-upload-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-state-business-primary,#3964fe)}.rt-native-upload-icon{width:14px;height:14px;flex:none;color:var(--dsw-alias-state-business-primary,#3964fe)}.rt-native-upload-remove{flex:none;width:18px;height:18px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#65758b);padding:0;display:grid;place-items:center;border-radius:50%;cursor:pointer;opacity:0}.rt-native-upload:hover .rt-native-upload-remove,.rt-native-upload:focus-within .rt-native-upload-remove{opacity:1}.rt-native-upload-state{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#65758b)}.rt-native-upload-state.error{color:var(--dsw-alias-error-primary,#b42318)}@media(pointer:coarse){.rt-native-upload-remove{opacity:1}}` }),
					(0, react_jsx_runtime.jsx)("div", {
						className: "rt-native-upload-list",
						children: items.map((item) => (0, react_jsx_runtime.jsxs)("div", {
							className: "rt-native-upload",
							"data-upload-item": item.id,
							title: `${item.file.name} · ${(item.file.size / 1024).toFixed(1)}KB${item.error ? " · " + item.error : ""}`,
							children: [
								(0, react_jsx_runtime.jsxs)("svg", {
									className: "rt-native-upload-icon",
									viewBox: "0 0 16 16",
									fill: "none",
									"aria-hidden": "true",
									children: [(0, react_jsx_runtime.jsx)("rect", {
										x: "3",
										y: "2",
										width: "10",
										height: "12",
										rx: "1.5",
										stroke: "currentColor"
									}), (0, react_jsx_runtime.jsx)("path", {
										d: "M5.5 5h5M5.5 8h5M5.5 11h3",
										stroke: "currentColor"
									})]
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: "rt-native-upload-name",
									children: item.file.name
								}),
								item.status === "uploading" ? (0, react_jsx_runtime.jsx)("small", {
									className: "rt-native-upload-state",
									role: "status",
									children: item.loaded ? "加载中 " + Math.round(item.loaded / item.file.size * 100) + "%" : "加载中…"
								}) : (0, react_jsx_runtime.jsx)("span", {
									className: "rt-native-upload-state error",
									role: "alert",
									"aria-label": item.error,
									title: item.error,
									children: "未加载"
								}),
								item.status === "failed" && item.retryable !== false && (0, react_jsx_runtime.jsxs)("button", {
									style: uiButton,
									disabled,
									onClick: () => {
										const next = {
											...item,
											status: "uploading",
											attempt: item.attempt + 1,
											error: void 0
										};
										update(live.current.map((x) => x.id === item.id ? next : x));
										upload(next);
									},
									children: ["重试保存 ", item.file.name]
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "rt-native-upload-remove",
									disabled,
									"aria-label": item.status === "uploading" ? `取消草稿关联 ${item.file.name}` : `移除未保存文件 ${item.file.name}`,
									title: `移除 ${item.file.name} 的草稿引用`,
									onClick: () => {
										if (disabledRef.current) return;
										cancelled.current.add(item.id);
										update(live.current.filter((x) => x.id !== item.id));
										if (item.status === "uploading") setNotice("已移除草稿关联；可能已归档的原件保留，不加入消息。");
									},
									children: "×"
								})
							]
						}, item.id))
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					notice && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: notice
					})
				]
			});
		}
		//#endregion
		//#region lib/client/chat-draft.js
		const emptyChatDraft = () => ({
			intent: "record",
			instruction: "",
			recipientIds: [],
			messageIds: [],
			assetIds: []
		});
		function restoreChatDraft(value) {
			if (!value || typeof value !== "object") return emptyChatDraft();
			const d = value, ids = (v) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string"))] : [];
			return {
				intent: d.intent === "response" || d.intent === "work" ? d.intent : "record",
				instruction: typeof d.instruction === "string" ? d.instruction : "",
				recipientIds: ids(d.recipientIds),
				messageIds: ids(d.messageIds),
				assetIds: ids(d.assetIds),
				...typeof d.contextTaskId === "string" ? { contextTaskId: d.contextTaskId } : {}
			};
		}
		function mentionAt(text, caret) {
			const before = text.slice(0, caret), line = before.split("\n").at(-1) ?? "";
			if ((before.match(/```/g)?.length ?? 0) % 2 || /^\s*>/.test(line) || (line.match(/`/g)?.length ?? 0) % 2) return;
			const match = /@([^\s@]*)$/.exec(before);
			if (!match) return;
			const start = caret - match[1].length - 1;
			if (start > 0 && /[A-Za-z0-9_.+\-]/.test(before[start - 1])) return;
			return {
				start,
				end: caret,
				query: match[1]
			};
		}
		//#endregion
		//#region lib/client/HostingComposer.js
		function HostingComposer({ meetingId, run, members, messages, assets, paused, archived, prepared, onPrepared, onChanged, onNavigate, onCreateTask, memberStatus = {}, draftRunIds = [] }) {
			const ownerScope = (0, react.useRef)(localScopeId()).current, { readLocal, writeLocal, meetingCall } = scopedLocal(ownerScope);
			const persistence = useLocalPersistence();
			const storageKey = `hosting.${meetingId}.${run?.id ?? "plain"}`;
			const [draft, setDraft] = (0, react.useState)(() => restoreChatDraft(readLocal(storageKey, emptyChatDraft())));
			const [pending, setPending] = (0, react.useState)(() => readLocal(`${storageKey}.pending`, void 0));
			const [picker, setPicker] = (0, react.useState)(), [option, setOption] = (0, react.useState)(0), [pickerPosition, setPickerPosition] = (0, react.useState)({ maxHeight: 280 });
			const [plan, setPlan] = (0, react.useState)(), [checking, setChecking] = (0, react.useState)(false), [previewRevision, setPreviewRevision] = (0, react.useState)(0);
			const [error, setError] = (0, react.useState)(""), [notice, setNotice] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [rosterChanged, setRosterChanged] = (0, react.useState)(false);
			const guard = (0, react.useRef)(false), textarea = (0, react.useRef)(null), composer = (0, react.useRef)(null), composing = (0, react.useRef)(false), pasted = (0, react.useRef)(false), liveDraft = (0, react.useRef)(draft), alive = (0, react.useRef)(true);
			const [removeAsset, setRemoveAsset] = (0, react.useState)();
			const [uploadedAssets, setUploadedAssets] = (0, react.useState)([]), [attachmentsBlocked, setAttachmentsBlocked] = (0, react.useState)(false), [dragging, setDragging] = (0, react.useState)(false), uploadReceiver = (0, react.useRef)(() => {});
			const pickerSearch = (0, react.useRef)(null), pickerMenu = (0, react.useRef)(null), pickerAnchor = (0, react.useRef)(null);
			const [pickerLayer, setPickerLayer] = (0, react.useState)(null);
			const rosterKey = JSON.stringify(members), lastRoster = (0, react.useRef)(rosterKey);
			liveDraft.current = draft;
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				writeLocal(storageKey, draft);
			}, [draft, storageKey]);
			(0, react.useEffect)(() => {
				writeLocal(`${storageKey}.pending`, pending ?? null);
			}, [pending, storageKey]);
			(0, react.useEffect)(() => {
				if (lastRoster.current !== rosterKey && draft.recipientIds.length) setRosterChanged(true);
				lastRoster.current = rosterKey;
			}, [rosterKey]);
			(0, react.useEffect)(() => {
				if (prepared) {
					setDraft((d) => ({
						...d,
						messageIds: [.../* @__PURE__ */ new Set([...d.messageIds, ...prepared.messageIds])],
						...prepared.contextTaskId ? { contextTaskId: prepared.contextTaskId } : {},
						...prepared.recipientIds ? {
							recipientIds: [.../* @__PURE__ */ new Set([...d.recipientIds, ...prepared.recipientIds])],
							intent: "response"
						} : {}
					}));
					setNotice(prepared.purpose === "task-card" ? "已引用到任务卡生成草稿；选择 @成员后点击任务卡生成，引用本身没有发给任何人。" : prepared.contextTaskId ? "已关联原工作，只发送澄清或补充，不另建任务。" : "已引用，选择 @成员后发送。");
					textarea.current?.focus();
					onPrepared?.();
				}
			}, [prepared?.nonce]);
			(0, react.useEffect)(() => {
				const area = textarea.current;
				if (area) {
					area.style.height = "auto";
					area.style.height = Math.min(150, Math.max(64, area.scrollHeight)) + "px";
				}
			}, [draft.instruction]);
			(0, react.useEffect)(() => {
				if (!picker || !composer.current) return;
				const box = composer.current, chat = box.closest(".rt-chat"), layer = chat?.querySelector("[data-rt-chat-floating-layer]");
				if (!chat || !layer) return;
				setPickerLayer(layer);
				let frame = 0;
				const fit = () => {
					const boundary = chat.getBoundingClientRect(), origin = layer.getBoundingClientRect(), anchor = (pickerAnchor.current ?? box).getBoundingClientRect();
					const left = Math.max(boundary.left, 0) + 8, right = Math.min(boundary.right, window.innerWidth) - 8, top = Math.max(boundary.top, 0) + 8, bottom = Math.min(boundary.bottom, window.innerHeight) - 8;
					const width = Math.max(1, Math.min(310, right - left)), above = Math.max(0, Math.min(anchor.top - 8, bottom) - top), below = Math.max(0, bottom - Math.max(anchor.bottom + 8, top)), up = above >= Math.min(320, bottom - top) || above >= below;
					const maxHeight = Math.max(1, Math.min(320, up ? above : below));
					setPickerPosition({
						left: Math.max(left, Math.min(anchor.left, right - width)) - origin.left,
						right: "auto",
						width,
						maxHeight,
						visibility: "visible",
						...up ? {
							top: "auto",
							bottom: origin.bottom - Math.min(anchor.top - 8, bottom)
						} : {
							top: Math.max(anchor.bottom + 8, top) - origin.top,
							bottom: "auto"
						}
					});
				};
				const schedule = () => {
					cancelAnimationFrame(frame);
					frame = requestAnimationFrame(fit);
				};
				fit();
				schedule();
				const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : void 0;
				for (const node of [
					chat,
					box,
					layer,
					pickerAnchor.current
				]) if (node) observer?.observe(node);
				window.addEventListener("resize", schedule);
				window.addEventListener("scroll", schedule, true);
				return () => {
					cancelAnimationFrame(frame);
					observer?.disconnect();
					window.removeEventListener("resize", schedule);
					window.removeEventListener("scroll", schedule, true);
				};
			}, [!!picker, pickerLayer]);
			(0, react.useEffect)(() => {
				if (picker) pickerSearch.current?.focus();
			}, [!!picker, pickerLayer]);
			(0, react.useEffect)(() => {
				if (picker) pickerMenu.current?.querySelector(".rt-chat-options .active")?.scrollIntoView({ block: "nearest" });
			}, [
				option,
				picker?.query,
				pickerLayer
			]);
			const closePicker = () => {
				setPicker(void 0);
				pickerAnchor.current?.focus();
			};
			const change = (patch) => {
				const next = {
					...liveDraft.current,
					...patch
				};
				if (JSON.stringify(next) === JSON.stringify(liveDraft.current)) return;
				liveDraft.current = next;
				setDraft(next);
				setPlan(void 0);
				setError("");
				setNotice("");
			};
			const requestRemoveAsset = (id) => {
				if (guard.current || pending || busy || archived || ownerScope !== localScopeId()) return;
				const sourceIds = messages.filter((m) => liveDraft.current.messageIds.includes(m.id) && m.assetIds?.includes(id)).map((m) => m.id);
				if (sourceIds.length) setRemoveAsset({
					id,
					sourceIds
				});
				else {
					change({ assetIds: liveDraft.current.assetIds.filter((a) => a !== id) });
					textarea.current?.focus();
				}
			};
			const confirmRemoveAsset = () => {
				if (!removeAsset || pending || busy) return;
				const current = messages.filter((m) => liveDraft.current.messageIds.includes(m.id) && m.assetIds?.includes(removeAsset.id)).map((m) => m.id);
				if (JSON.stringify(current) !== JSON.stringify(removeAsset.sourceIds)) {
					setRemoveAsset({
						id: removeAsset.id,
						sourceIds: current
					});
					setError("资料引用已变化，请重新核对影响后确认移除。");
					return;
				}
				change({
					assetIds: liveDraft.current.assetIds.filter((a) => a !== removeAsset.id),
					messageIds: liveDraft.current.messageIds.filter((id) => !removeAsset.sourceIds.includes(id))
				});
				setRemoveAsset(void 0);
				textarea.current?.focus();
			};
			const normalMode = draft.recipientIds.length && draft.intent !== "record" ? "send" : "record";
			const payload = {
				mode: normalMode,
				kind: "message",
				instruction: draft.instruction,
				messageIds: draft.messageIds,
				assetIds: draft.assetIds,
				recipientIds: normalMode === "record" ? [] : draft.recipientIds,
				runId: run?.id ?? null,
				...draft.contextTaskId ? { contextTaskId: draft.contextTaskId } : {}
			};
			const selected = messages.filter((m) => draft.messageIds.includes(m.id)), selectedAssetIds = [.../* @__PURE__ */ new Set([...draft.assetIds, ...selected.flatMap((m) => m.assetIds ?? [])])];
			const contextKey = JSON.stringify({
				payload,
				members,
				selected,
				assets: assets.filter((a) => selectedAssetIds.includes(a.id)),
				paused,
				archived,
				attachmentsBlocked,
				run: run ? {
					id: run.id,
					status: run.status,
					paused: run.paused,
					workReserved: run.workReserved,
					budgetGrants: run.budgetGrants
				} : null
			});
			(0, react.useEffect)(() => {
				let current = true;
				setPlan(void 0);
				setError("");
				if (!payload.instruction.trim() && !payload.assetIds.length && !payload.messageIds.length || archived || pending || attachmentsBlocked) {
					setChecking(false);
					return;
				}
				setChecking(true);
				const timer = setTimeout(() => {
					meetingCall(meetingId, "chat-preview", { input: payload }).then((v) => {
						if (current) {
							setPlan({
								key: contextKey,
								value: v.plan
							});
							setChecking(false);
						}
					}).catch((e) => {
						if (current) {
							setError(String(e instanceof Error ? e.message : e));
							setChecking(false);
						}
					});
				}, 160);
				return () => {
					current = false;
					clearTimeout(timer);
				};
			}, [
				contextKey,
				!!pending,
				previewRevision
			]);
			const currentPlan = plan?.key === contextKey ? plan.value : void 0;
			const visibleAssets = [...assets, ...uploadedAssets.filter((a) => !assets.some((existing) => existing.id === a.id))];
			const imageBlocked = payload.mode === "send" && selectedAssetIds.some((id) => visibleAssets.some((a) => a.id === id && a.image)) && (!currentPlan?.imageCapabilities || !draft.recipientIds.every((id) => currentPlan.imageCapabilities.some((c) => c.sessionId === id && c.state === "supported")));
			const acceptUploaded = (asset) => {
				const old = alive.current && ownerScope === localScopeId() ? liveDraft.current : restoreChatDraft(readLocal(storageKey, liveDraft.current)), next = {
					...old,
					assetIds: [.../* @__PURE__ */ new Set([...old.assetIds, asset.id])]
				};
				writeLocal(storageKey, next);
				if (alive.current && ownerScope === localScopeId()) {
					liveDraft.current = next;
					setDraft(next);
					setUploadedAssets((previous) => [...previous.filter((a) => a.id !== asset.id), asset]);
					setPlan(void 0);
					onChanged().catch((e) => {
						if (alive.current) setNotice("资料已保存，但列表刷新失败；当前附件引用已保留，请稍后刷新。");
					});
				}
			};
			const receiveFiles = (files) => {
				if (disabled) {
					setNotice("当前发送结果待核实或会议不可编辑，请先处理原请求；新文件未上传。");
					return;
				}
				setNotice("");
				uploadReceiver.current(files);
			};
			const disabled = busy || !!archived || !!pending;
			const currentReceive = (0, react.useRef)(receiveFiles);
			currentReceive.current = receiveFiles;
			(0, react.useEffect)(() => {
				const node = composer.current;
				if (!node) return;
				const drop = (event) => {
					const detail = event.detail;
					if (detail?.error) setNotice(detail.error);
					else if (detail?.files) currentReceive.current(detail.files);
				}, drag = (event) => setDragging(event.detail?.active === true);
				node.addEventListener(PANEL_FILE_DROP, drop);
				node.addEventListener(PANEL_FILE_DRAG, drag);
				return () => {
					node.removeEventListener(PANEL_FILE_DROP, drop);
					node.removeEventListener(PANEL_FILE_DRAG, drag);
				};
			}, [meetingId, storageKey]);
			const hasDraft = (d) => !!d.instruction.trim() || !!d.messageIds.length || !!d.assetIds.length || !!d.recipientIds.length;
			const otherDrafts = ["plain", ...draftRunIds].filter((scope) => scope !== (run?.id ?? "plain")).flatMap((scope) => {
				const key = `hosting.${meetingId}.${scope}`, saved = restoreChatDraft(readLocal(key, void 0)), waiting = readLocal(`${key}.pending`, void 0);
				return hasDraft(saved) || waiting ? [{
					scope,
					saved,
					waiting
				}] : [];
			});
			const name = (id) => {
				const m = members.find((m) => m.id === id);
				return m ? `${m.name}${members.filter((x) => x.name === m.name).length > 1 ? " · " + id.slice(-6) : ""}` : `已离会 · ${id.slice(-6)}`;
			};
			const options = [
				...members.filter((m) => `${m.name} ${m.id}`.toLowerCase().includes((picker?.query ?? "").toLowerCase())).map((m) => ({
					id: m.id,
					label: m.name
				})),
				...!picker?.query || "全体成员".includes(picker.query) ? [{
					id: "__all",
					label: "全体成员"
				}] : [],
				...!picker?.query || "秘书整理纪要".includes(picker.query) ? [{
					id: "__secretary",
					label: "秘书 · 整理纪要"
				}] : []
			];
			const pick = (id) => {
				if (id === "__secretary") {
					if (picker?.start !== void 0 && picker.end !== void 0 && draft.instruction.slice(picker.start, picker.end) === "@" + picker.query) change({ instruction: draft.instruction.slice(0, picker.start) + draft.instruction.slice(picker.end) });
					closePicker();
					onNavigate?.("minutes");
					return;
				}
				const ids = id === "__all" ? members.map((m) => m.id) : [id];
				let text = draft.instruction;
				if (picker?.start !== void 0 && picker.end !== void 0 && text.slice(picker.start, picker.end) === `@${picker.query}`) text = text.slice(0, picker.start) + text.slice(picker.end);
				change({
					instruction: text,
					recipientIds: [.../* @__PURE__ */ new Set([...draft.recipientIds, ...ids])],
					intent: "response"
				});
				setPicker(void 0);
				setRosterChanged(false);
				textarea.current?.focus();
			};
			const finish = async (request) => {
				if (guard.current) return;
				guard.current = true;
				setBusy(true);
				setError("");
				setPending(request);
				writeLocal(`${storageKey}.pending`, request);
				const snapshot = JSON.stringify(liveDraft.current);
				try {
					const { receipt } = await meetingCall(meetingId, "chat-send", request);
					const sameDraft = JSON.stringify(liveDraft.current) === snapshot;
					const cleaned = writeLocal(storageKey, sameDraft ? emptyChatDraft() : liveDraft.current) && writeLocal(`${storageKey}.pending`, null) === true;
					if (alive.current) {
						setPending(cleaned ? void 0 : request);
						setPlan(void 0);
						if (sameDraft) setDraft(emptyChatDraft());
						setNotice(request.input.mode === "record" ? "已记录，没有唤醒成员。" : request.input.mode === "queue" ? `已加入第${receipt.round || 1}轮，尚未投递；到进程页查看。` : request.input.kind === "message" ? "普通消息已接受，接收状态见上方；没有创建工作任务。" : request.input.runId ? "已授权临时回应，计入额度，不推进主流程。" : "已授权，接收状态见上方消息。");
					}
					try {
						await onChanged();
					} catch {
						if (alive.current) setError("发送已接受，刷新失败；请刷新查看接收状态，不必重发。");
					}
				} catch (e) {
					if (alive.current) setError(e instanceof Error ? e.message : String(e));
					if (e instanceof Error && "requestState" in e && e.requestState === "rejected") {
						const cleared = writeLocal(`${storageKey}.pending`, null) === true;
						if (alive.current) {
							setPending(cleared ? void 0 : request);
							setPlan(void 0);
							setPreviewRevision((v) => v + 1);
							setNotice(cleared ? `未发送：${e.message}。请核对后重新发送。` : "请求明确被拒绝，但本地恢复记录未能清理；请留在本页重试原请求，当前内容保持冻结。");
						}
					}
				} finally {
					guard.current = false;
					if (alive.current) setBusy(false);
				}
			};
			const send = () => {
				if (disabled || rosterChanged || !currentPlan || attachmentsBlocked || imageBlocked) return;
				finish({
					input: payload,
					fingerprint: currentPlan.fingerprint,
					requestId: crypto.randomUUID()
				});
			};
			const onKey = (e) => {
				if (composing.current || e.nativeEvent?.isComposing || e.keyCode === 229) return;
				if (!picker && e.currentTarget === textarea.current && e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0 && selectedAssetIds.length && !disabled) {
					e.preventDefault();
					requestRemoveAsset([...selectedAssetIds].reverse().find((id) => !visibleAssets.find((a) => a.id === id)?.image) ?? selectedAssetIds.at(-1));
					return;
				}
				if (e.currentTarget === textarea.current && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
					e.preventDefault();
					if (disabled || guard.current) return;
					const area = textarea.current;
					area.setRangeText("\n", area.selectionStart, area.selectionEnd, "end");
					change({ instruction: area.value });
					setPicker(void 0);
					return;
				}
				if (picker) {
					if (e.key === "Escape") {
						e.preventDefault();
						closePicker();
						return;
					}
					if (e.key === "ArrowDown" || e.key === "ArrowUp") {
						e.preventDefault();
						setOption((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % Math.max(options.length, 1));
						return;
					}
					if (e.key === "Enter" && (!e.shiftKey || e.currentTarget !== textarea.current)) {
						e.preventDefault();
						if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && options.length) pick(options[Math.min(option, options.length - 1)].id);
						return;
					}
				}
				if (e.currentTarget === textarea.current && e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
					e.preventDefault();
					send();
				}
			};
			const sendLabel = normalMode === "record" ? "记录到会议" : draft.recipientIds.length === 1 ? `发送给 @${name(draft.recipientIds[0])}` : `发送给 @${name(draft.recipientIds[0])} 等 ${draft.recipientIds.length} 人`;
			const actionVerb = payload.mode === "record" ? "记录" : "发送";
			const actionTitle = payload.mode === "record" ? "保存到会议，不唤醒成员" : `发送给 ${draft.recipientIds.map((id) => "@" + name(id)).join("、")}`;
			const pickerPanel = picker && (0, react_jsx_runtime.jsxs)("div", {
				ref: pickerMenu,
				className: "rt-chat-picker",
				style: pickerPosition,
				role: "dialog",
				"aria-label": "@选择成员",
				children: [
					(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("b", { children: "@ 选择成员" }), (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						"aria-label": "关闭选人",
						onClick: closePicker,
						children: "×"
					})] }),
					(0, react_jsx_runtime.jsx)("input", {
						ref: pickerSearch,
						"aria-label": "搜索点名成员",
						placeholder: "搜索成员",
						style: uiInput,
						onCompositionStart: () => {
							composing.current = true;
						},
						onCompositionEnd: () => {
							composing.current = false;
						},
						onKeyDown: onKey,
						value: picker.query,
						onChange: (e) => {
							setPicker({
								...picker,
								query: e.target.value,
								start: void 0,
								end: void 0
							});
							setOption(0);
						}
					}),
					(0, react_jsx_runtime.jsx)("div", {
						role: "listbox",
						"aria-label": "会议成员",
						className: "rt-chat-options",
						children: options.map((m, i) => (0, react_jsx_runtime.jsxs)("button", {
							role: "option",
							"aria-selected": draft.recipientIds.includes(m.id),
							className: i === option ? "active" : "",
							onClick: () => pick(m.id),
							children: [(0, react_jsx_runtime.jsx)("span", { children: m.label }), (0, react_jsx_runtime.jsx)("small", { children: m.id === "__all" ? `${members.length}人（不含秘书）` : m.id === "__secretary" ? "选择范围后生成" : `${members.filter((x) => x.name === m.label).length > 1 ? m.id.slice(-6) + " · " : ""}${draft.recipientIds.includes(m.id) ? "已选" : memberStatus[m.id]?.running ? "忙碌" : memberStatus[m.id]?.availability?.state === "archived" ? "已归档" : memberStatus[m.id]?.availability?.state === "deleted" ? "已删除" : memberStatus[m.id]?.availability?.state === "unknown" ? "状态待核对" : memberStatus[m.id]?.connected ? "就绪" : "执行时恢复"}` })]
						}, m.id))
					}),
					!options.length && (0, react_jsx_runtime.jsx)("p", { children: "没有匹配的成员" })
				]
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				ref: composer,
				"aria-label": "主持输入",
				"data-hosting-composer": "",
				className: "rt-chat-composer",
				"data-attachment-drop": dragging ? "active" : "idle",
				"data-file-drop-enabled": disabled ? "false" : "true",
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: `[data-attachment-drop=active]{outline:2px dashed #2876dc;outline-offset:-3px}.rt-compose-uploads{display:flex;gap:5px;flex-wrap:wrap;min-width:0}[data-round-table-panel][data-file-drag=active] .rt-chat{outline:2px dashed #2876dc;outline-offset:-2px}.rt-compose-uploads article{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px;max-width:100%;font-size:12px}.rt-compose-uploads p{width:100%}` }),
					(0, react_jsx_runtime.jsx)("style", { children: assetStyles }),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "rt-chat-compose-content",
						children: [
							draft.contextTaskId && (0, react_jsx_runtime.jsxs)("p", {
								role: "status",
								children: ["正在补充原工作；不改变已经冻结的任务要求。", (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled,
									onClick: () => change({ contextTaskId: void 0 }),
									children: "取消工作关联"
								})]
							}),
							!persistence.available && (0, react_jsx_runtime.jsxs)("p", {
								role: "alert",
								children: [persistence.reason, "。草稿及原发送请求仅本次窗口有效，关闭前请保留内容并核对接收状态。"]
							}),
							draft.messageIds.length > 0 && (0, react_jsx_runtime.jsx)("div", {
								className: "rt-chat-quotes",
								children: draft.messageIds.map((id) => {
									const m = messages.find((x) => x.id === id);
									return (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsxs)("span", { children: [
										"引用 ",
										m ? m.sender === "user" ? "你" : name(m.sender) : "",
										" · ",
										m?.text.slice(0, 100) ?? "来源已失效，请移除或重新选择"
									] }), (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										"aria-label": `移除引用 ${id}`,
										disabled,
										onClick: () => change({ messageIds: draft.messageIds.filter((x) => x !== id) }),
										children: "×"
									})] }, id);
								})
							}),
							(0, react_jsx_runtime.jsx)("div", {
								className: "rt-chat-chips",
								children: draft.recipientIds.map((id) => (0, react_jsx_runtime.jsxs)("button", {
									className: "rt-chat-mention",
									disabled,
									"aria-label": `移除接收人 ${name(id)}`,
									onClick: () => change({
										recipientIds: draft.recipientIds.filter((x) => x !== id),
										...draft.recipientIds.length === 1 ? { intent: "record" } : {}
									}),
									children: [
										"@",
										name(id),
										" ×"
									]
								}, id))
							}),
							draft.intent === "record" && draft.recipientIds.length > 0 && (0, react_jsx_runtime.jsxs)("p", {
								role: "status",
								children: ["已恢复旧草稿的记录模式。", (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled,
									onClick: () => change({ intent: "response" }),
									children: "改为发送给所选成员"
								})]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-native-draft",
								"aria-label": "讨论草稿输入区",
								children: [
									(0, react_jsx_runtime.jsx)(ComposerAttachments, {
										meetingId,
										disabled,
										onUploaded: acceptUploaded,
										onBlockingChange: setAttachmentsBlocked,
										register: (receive) => {
											uploadReceiver.current = receive;
										}
									}),
									!!selectedAssetIds.length && (0, react_jsx_runtime.jsx)(ChatAssetPreview, {
										meetingId,
										assets: visibleAssets,
										assetIds: selectedAssetIds,
										compact: true,
										disabled,
										onRemove: requestRemoveAsset
									}),
									(0, react_jsx_runtime.jsx)("textarea", {
										ref: textarea,
										"aria-label": "主持内容",
										placeholder: "记录想法，或将图片、文档拖入此讨论区…",
										rows: 3,
										style: uiInput,
										value: draft.instruction,
										disabled,
										onPaste: (e) => {
											pasted.current = true;
											const files = Array.from(e.clipboardData.files ?? []);
											if (files.length) {
												e.preventDefault();
												pasted.current = false;
												receiveFiles(files);
												const text = e.clipboardData.getData("text/plain");
												if (text && !disabled) {
													const start = e.currentTarget.selectionStart ?? draft.instruction.length, end = e.currentTarget.selectionEnd ?? start;
													change({ instruction: draft.instruction.slice(0, start) + text + draft.instruction.slice(end) });
												}
											}
										},
										onCompositionStart: () => {
											composing.current = true;
										},
										onCompositionEnd: () => {
											composing.current = false;
										},
										onKeyDown: onKey,
										onChange: (e) => {
											change({ instruction: e.target.value });
											if (pasted.current) {
												pasted.current = false;
												setPicker(void 0);
												return;
											}
											if (!composing.current) {
												const at = mentionAt(e.target.value, e.target.selectionStart ?? e.target.value.length);
												if (at) {
													pickerAnchor.current = e.currentTarget ?? textarea.current;
													if (!picker) setPickerPosition({ visibility: "hidden" });
												}
												setPicker(at);
												setOption(0);
											}
										}
									})
								]
							}),
							/@\S*/.test(draft.instruction) && !picker && (0, react_jsx_runtime.jsx)("small", {
								className: "rt-chat-muted",
								children: "正文中的 @文字不会自动选人；实际接收人以蓝色标签为准。"
							}),
							rosterChanged && (0, react_jsx_runtime.jsxs)("div", {
								role: "alert",
								children: ["成员名单或名称已变化，请核对上方收件人。", (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									onClick: () => setRosterChanged(false),
									children: "已核对当前成员"
								})]
							}),
							removeAsset && (0, react_jsx_runtime.jsxs)("section", {
								role: "alertdialog",
								"aria-label": "确认移除资料引用",
								className: "rt-chat-target",
								children: [
									(0, react_jsx_runtime.jsxs)("b", { children: [
										"移除 ",
										visibleAssets.find((a) => a.id === removeAsset.id)?.name ?? "这份附件",
										" 的来源引用？"
									] }),
									(0, react_jsx_runtime.jsx)("p", { children: "附件由以下消息引用带入；确认会一并移除这些来源及由它们带入的其他附件。当前正文、其他独立选择的附件与会议归档原件保留。" }),
									removeAsset.sourceIds.map((id) => (0, react_jsx_runtime.jsx)("p", { children: messages.find((m) => m.id === id)?.text.slice(0, 120) ?? "历史引用" }, id)),
									(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled,
										onClick: confirmRemoveAsset,
										children: "确认移除资料引用"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										onClick: () => {
											setRemoveAsset(void 0);
											textarea.current?.focus();
										},
										children: "取消移除"
									})
								]
							}),
							imageBlocked && !currentPlan?.imageCapabilities?.length && (0, react_jsx_runtime.jsx)("p", {
								role: "status",
								children: "正在核对每位接收成员的图片能力；核实前保留整条正文与原图，尚未发送。"
							}),
							currentPlan?.imageCapabilities?.map((cap) => (0, react_jsx_runtime.jsxs)("p", {
								role: cap.state === "supported" ? "status" : "alert",
								children: [
									name(cap.sessionId),
									" · ",
									cap.reason
								]
							}, cap.sessionId)),
							otherDrafts.length > 0 && (0, react_jsx_runtime.jsxs)("details", { children: [
								(0, react_jsx_runtime.jsxs)("summary", { children: [
									"找回其他运行草稿（",
									otherDrafts.length,
									"）"
								] }),
								hasDraft(draft) && (0, react_jsx_runtime.jsx)("p", { children: "当前草稿已保存，请先处理当前内容再恢复其他草稿。" }),
								otherDrafts.map((d) => (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsxs)("p", { children: [
									d.scope === "plain" ? "流程外草稿" : `第${draftRunIds.indexOf(d.scope) + 1}次运行草稿`,
									"：",
									d.saved.instruction.slice(0, 100) || "已选资料",
									d.waiting ? " · 发送待核实" : ""
								] }), (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: disabled || hasDraft(draft),
									onClick: () => {
										setDraft(d.saved);
										if (d.waiting) setPending(d.waiting);
										setNotice(d.waiting ? "已恢复原请求；请核实，不会自动重发。" : "已恢复为当前草稿，原草稿备份仍保留；核对接收人与执行范围后再发送。");
										setPlan(void 0);
									},
									children: d.waiting ? "恢复待核实请求" : "恢复此草稿"
								})] }, d.scope))
							] })
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "rt-chat-compose-bar",
						children: [(0, react_jsx_runtime.jsx)("div", {
							className: "rt-chat-tools",
							children: (0, react_jsx_runtime.jsxs)("small", { children: [
								"正文 + ",
								draft.messageIds.length,
								" 条引用 + ",
								selectedAssetIds.length,
								" 份附件"
							] })
						}), (0, react_jsx_runtime.jsxs)("div", {
							className: "rt-chat-send-actions",
							children: [(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: disabled || attachmentsBlocked || imageBlocked,
								onClick: () => onCreateTask?.(structuredClone(draft)),
								children: "任务卡生成"
							}), (0, react_jsx_runtime.jsx)("button", {
								className: "rt-chat-send",
								"data-chat-action": payload.mode,
								title: actionTitle,
								disabled: disabled || rosterChanged || !currentPlan || attachmentsBlocked || imageBlocked,
								onClick: send,
								children: busy ? `正在${actionVerb}…` : checking ? "检查内容…" : sendLabel
							})]
						})]
					}),
					(0, react_jsx_runtime.jsxs)("small", {
						className: "rt-chat-muted",
						children: [
							normalMode === "record" ? "仅记录，不唤醒成员。" : "普通讨论消息，不创建工作任务；仅所选成员收到。",
							" 可将图片或文档直接拖入此讨论区，也可粘贴截图；正文与附件同条提交。Enter ",
							actionVerb,
							" · Ctrl/⌘+Enter 换行（Shift+Enter 也可换行）"
						]
					}),
					pickerPanel && (pickerLayer ? (0, react_dom.createPortal)(pickerPanel, pickerLayer) : !composer.current ? pickerPanel : null),
					pending && !busy && (0, react_jsx_runtime.jsxs)("div", {
						role: "alert",
						children: [
							"上次",
							pending.input.mode === "queue" ? "环节资料暂存" : "发送",
							"结果待核实。",
							pending.input.mode === "queue" && "这是旧版已经确认的原暂存请求，只可核对或重试原身份；新的资料补充入口在进程环节内。",
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => {
									finish(pending);
								},
								children: "重试原请求（不会重复创建任务）"
							})
						]
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					notice && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: notice
					})
				]
			});
		}
		//#endregion
		//#region lib/client/chat-style.js
		/** Container queries match the resizable plugin pane, not the host browser width. */
		const chatStyles = `
.rt-chat-floating-layer{position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden}.rt-chat-floating-layer>.rt-chat-picker{pointer-events:auto}
.rt-chat{--chat-line:var(--dsw-alias-border-l2,#dce3ed);--chat-bg:var(--dsw-alias-bg-base,#fff);position:relative;display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;container-type:inline-size;font-size:13px;gap:8px}
.rt-chat *{box-sizing:border-box}.rt-chat button{font:inherit}.rt-chat button:disabled{opacity:.5;cursor:default}.rt-chat button:focus-visible,.rt-chat input:focus-visible,.rt-chat textarea:focus-visible,.rt-chat summary:focus-visible{outline:2px solid #2876dc;outline-offset:2px}
.rt-chat-toolbar,.rt-chat-toolbar>div,.rt-chat-compose-bar,.rt-chat-tools,.rt-chat-send-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}.rt-chat-toolbar{justify-content:space-between;flex:none}.rt-chat-muted,.rt-chat time,.rt-chat small{color:var(--dsw-alias-text-secondary,#65758b);font-size:11px;line-height:1.5}.rt-chat-scroll{flex:1;min-height:0;overflow:auto;padding:12px 8px;overscroll-behavior:contain;scrollbar-gutter:stable}
.rt-chat-row{display:flex;align-items:flex-start;gap:9px;margin:0 0 24px;min-width:0}.rt-chat-row.own{flex-direction:row-reverse}.rt-chat-avatar{border:0;border-radius:50%;background:#e3f0fb;color:#245ca0;width:32px;height:32px;flex:0 0 32px}.rt-chat-avatar.secretary{background:#eee7f8;color:#65448e}.rt-chat-message{min-width:0;max-width:min(82%,740px)}.rt-chat-author{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px}.rt-chat-row.own .rt-chat-author{justify-content:flex-end}.rt-chat-bubble{padding:11px 14px;background:var(--chat-bg);border:1px solid var(--chat-line);border-radius:12px;min-width:0;overflow-wrap:anywhere}.rt-chat-row.own .rt-chat-bubble{background:color-mix(in srgb,#458df8 11%,var(--chat-bg));border-color:color-mix(in srgb,#458df8 30%,var(--chat-line))}.rt-chat-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;line-height:1.75}.rt-chat-text img{max-width:100%}.rt-chat-bubble summary{cursor:pointer;overflow-wrap:anywhere;line-height:1.7}
.rt-chat-reply-links{border-left:3px solid #8cb7ed;margin-bottom:9px;padding-left:8px;display:flex;flex-direction:column;gap:4px}.rt-chat-reply-links button{border:0;background:transparent;text-align:left;color:var(--dsw-alias-text-secondary,#637b9b);cursor:pointer;overflow-wrap:anywhere;padding:1px}.rt-chat-receipts{display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 2px;font-size:11px;color:var(--dsw-alias-text-secondary,#65758b)}.rt-chat-receipts [data-status=completed]{color:#258061}.rt-chat-receipts [data-status=queued],.rt-chat-receipts [data-status=offline],.rt-chat-receipts [data-status=uncertain]{color:#a26412}.rt-chat-receipts [data-status=failed]{color:#b63c3c}.rt-chat-message-actions{display:flex;align-items:flex-start;gap:12px}.rt-chat-link,.rt-chat-message-actions>details>summary{background:none;border:0;color:var(--dsw-alias-text-secondary,#617e9d);font:inherit;font-size:12px;padding:2px;cursor:pointer}.rt-chat-message-actions details[open]{background:var(--chat-bg);border:1px solid var(--chat-line);padding:8px;border-radius:8px;min-width:0;max-width:100%}.rt-chat-detail-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}.rt-chat-task-detail{margin:8px 0;padding-top:8px;border-top:1px solid var(--chat-line);overflow-wrap:anywhere}.rt-chat-assets{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.rt-chat-assets button{overflow-wrap:anywhere;max-width:100%}
.rt-chat-composer{position:relative;flex:0 1 auto;max-height:65%;min-height:140px;display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid var(--chat-line);border-radius:12px;background:var(--chat-bg);min-width:0}.rt-chat-compose-content{display:flex;flex-direction:column;gap:7px;overflow:auto;min-height:0;flex:1 1 auto}.rt-chat-compose-content>*{flex-shrink:0}.rt-chat-compose-bar{flex:none}.rt-chat-composer>.rt-chat-muted{flex:none}.rt-chat-composer textarea{resize:vertical;min-height:64px;max-height:150px;line-height:1.6;border:0!important;padding:5px!important}.rt-chat-chips{display:flex;flex-wrap:wrap;gap:5px}.rt-chat-chips:empty{display:none}.rt-chat-mention{display:inline-flex;align-items:center;padding:4px 8px;border:1px solid #b7d7fa;border-radius:18px;background:color-mix(in srgb,#438ef3 13%,var(--chat-bg));color:#2574d6;font-size:12px;max-width:100%;overflow-wrap:anywhere}.rt-chat-quotes{max-height:90px;overflow:auto;display:flex;flex-direction:column;gap:4px}.rt-chat-quotes>div{display:flex;align-items:center;gap:6px;border-left:3px solid #8cb7ed;background:color-mix(in srgb,#458df8 5%,var(--chat-bg));padding:4px 7px;border-radius:4px;color:var(--dsw-alias-text-secondary,#65758b)}.rt-chat-quotes span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px}.rt-chat-compose-bar{justify-content:space-between}.rt-chat-send-actions{margin-left:auto}.rt-chat-send{border:1px solid #176fe8;border-radius:8px;padding:7px 12px;background:#176fe8;color:#fff;cursor:pointer;overflow-wrap:anywhere}.rt-chat-tools small{max-width:100%}.rt-chat-composer p{margin:2px 0;line-height:1.6;overflow-wrap:anywhere}.rt-chat-materials,.rt-chat-target{max-height:180px;overflow:auto;border:1px solid var(--chat-line);border-radius:8px;padding:8px}.rt-chat-materials label{display:block;padding:4px;overflow-wrap:anywhere}
.rt-chat-picker{position:absolute;right:10px;bottom:calc(100% + 8px);width:min(310px,calc(100% - 20px));max-height:min(350px,55vh);overflow:auto;background:var(--chat-bg);border:1px solid var(--chat-line);border-radius:12px;padding:10px;box-shadow:0 8px 28px #16345926;z-index:5}.rt-chat-picker{display:flex;flex-direction:column;overflow:hidden}.rt-chat-picker>input{flex:none}.rt-chat-picker .rt-chat-options{overflow-y:auto;min-height:0;flex:1 1 auto}.rt-chat-picker .rt-chat-options button{flex:none}.rt-chat-picker>div:first-child{flex:none;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.rt-chat-options{margin-top:7px;display:flex;flex-direction:column;gap:3px}.rt-chat-options button{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:9px 7px;background:transparent;border:0;border-radius:6px;text-align:left;color:inherit;cursor:pointer;overflow-wrap:anywhere}.rt-chat-options button.active,.rt-chat-options button:hover{background:color-mix(in srgb,#438ef3 12%,var(--chat-bg))}.rt-chat-options button[aria-selected=true]{color:#176fe8}.rt-chat-empty{padding:40px 14px;text-align:center;line-height:1.8;color:var(--dsw-alias-text-secondary,#65758b)}.rt-chat-new{align-self:center;border:1px solid #a7c7f5;background:var(--chat-bg);color:#216dce;border-radius:18px;padding:5px 14px;cursor:pointer}.rt-chat-overlay{position:absolute;inset:10px;background:var(--chat-bg);border:1px solid var(--chat-line);border-radius:12px;padding:14px;overflow:auto;z-index:8;box-shadow:0 8px 30px #16345925}.rt-chat-overlay header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:16px}.rt-chat-overlay small{display:block;margin-top:14px;overflow-wrap:anywhere}
.rt-chat-empty small{display:block;margin-top:12px}.rt-chat-empty>button{margin-top:6px}
.rt-chat-send[data-chat-action="record"]{background:var(--chat-bg);color:var(--dsw-alias-label-primary,#25334a);border-color:var(--chat-line)}.rt-chat-send[data-chat-action="queue"]{background:var(--chat-bg);color:var(--dsw-alias-label-primary,#25334a);border:1px dashed var(--dsw-alias-label-secondary,#65758b)}.rt-chat-send:disabled{cursor:not-allowed;opacity:.55}.rt-chat-send:not(:disabled):focus-visible{outline:2px solid #176fe8;outline-offset:2px}
@container (max-width:520px){.rt-chat-toolbar{gap:4px}.rt-chat-toolbar>div{width:100%}.rt-chat-toolbar>span{display:none}.rt-chat-row{gap:6px;margin-bottom:18px}.rt-chat-avatar{width:27px;height:27px;flex-basis:27px}.rt-chat-message{max-width:calc(100% - 34px)}.rt-chat-bubble{padding:8px 10px}.rt-chat-author{gap:6px}.rt-chat-composer{padding:8px}.rt-chat-compose-bar{align-items:stretch}.rt-chat-tools{width:100%}.rt-chat-send-actions{width:100%;margin:0;justify-content:flex-end}.rt-chat-send-actions>button{flex:1;min-width:0}.rt-chat-tools small{flex-basis:100%}.rt-chat-picker{max-height:280px}.rt-chat-overlay{inset:2px}.rt-chat-scroll{padding:8px 2px}}
/* Reading stays available while long drafts, attachments and controls scroll locally. */
.rt-chat{gap:5px}.rt-chat-toolbar{padding:3px 0 6px;border-bottom:1px solid var(--chat-line)}.rt-chat-scroll{min-height:140px;flex:1 1 140px;padding-top:8px}.rt-chat-composer{min-height:90px;max-height:44%;gap:5px;padding:8px;overflow:hidden}.rt-chat-compose-content{overflow:auto;min-height:0}.rt-chat-composer textarea{min-height:48px;max-height:100px}.rt-chat-quotes{max-height:64px}.rt-chat-materials,.rt-chat-target{max-height:140px}.rt-chat-row{margin-bottom:18px}
@media(max-height:650px){.rt-chat{gap:3px}.rt-chat-scroll{min-height:140px;padding-top:5px}.rt-chat-composer{padding:6px;gap:3px;max-height:42%}.rt-chat-composer textarea{min-height:42px;max-height:80px}.rt-chat-tools small{display:none}.rt-chat-quotes{max-height:48px}}
@container(max-width:520px){.rt-chat-toolbar>div{width:auto}.rt-chat-compose-bar{gap:4px}.rt-chat-tools{width:auto;flex:1}.rt-chat-send-actions{width:auto;flex:1}.rt-chat-send-actions>button{padding:6px}.rt-chat-materials{max-height:120px}}
`;
		//#endregion
		//#region lib/client/relative-time.js
		/** Presentation only: original timestamps remain unchanged for audit and sorting. */
		function relativeTime(timestamp, now = Date.now()) {
			const date = new Date(timestamp);
			if (!Number.isFinite(timestamp) || !Number.isFinite(date.getTime()) || !Number.isFinite(now)) return {
				label: "时间未知",
				title: "宿主未提供有效时间"
			};
			const seconds = Math.abs(now - timestamp) / 1e3, future = timestamp > now;
			let label;
			if (seconds < 60) label = future ? "即将" : "刚刚";
			else {
				const [value, unit] = seconds < 3600 ? [Math.floor(seconds / 60), "分钟"] : seconds < 86400 ? [Math.floor(seconds / 3600), "小时"] : seconds < 2592e3 ? [Math.floor(seconds / 86400), "天"] : seconds < 31536e3 ? [Math.floor(seconds / 2592e3), "个月"] : [Math.floor(seconds / 31536e3), "年"];
				label = `${value}${unit}${future ? "后" : "前"}`;
			}
			return {
				label,
				title: date.toLocaleString("zh-CN", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
					hour12: false
				}),
				dateTime: date.toISOString()
			};
		}
		//#endregion
		//#region lib/client/RelativeTime.js
		/** One clock per visible panel, shared by all its timestamp labels. */
		function useRelativeNow() {
			const [now, setNow] = (0, react.useState)(() => Date.now());
			(0, react.useEffect)(() => {
				const timer = setInterval(() => setNow(Date.now()), 3e4);
				return () => clearInterval(timer);
			}, []);
			return now;
		}
		function RelativeTime({ timestamp, now }) {
			const value = relativeTime(timestamp, now);
			return (0, react_jsx_runtime.jsx)("time", {
				"data-relative-time": timestamp,
				dateTime: value.dateTime,
				title: value.title,
				"aria-label": `${value.label}，${value.title}`,
				children: value.label
			});
		}
		//#endregion
		//#region lib/client/ChatDiscussion.js
		function ChatDiscussion({ meetingId, messages, releases, members, assets, names, memberStatus, run, paused, archived, onChanged, onNavigate, onOpenSession, onPrepareTask, onSupplement, onPublish, draftRunIds = [], discussions = [], onOpenMember, onCreateTask }) {
			const { meetingCall, isCurrent } = useScopedOperations();
			const now = useRelativeNow();
			const [search, setSearch] = (0, react.useState)(false), [query, setQuery] = (0, react.useState)(""), [limit, setLimit] = (0, react.useState)(40), [unread, setUnread] = (0, react.useState)(false);
			const [response, setResponse] = (0, react.useState)(), [reference, setReference] = (0, react.useState)(), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false);
			const [confirmation, setConfirmation] = (0, react.useState)();
			const scroll = (0, react.useRef)(null), atBottom = (0, react.useRef)(true), guard = (0, react.useRef)(false), heightBefore = (0, react.useRef)();
			const name = (id) => {
				if (id === "user") return "你";
				if (id === "secretary") return "秘书";
				const m = members.find((m) => m.id === id);
				return m ? `${m.name}${members.filter((x) => x.name === m.name).length > 1 ? " · " + id.slice(-6) : ""}` : names[id] ?? `历史成员 · ${id.slice(-6)}`;
			};
			const [revisionTarget, setRevisionTarget] = (0, react.useState)();
			const revisionTask = releases.flatMap((r) => r.tasks).find((t) => t.taskId === revisionTarget);
			const publicMessages = messages.filter((m) => !m.previewOnly), filtered = publicMessages.filter((m) => !query || `${name(m.sender)} ${m.text}`.toLowerCase().includes(query.toLowerCase()));
			const newest = publicMessages.at(-1)?.id;
			(0, react.useEffect)(() => {
				const box = scroll.current;
				if (!box) return;
				if (atBottom.current) {
					box.scrollTop = box.scrollHeight;
					setUnread(false);
				} else setUnread(true);
			}, [newest]);
			(0, react.useEffect)(() => {
				const box = scroll.current;
				if (box && heightBefore.current !== void 0) {
					box.scrollTop += box.scrollHeight - heightBefore.current;
					heightBefore.current = void 0;
				}
			}, [limit]);
			const action = async (fn) => {
				if (guard.current || !isCurrent()) return;
				guard.current = true;
				setBusy(true);
				setError("");
				try {
					await fn();
				} catch (e) {
					if (isCurrent()) setError(e instanceof Error ? e.message : String(e));
				} finally {
					guard.current = false;
					if (isCurrent()) setBusy(false);
				}
			};
			const refreshAccepted = async () => {
				if (!isCurrent()) return;
				try {
					await onChanged();
				} catch (e) {
					if (isCurrent()) setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`);
				}
			};
			const call = (what, body) => {
				action(async () => {
					await meetingCall(meetingId, what, body);
					await refreshAccepted();
				});
			};
			const showReference = (id) => {
				if (!isCurrent()) return;
				const message = publicMessages.find((m) => m.id === id);
				if (message) {
					setReference(message);
					return;
				}
				action(async () => {
					const { message } = await meetingCall(meetingId, "lookup-message", { id });
					if (!isCurrent()) return;
					if (!message || message.previewOnly) throw Error("原消息不存在或尚未公开");
					setReference(message);
				});
			};
			const taskPaused = (task) => paused || !!(run?.paused && task.workflow?.runId === run.id);
			const status = (task) => {
				if (task.restoration?.state === "restoring") return "正在恢复原会话";
				if (task.status === "offline" && task.error?.startsWith("会话状态需核对")) return "会话状态需核对";
				if (task.status === "queued") {
					const s = memberStatus[task.toSessionId];
					return taskPaused(task) ? "投递已暂停" : s?.running ? "等待窗口空闲" : s?.blockers.length ? "等待前项任务" : "等待投递";
				}
				return {
					offline: "原窗口未连接",
					delivering: "正在投递",
					uncertain: "投递待核实",
					delivered: "已投递",
					in_progress: "本会任务执行中",
					completed: "已回复",
					failed: "执行失败",
					cancelled: "已结束"
				}[task.status];
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "rt-chat",
				"aria-label": "会议群聊",
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: chatStyles }),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "rt-chat-toolbar",
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: "rt-chat-muted",
							children: "会议讨论 · 发言与任务卡"
						}), (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							"aria-expanded": search,
							onClick: () => setSearch((v) => !v),
							children: "搜索"
						}), (0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							disabled: archived,
							onClick: onPublish,
							children: "导入成员回复"
						})] })]
					}),
					search && (0, react_jsx_runtime.jsx)("input", {
						"aria-label": "搜索会议消息",
						placeholder: "搜索内容或成员",
						style: uiInput,
						value: query,
						onChange: (e) => {
							setQuery(e.target.value);
							setLimit(40);
						}
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						ref: scroll,
						className: "rt-chat-scroll",
						"aria-label": "会议消息",
						onScroll: () => {
							const box = scroll.current;
							if (!box) return;
							atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
							if (atBottom.current) setUnread(false);
						},
						children: [
							filtered.length > limit && (0, react_jsx_runtime.jsxs)("button", {
								style: uiButton,
								onClick: () => {
									heightBefore.current = scroll.current?.scrollHeight;
									setLimit((n) => n + 40);
								},
								children: [
									"更早消息（还有 ",
									filtered.length - limit,
									" 条）"
								]
							}),
							!filtered.length && (0, react_jsx_runtime.jsxs)("div", {
								className: "rt-chat-empty",
								children: [
									(0, react_jsx_runtime.jsx)("b", { children: query ? "没有匹配的消息" : archived ? "暂无已公开内容" : members.length ? "开始会议讨论" : "先添加会议成员" }),
									(0, react_jsx_runtime.jsx)("p", { children: query ? "试试其他关键词。" : archived ? "会议已归档，可到设置页恢复后继续记录。" : members.length ? "在下方记录一个议题，或 @成员请他回应。" : "也可以先记录议题；添加成员后用 @ 点名。" }),
									!query && !archived && !members.length && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										onClick: () => onNavigate?.("members"),
										children: "添加会议成员"
									}),
									(0, react_jsx_runtime.jsx)("small", { children: "只有明确选中的内容才会交给成员。" })
								]
							}),
							filtered.slice(-limit).map((m) => {
								const own = m.sender === "user", release = m.releaseId ? releases.find((r) => r.id === m.releaseId) : void 0, task = m.taskId ? releases.flatMap((r) => r.tasks).find((t) => t.taskId === m.taskId) : void 0;
								const discussion = m.discussionId ? discussions.find((d) => d.id === m.discussionId) : void 0;
								return (0, react_jsx_runtime.jsxs)("article", {
									id: `flow-${m.id}`,
									"data-flow-message": m.id,
									className: `rt-chat-row ${own ? "own" : ""}`,
									children: [(0, react_jsx_runtime.jsx)("button", {
										className: `rt-chat-avatar ${m.sender === "secretary" ? "secretary" : ""}`,
										"aria-label": own ? "主持人" : `查看${name(m.sender)}成员详情`,
										disabled: own || m.sender === "secretary",
										onClick: () => onOpenMember?.(m.sender),
										children: own ? "你" : name(m.sender).slice(0, 1)
									}), (0, react_jsx_runtime.jsxs)("div", {
										className: "rt-chat-message",
										children: [
											(0, react_jsx_runtime.jsxs)("div", {
												className: "rt-chat-author",
												children: [
													(0, react_jsx_runtime.jsx)("b", { children: name(m.sender) }),
													(0, react_jsx_runtime.jsx)(RelativeTime, {
														timestamp: m.time,
														now
													}),
													m.source?.kind === "manual" && (0, react_jsx_runtime.jsxs)("small", { children: ["人工公开", m.source.excerpt ? " · 节选" : ""] })
												]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: "rt-chat-bubble",
												children: [
													!!m.replyTo?.length && (0, react_jsx_runtime.jsxs)("div", {
														className: "rt-chat-reply-links",
														children: [m.replyTo.slice(0, 3).map((id) => (0, react_jsx_runtime.jsxs)("button", {
															onClick: () => showReference(id),
															children: ["↳ ", publicMessages.find((x) => x.id === id)?.text.slice(0, 75) ?? "查看引用原文"]
														}, id)), m.replyTo.length > 3 && (0, react_jsx_runtime.jsxs)("small", { children: [
															"另有 ",
															m.replyTo.length - 3,
															" 条引用，可在详情查看"
														] })]
													}),
													!!release && (0, react_jsx_runtime.jsxs)("div", {
														className: "rt-chat-chips",
														children: [(0, react_jsx_runtime.jsx)("b", { children: "工作任务卡" }), release.recipientIds.map((id) => (0, react_jsx_runtime.jsxs)("span", {
															className: "rt-chat-mention",
															children: ["@", name(id)]
														}, id))]
													}),
													!!discussion && discussion.messageId === m.id && (0, react_jsx_runtime.jsxs)("div", {
														className: "rt-chat-chips",
														children: [discussion.recipientIds.map((id) => (0, react_jsx_runtime.jsxs)("span", {
															className: "rt-chat-mention",
															children: ["@", name(id)]
														}, id)), (0, react_jsx_runtime.jsx)("small", { children: discussion.contextTaskId ? "原工作澄清／补充" : "普通讨论消息" })]
													}),
													m.text.length > 1200 ? (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsxs)("summary", { children: [m.text.slice(0, 170), "… 展开全文"] }), (0, react_jsx_runtime.jsx)("p", {
														className: "rt-chat-text",
														children: m.text
													})] }) : (0, react_jsx_runtime.jsx)("p", {
														className: "rt-chat-text",
														children: m.text
													}),
													!!m.assetIds?.length && (0, react_jsx_runtime.jsx)(ChatAssetPreview, {
														meetingId,
														assets,
														assetIds: m.assetIds
													})
												]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: "rt-chat-receipts",
												children: [
													discussion?.messageId === m.id && discussion.deliveries.map((d) => (0, react_jsx_runtime.jsxs)("span", {
														"data-discussion-receipt": discussion.id,
														children: [
															name(d.toSessionId),
															" · ",
															discussion.replies.some((r) => r.sessionId === d.toSessionId) ? "已回应" : d.status === "delivered" ? "已送入原会话" : d.status === "queued" ? "等待接收" : d.status === "offline" ? "恢复需处理" : d.status === "uncertain" ? "送达需核实" : d.status === "cancelled" ? "已结束" : d.status === "failed" ? "接收失败，图文未处理" : "投递中"
														]
													}, d.toSessionId)),
													release?.tasks.map((t) => (0, react_jsx_runtime.jsxs)("span", {
														"data-chat-receipt": t.taskId,
														"data-status": t.status,
														children: [
															name(t.toSessionId),
															" · ",
															status(t)
														]
													}, t.taskId)),
													discussion?.messageId === m.id && discussion.deliveries.filter((d) => d.error).map((d) => (0, react_jsx_runtime.jsxs)("span", {
														role: "alert",
														children: [
															name(d.toSessionId),
															"：",
															d.error
														]
													}, "error-" + d.toSessionId)),
													m.recordOnly && !release && (0, react_jsx_runtime.jsx)("span", { children: "仅记录 · 未投递" }),
													m.kind === "minutes" && (0, react_jsx_runtime.jsx)("span", { children: m.deliveries?.some((d) => d.status === "delivered") ? "已公开 · 有成员投递记录" : "已公开到会议 · 未向成员投递" }),
													m.deliveries?.map((d) => (0, react_jsx_runtime.jsxs)("span", { children: [
														name(d.sessionId),
														" · ",
														d.status === "delivered" ? "已投递" : "未送达"
													] }, d.sessionId))
												]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: "rt-chat-message-actions",
												children: [(0, react_jsx_runtime.jsx)("button", {
													className: "rt-chat-link",
													disabled: archived,
													onClick: () => setResponse({
														messageIds: [m.id],
														nonce: Date.now(),
														...m.taskId ? {
															contextTaskId: m.taskId,
															recipientIds: [m.sender]
														} : m.releaseId ? {
															contextTaskId: release?.tasks[0]?.taskId,
															recipientIds: release?.recipientIds
														} : {}
													}),
													children: "回复"
												}), (0, react_jsx_runtime.jsxs)("details", { children: [
													(0, react_jsx_runtime.jsx)("summary", { children: "更多" }),
													(0, react_jsx_runtime.jsxs)("div", {
														className: "rt-chat-detail-actions",
														children: [
															(0, react_jsx_runtime.jsx)("button", {
																style: uiButton,
																disabled: archived,
																onClick: () => {
																	setResponse({
																		messageIds: [m.id],
																		nonce: Date.now(),
																		purpose: "task-card"
																	});
																	onPrepareTask(m);
																},
																children: "据此生成任务卡"
															}),
															(0, react_jsx_runtime.jsx)("button", {
																style: uiButton,
																disabled: archived || busy || m.id.startsWith("conclusion-"),
																onClick: () => call("mark-conclusion", { messageId: m.id }),
																children: "标记为结论"
															}),
															(0, react_jsx_runtime.jsx)("button", {
																style: uiButton,
																onClick: () => {
																	navigator.clipboard.writeText(m.text).catch((e) => setError(String(e)));
																},
																children: "复制正文"
															}),
															(0, react_jsx_runtime.jsx)("button", {
																style: uiButton,
																onClick: () => showReference(m.id),
																children: "来源与全文"
															})
														]
													}),
													(m.replyTo ?? []).map((id) => (0, react_jsx_runtime.jsxs)("button", {
														style: uiButton,
														onClick: () => showReference(id),
														children: ["查看引用 ", publicMessages.find((x) => x.id === id)?.text.slice(0, 25) ?? "历史消息"]
													}, id)),
													release?.tasks.map((t) => (0, react_jsx_runtime.jsxs)("button", {
														style: uiButton,
														onClick: () => onOpenMember?.(t.toSessionId, t.taskId),
														children: [
															name(t.toSessionId),
															" · ",
															status(t),
															" → 成员工作日志"
														]
													}, t.taskId)),
													task && (0, react_jsx_runtime.jsx)("button", {
														style: uiButton,
														onClick: () => onOpenMember?.(task.toSessionId, task.taskId),
														children: "查看这项工作的详细日志"
													})
												] })]
											})
										]
									})]
								}, m.id);
							})
						]
					}),
					unread && (0, react_jsx_runtime.jsx)("button", {
						className: "rt-chat-new",
						onClick: () => {
							const box = scroll.current;
							if (box) box.scrollTop = box.scrollHeight;
							atBottom.current = true;
							setUnread(false);
						},
						children: "有新消息 ↓"
					}),
					reference && (0, react_jsx_runtime.jsxs)("div", {
						className: "rt-chat-overlay",
						role: "dialog",
						"aria-label": "引用原文",
						children: [
							(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsxs)("b", { children: [
								name(reference.sender),
								" · ",
								new Date(reference.time).toLocaleString()
							] }), (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => setReference(void 0),
								children: "关闭原文"
							})] }),
							(0, react_jsx_runtime.jsx)("p", {
								className: "rt-chat-text",
								children: reference.text
							}),
							(0, react_jsx_runtime.jsxs)("small", { children: [
								reference.source?.kind === "manual" ? `人工公开 · 原回复 #${reference.source.seq}${reference.source.excerpt ? " · 节选" : ""}` : reference.source?.kind === "agent" ? "Agent正式提交" : "会议资料",
								(0, react_jsx_runtime.jsx)("br", {}),
								reference.id,
								reference.taskId ? ` / ${reference.taskId}` : ""
							] })
						]
					}),
					confirmation && (0, react_jsx_runtime.jsxs)("div", {
						className: "rt-chat-overlay",
						role: "alertdialog",
						"aria-label": "确认任务操作",
						children: [
							(0, react_jsx_runtime.jsx)("p", { children: confirmation.text }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => {
									call(confirmation.action, confirmation.body);
									setConfirmation(void 0);
								},
								children: "确认"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => setConfirmation(void 0),
								children: "取消"
							})
						]
					}),
					revisionTask && (0, react_jsx_runtime.jsx)(RevisionPanel, {
						meetingId,
						task: revisionTask,
						memberName: name(revisionTask.toSessionId),
						onChanged,
						onClose: () => setRevisionTarget(void 0)
					}, revisionTask.taskId),
					(0, react_jsx_runtime.jsx)(HostingComposer, {
						onCreateTask,
						meetingId,
						run,
						members,
						messages: publicMessages,
						assets,
						paused,
						archived,
						prepared: response,
						onPrepared: () => setResponse(void 0),
						onChanged,
						onNavigate,
						memberStatus,
						draftRunIds
					}, `${meetingId}:${run?.id ?? "plain"}`),
					(0, react_jsx_runtime.jsx)("div", {
						className: "rt-chat-floating-layer",
						"data-rt-chat-floating-layer": ""
					})
				]
			});
		}
		//#endregion
		//#region lib/client/TaskCardsPanel.js
		/** The key fences late responses and drafts when switching meetings or DSH homes. */
		function TaskCardsPanel(props) {
			const scope = localScopeId();
			return props.open ? (0, react_jsx_runtime.jsx)(TaskCardsDialog, { ...props }, `${scope ?? "unknown"}:${props.meetingId}`) : null;
		}
		function TaskCardsDialog({ meetingId, readOnly = false, onClose, cards = [], generations = [], publications = [], discussions = [], members, onChanged, onOpenMember }) {
			const scope = (0, react.useRef)(localScopeId()).current, { readLocal, writeLocal, meetingCall } = scopedLocal(scope), draftKey = `task-cards-editor.${meetingId}`, pendingKey = `task-cards-pending.${meetingId}`;
			const [editor, setEditor] = (0, react.useState)(() => readLocal(draftKey, void 0)), [selected, setSelected] = (0, react.useState)([]), [pending, setPending] = (0, react.useState)(() => readLocal(pendingKey, void 0)), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(""), [confirm, setConfirm] = (0, react.useState)(false), [approval, setApproval] = (0, react.useState)([]), [notice, setNotice] = (0, react.useState)("");
			const guard = (0, react.useRef)(false), alive = (0, react.useRef)(true), dialog = (0, react.useRef)(null), focusReturn = (0, react.useRef)();
			(0, react.useEffect)(() => {
				alive.current = true;
				if (typeof document !== "undefined") {
					focusReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : void 0;
					dialog.current?.focus();
				}
				return () => {
					alive.current = false;
					focusReturn.current?.focus();
				};
			}, []);
			const name = (id) => members.find((x) => x.id === id)?.name ?? (id ? "已离会成员" : "待确认");
			const batch = (c) => {
				const n = generations.filter((g) => g.kind === "generate").findIndex((g) => g.id === c.generationId);
				return n < 0 ? "历史生成" : `第${n + 1}次生成`;
			};
			const edit = (next) => {
				if (readOnly || guard.current || pending) return;
				if (!writeLocal(draftKey, next)) {
					setError("无法保存本地编辑，请保留正文；尚未发送修改");
					return;
				}
				setEditor(next);
				setNotice("");
			};
			const choose = (c) => {
				if (readOnly) {
					setEditor({
						cardId: c.id,
						expectedVersion: c.version,
						title: c.title,
						body: c.body,
						assigneeSessionId: c.assigneeSessionId ?? "",
						note: ""
					});
					return;
				}
				if (editor && (editor.title !== cards.find((x) => x.id === editor.cardId)?.title || editor.body !== cards.find((x) => x.id === editor.cardId)?.body || editor.assigneeSessionId !== (cards.find((x) => x.id === editor.cardId)?.assigneeSessionId ?? "") || !!editor.note.trim())) {
					setError("当前正文尚未保存，请先保存本卡；切换不会覆盖它");
					return;
				}
				edit({
					cardId: c.id,
					expectedVersion: c.version,
					title: c.title,
					body: c.body,
					assigneeSessionId: c.assigneeSessionId ?? "",
					note: ""
				});
			};
			const send = async (request) => {
				if (readOnly || guard.current) return;
				guard.current = true;
				setBusy(true);
				setError("");
				try {
					const result = await meetingCall(meetingId, request.action, {
						...request.body,
						requestId: request.requestId
					});
					let next;
					if (request.action === "task-card-edit" || request.action === "task-card-adopt") {
						const c = result.card ?? result;
						if (!c.id || !c.version) throw Error("服务器修改回执缺少任务卡版本");
						next = {
							cardId: c.id,
							expectedVersion: c.version,
							title: c.title,
							body: c.body,
							assigneeSessionId: c.assigneeSessionId ?? "",
							note: ""
						};
						if (!writeLocal(draftKey, next)) throw Error("修改已响应但本地正文未能保存，保留原请求核对");
					}
					if (!writeLocal(pendingKey, void 0)) throw Error("操作已响应，但本地回执未能收尾；请用原请求核对");
					if (alive.current) {
						setPending(void 0);
						if (next) setEditor(next);
						setNotice(request.action === "task-card-publish" ? "选定卡片已发布，已进入责任成员通知队列；投递与执行状态见成员工作日志。" : request.label + "已记录。生成或调整不会自动执行任务。");
						setConfirm(false);
						await onChanged();
					}
				} catch (e) {
					const x = e;
					if (x.requestState === "rejected" && writeLocal(pendingKey, void 0) && alive.current) setPending(void 0);
					if (alive.current) setError(x.message + (x.requestState === "rejected" ? "" : "；结果待核实，请保留原请求重试，勿新建同次操作"));
				} finally {
					guard.current = false;
					if (alive.current) setBusy(false);
				}
			};
			const begin = (action, body, label) => {
				if (readOnly || guard.current || pending) return;
				const next = {
					requestId: crypto.randomUUID(),
					action,
					body: structuredClone(body),
					label
				};
				if (!writeLocal(pendingKey, next)) {
					setError("本地存储不可用，无法保留原请求；尚未发送");
					return;
				}
				setPending(next);
				send(next);
			};
			const save = () => {
				if (!editor) return;
				begin("task-card-edit", {
					cardId: editor.cardId,
					expectedVersion: editor.expectedVersion,
					title: editor.title,
					body: editor.body,
					assigneeSessionId: editor.assigneeSessionId || void 0
				}, "修改");
			};
			const publishable = cards.filter((c) => selected.includes(c.id) && !publications.some((p) => p.cards.some((v) => v.cardId === c.id && v.version === c.version)));
			const selectedCard = editor ? cards.find((c) => c.id === editor.cardId) : void 0;
			const dirty = !!editor && !!selectedCard && (editor.title !== selectedCard.title || editor.body !== selectedCard.body || editor.assigneeSessionId !== (selectedCard.assigneeSessionId ?? ""));
			const statusNames = {
				queued: "等待原成员",
				delivering: "投递中",
				delivered: "已接收，等待卡片",
				offline: "原成员未连接",
				failed: "投递失败",
				uncertain: "送达待核实",
				cancelled: "等待已结束"
			};
			const retry = (d, sid) => begin("discussion-retry", {
				discussionId: d.id,
				sessionId: sid
			}, "重试原生成请求");
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					position: "absolute",
					inset: 8,
					zIndex: 2200,
					background: "var(--dsw-alias-bg-base)",
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 10,
					boxShadow: "0 10px 50px #0003",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden"
				},
				role: "dialog",
				"aria-modal": "true",
				"aria-label": "任务卡生成与修改",
				tabIndex: -1,
				ref: dialog,
				onKeyDown: (e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						onClose();
					}
					if (e.key === "Tab") {
						const nodes = [...dialog.current?.querySelectorAll("button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex=\"0\"]") ?? []].filter((x) => x.getClientRects().length);
						const first = nodes[0], last = nodes.at(-1);
						if (e.shiftKey && document.activeElement === first) {
							e.preventDefault();
							last?.focus();
						} else if (!e.shiftKey && document.activeElement === last) {
							e.preventDefault();
							first?.focus();
						}
					}
				},
				children: [(0, react_jsx_runtime.jsxs)("header", {
					style: {
						display: "flex",
						gap: 8,
						alignItems: "center",
						padding: 12,
						borderBottom: "1px solid var(--dsw-alias-border-l2)"
					},
					children: [(0, react_jsx_runtime.jsx)("strong", {
						style: { flex: 1 },
						children: "任务卡生成与修改"
					}), (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						onClick: onClose,
						children: "关闭"
					})]
				}), (0, react_jsx_runtime.jsxs)("div", {
					style: {
						padding: 12,
						overflow: "auto",
						minHeight: 0,
						flex: 1
					},
					children: [
						readOnly && (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: "会议已归档，仅查看历史；修改、调整、重试与发布均暂停。"
						}),
						(0, react_jsx_runtime.jsx)("p", { children: "由你已@的原成员提出后续工作。生成者与执行者分别显示；生成和修改属于准备工作，确认发布后才通知执行。" }),
						pending && (0, react_jsx_runtime.jsxs)("div", {
							role: "status",
							children: [
								pending.label,
								"的原请求待核实，重开后仍保留。",
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: readOnly || busy,
									onClick: () => void send(pending),
									children: "核对并重试原请求"
								})
							]
						}),
						error && (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							style: { color: "var(--dsw-alias-error-primary,#b42318)" },
							children: error
						}),
						notice && (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: notice
						}),
						generations.length === 0 && (0, react_jsx_runtime.jsx)("p", { children: "请在讨论输入区@原成员，点击「任务卡生成」。可以不填写额外正文。" }),
						generations.map((g) => (0, react_jsx_runtime.jsxs)("section", {
							style: {
								borderBottom: "1px solid var(--dsw-alias-border-l2)",
								padding: "8px 0"
							},
							children: [(0, react_jsx_runtime.jsx)("strong", { children: g.kind === "adjust" ? "指定卡片调整" : "后续工作生成" }), g.recipientIds.map((sid) => {
								const response = g.responses.find((x) => x.sessionId === sid), d = discussions.find((x) => x.id === g.discussionId), delivery = d?.deliveries.find((x) => x.toSessionId === sid);
								return (0, react_jsx_runtime.jsxs)("div", { children: [
									(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										onClick: () => {
											onClose();
											onOpenMember?.(sid);
										},
										children: name(sid)
									}),
									" · ",
									response ? response.emptyReason ? `无待办：${response.emptyReason}` : `已返回${response.cardIds.length}张卡` : statusNames[delivery?.status ?? "queued"],
									delivery?.error && (0, react_jsx_runtime.jsxs)("span", {
										role: "status",
										children: [" · ", delivery.error]
									}),
									!response && d && [
										"offline",
										"failed",
										"uncertain"
									].includes(delivery?.status ?? "") && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: readOnly || busy || !!pending,
										onClick: () => retry(d, sid),
										children: "重试此成员原请求"
									})
								] }, sid);
							})]
						}, g.id)),
						(0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))",
								gap: 12,
								marginTop: 12
							},
							children: [(0, react_jsx_runtime.jsxs)("section", {
								"aria-label": "逐项任务卡清单",
								children: [cards.map((c) => {
									const published = publications.find((p) => p.cards.some((v) => v.cardId === c.id && v.version === c.version));
									return (0, react_jsx_runtime.jsxs)("article", {
										style: {
											padding: 10,
											marginBottom: 8,
											border: "1px solid var(--dsw-alias-border-l2)",
											borderRadius: 8
										},
										children: [
											(0, react_jsx_runtime.jsxs)("label", { children: [
												(0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													"aria-label": `选择${c.title}`,
													checked: selected.includes(c.id),
													disabled: readOnly || !!published || busy || !!pending,
													onChange: (e) => {
														setConfirm(false);
														setSelected((v) => e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id));
													}
												}),
												" ",
												c.title,
												" · v",
												c.version
											] }),
											(0, react_jsx_runtime.jsxs)("small", {
												style: {
													display: "block",
													marginTop: 4
												},
												children: [
													batch(c),
													" · ",
													new Date(c.createdAt).toLocaleString()
												]
											}),
											(0, react_jsx_runtime.jsxs)("p", {
												style: { margin: "6px 0" },
												children: [
													"生成：",
													name(c.generatorSessionId),
													" · 执行：",
													name(c.assigneeSessionId)
												]
											}),
											(0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												disabled: !readOnly && (busy || !!pending),
												onClick: () => choose(c),
												children: "查看全文与修改"
											}),
											published && (0, react_jsx_runtime.jsxs)("p", { children: [published.status === "published" ? "此版本已发布" : "此版本已批准，写入待核实", published.cards.find((v) => v.cardId === c.id)?.relativePath && ` · ${published.cards.find((v) => v.cardId === c.id).relativePath}`] })
										]
									}, c.id);
								}), !cards.length && generations.length > 0 && (0, react_jsx_runtime.jsx)("p", { children: "等待各位原成员返回卡片；其他成员失败不会重新生成成功项。" })]
							}), editor && (0, react_jsx_runtime.jsxs)("section", {
								"aria-label": "任务卡正文编辑",
								children: [
									(0, react_jsx_runtime.jsxs)("label", { children: ["名称", (0, react_jsx_runtime.jsx)("input", {
										style: uiInput,
										value: editor.title,
										disabled: readOnly || busy || !!pending,
										onChange: (e) => edit({
											...editor,
											title: e.target.value
										})
									})] }),
									(0, react_jsx_runtime.jsxs)("p", { children: [
										"编辑基于 v",
										editor.expectedVersion,
										"，服务器当前 v",
										selectedCard?.version ?? "未知",
										"。刷新不会替换正在编辑的正文。"
									] }),
									(0, react_jsx_runtime.jsxs)("label", { children: ["完整Markdown正文", (0, react_jsx_runtime.jsx)("textarea", {
										style: {
											...uiInput,
											minHeight: 250,
											fontFamily: "inherit"
										},
										value: editor.body,
										disabled: readOnly || busy || !!pending,
										onChange: (e) => edit({
											...editor,
											body: e.target.value
										})
									})] }),
									(0, react_jsx_runtime.jsxs)("label", { children: ["确认责任成员", (0, react_jsx_runtime.jsxs)("select", {
										style: uiInput,
										value: editor.assigneeSessionId,
										disabled: readOnly || busy || !!pending,
										onChange: (e) => edit({
											...editor,
											assigneeSessionId: e.target.value
										}),
										children: [(0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: "待确认"
										}), members.map((m) => (0, react_jsx_runtime.jsx)("option", {
											value: m.id,
											children: m.name
										}, m.id))]
									})] }),
									(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: readOnly || busy || !!pending || !dirty || !editor.body.trim() || !editor.title.trim(),
										onClick: save,
										children: "保存本卡修改"
									}),
									(0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "对照历史版本" }), selectedCard?.versions.map((v) => (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsxs)("strong", { children: [
										"v",
										v.version,
										" · ",
										v.source === "user" ? "用户修改" : v.source === "adjustment" ? "采纳调整" : "原成员生成"
									] }), (0, react_jsx_runtime.jsx)("pre", {
										style: {
											whiteSpace: "pre-wrap",
											overflowWrap: "anywhere"
										},
										children: v.body
									})] }, v.version))] }),
									(0, react_jsx_runtime.jsxs)("label", { children: ["让原生成者调整本卡", (0, react_jsx_runtime.jsx)("textarea", {
										style: {
											...uiInput,
											minHeight: 60
										},
										value: editor.note,
										disabled: readOnly || busy || !!pending,
										onChange: (e) => edit({
											...editor,
											note: e.target.value
										})
									})] }),
									(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: readOnly || busy || !!pending || dirty || !editor.note.trim() || !selectedCard,
										onClick: () => begin("task-card-adjust", {
											cardId: editor.cardId,
											expectedVersion: editor.expectedVersion,
											note: editor.note
										}, "本卡调整请求"),
										children: "交给原生成者调整这一卡"
									}),
									dirty && (0, react_jsx_runtime.jsx)("p", { children: "先保存当前编辑，再请求调整或发布。" }),
									selectedCard?.proposals.filter((p) => !p.adoptedVersion).map((p) => (0, react_jsx_runtime.jsxs)("details", { children: [
										(0, react_jsx_runtime.jsxs)("summary", { children: [
											"调整建议 · 基于 v",
											p.baseVersion,
											"（不会覆盖当前正文）"
										] }),
										(0, react_jsx_runtime.jsx)("pre", {
											style: {
												whiteSpace: "pre-wrap",
												overflowWrap: "anywhere"
											},
											children: p.body
										}),
										(0, react_jsx_runtime.jsx)("button", {
											style: uiButton,
											disabled: readOnly || busy || !!pending || dirty || p.baseVersion !== selectedCard.version,
											onClick: () => begin("task-card-adopt", {
												cardId: selectedCard.id,
												proposalId: p.id,
												expectedVersion: selectedCard.version
											}, "采纳调整建议"),
											children: "采纳此建议版本"
										}),
										p.baseVersion !== selectedCard.version && (0, react_jsx_runtime.jsx)("p", { children: "你已修改为新版本，请对照建议手动合并，不直接覆盖。" })
									] }, p.id))
								]
							})]
						}),
						publishable.length > 0 && (0, react_jsx_runtime.jsx)("section", {
							style: {
								paddingTop: 12,
								borderTop: "1px solid var(--dsw-alias-border-l2)"
							},
							children: !confirm ? (0, react_jsx_runtime.jsxs)("button", {
								style: uiButton,
								disabled: readOnly || busy || !!pending || dirty,
								onClick: () => {
									setApproval(structuredClone(publishable));
									setConfirm(true);
								},
								children: [
									"核对选定的",
									publishable.length,
									"张卡"
								]
							}) : (0, react_jsx_runtime.jsxs)("div", { children: [
								(0, react_jsx_runtime.jsx)("p", { children: "仅发布以下版本，写入本会文件夹成功后通知所列责任成员执行。未选中的卡不会执行。" }),
								approval.map((c) => (0, react_jsx_runtime.jsxs)("p", { children: [
									c.title,
									" · v",
									c.version,
									" · ",
									batch(c),
									" · 执行：",
									name(c.assigneeSessionId)
								] }, c.id)),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: readOnly || busy || !!pending || dirty || approval.some((c) => !c.assigneeSessionId),
									onClick: () => begin("task-card-publish", {
										cards: approval.map((c) => ({
											cardId: c.id,
											version: c.version
										})),
										execute: true
									}, "选定卡片发布"),
									children: "确认发布并通知执行"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									onClick: () => setConfirm(false),
									children: "返回修改"
								}),
								publishable.some((c) => !c.assigneeSessionId) && (0, react_jsx_runtime.jsx)("p", { children: "请先为所选卡确认责任成员并保存。" })
							] })
						})
					]
				})]
			});
		}
		//#endregion
		//#region lib/client/task-draft.js
		const emptyTaskDraft = () => ({
			title: "",
			instruction: "",
			messageIds: [],
			recipientIds: [],
			assetIds: []
		});
		//#endregion
		//#region lib/client/LegacyTaskRecovery.js
		/** Only a previously authorized frozen request may use the removed manual path. */
		function LegacyTaskRecovery({ meetingId, onChanged, readOnly = false }) {
			const scope = (0, react.useRef)(localScopeId()).current, ownerMeeting = (0, react.useRef)(meetingId).current, currentMeeting = (0, react.useRef)(meetingId), alive = (0, react.useRef)(true), { readLocal, writeLocal, meetingCall } = scopedLocal(scope), key = `editor-save.${ownerMeeting}`;
			currentMeeting.current = meetingId;
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			const current = () => alive.current && scope === localScopeId() && currentMeeting.current === ownerMeeting;
			const [pending, setPending] = (0, react.useState)(() => readLocal(key, void 0)), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)("");
			const guard = (0, react.useRef)(false);
			const retry = async () => {
				if (!pending || guard.current || !current() || readOnly) return;
				guard.current = true;
				setBusy(true);
				setError("");
				let r = pending;
				const remember = (next) => {
					r = next;
					if (current()) setPending(next);
					return writeLocal(key, next);
				};
				const settle = () => {
					remember(r);
					if (!writeLocal(`editor.${ownerMeeting}`, r.stage === "completed" ? emptyTaskDraft() : r.editor) || !writeLocal(key, void 0)) throw Error("结果已明确，本地恢复记录未能清理，请重试本地清理");
					if (current()) setPending(void 0);
				};
				try {
					if (!["completed", "rejected"].includes(r.stage)) try {
						if (r.stage === "draft") {
							const v = await meetingCall(ownerMeeting, "release-draft", {
								...r.editor,
								id: r.editor.id ?? r.requestId
							});
							if (r.release) remember({
								...r,
								stage: "release",
								draftId: v.draft.id,
								version: v.draft.version
							});
						}
						if (r.release) await meetingCall(ownerMeeting, "release", {
							draftId: r.draftId,
							version: r.version
						});
						remember({
							...r,
							stage: "completed"
						});
					} catch (e) {
						if (e.requestState === "rejected") {
							remember({
								...r,
								stage: "rejected",
								editor: r.stage === "release" ? {
									...r.editor,
									id: r.draftId,
									version: r.version
								} : r.editor
							});
							settle();
						}
						throw e;
					}
					settle();
					if (current()) try {
						await onChanged();
					} catch (e) {
						setError(`原请求已处理，列表刷新失败：${e instanceof Error ? e.message : String(e)}；请刷新查看，不必再发原操作`);
					}
				} catch (e) {
					if (current()) setError(e instanceof Error ? e.message : String(e));
				} finally {
					guard.current = false;
					if (current()) setBusy(false);
				}
			};
			if (!pending) return error ? (0, react_jsx_runtime.jsx)("p", {
				role: "alert",
				children: error
			}) : null;
			return (0, react_jsx_runtime.jsxs)("section", {
				role: "alert",
				"aria-label": "旧任务原请求待核实",
				children: [
					(0, react_jsx_runtime.jsx)("b", { children: "旧版本原请求恢复" }),
					(0, react_jsx_runtime.jsx)("p", { children: ["completed", "rejected"].includes(pending.stage) ? "原请求结果已明确；重试仅完成本地清理。" : "这是此前已确认的冻结请求，请先核对投递记录；重试保持原请求编号与内容。" }),
					(0, react_jsx_runtime.jsxs)("details", { children: [
						(0, react_jsx_runtime.jsx)("summary", { children: "核对原要求和责任成员" }),
						(0, react_jsx_runtime.jsx)("pre", {
							style: { whiteSpace: "pre-wrap" },
							children: pending.editor.instruction
						}),
						(0, react_jsx_runtime.jsx)("p", { children: pending.editor.recipientIds.join("、") })
					] }),
					(0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						disabled: readOnly || busy,
						onClick: () => void retry(),
						children: busy ? "核对中…" : "核对并重试原请求"
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region lib/client/use-card-generation.js
		/** The server receipt means accepted, not that every original member received it. */
		function useCardGeneration(meetingId, onChanged, onOpen) {
			const scope = (0, react.useRef)(localScopeId()).current, ownerMeeting = (0, react.useRef)(meetingId).current, currentMeeting = (0, react.useRef)(meetingId), alive = (0, react.useRef)(true), { readLocal, writeLocal, meetingCall } = scopedLocal(scope), key = `card-generation-request.${ownerMeeting}`;
			currentMeeting.current = meetingId;
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			const current = () => alive.current && scope === localScopeId() && currentMeeting.current === ownerMeeting;
			const [pending, setPending] = (0, react.useState)(() => readLocal(key, void 0)), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(""), [notice, setNotice] = (0, react.useState)("");
			const guard = (0, react.useRef)(false);
			const finish = async (request) => {
				if (guard.current || !current()) return;
				guard.current = true;
				setBusy(true);
				setError("");
				let outcome = request;
				const remember = (value) => {
					outcome = value;
					if (current()) setPending(value);
					return writeLocal(key, value);
				};
				try {
					if (!outcome.stage) {
						await meetingCall(ownerMeeting, "task-card-generate", outcome);
						remember({
							...outcome,
							stage: "accepted"
						});
					}
					if (!writeLocal(key, void 0)) throw Error("原请求结果已明确，但本地记录未能清理；请保留原请求，仅重试本地清理");
					if (current()) {
						setPending(void 0);
						setNotice(outcome.stage === "rejected" ? "原生成请求明确未提交，现可调整原稿。" : "生成请求已记录；在任务卡列表查看逐成员投递和回应。当前讨论草稿保留，生成与修改不执行工作。");
						if (outcome.stage !== "rejected") {
							onOpen();
							try {
								await onChanged();
							} catch {
								if (current()) setError("生成请求已接受，刷新失败；请刷新查看卡片，勿另发同次请求。");
							}
						}
					}
				} catch (e) {
					const x = e;
					if (x.requestState === "rejected") {
						remember({
							...outcome,
							stage: "rejected"
						});
						if (writeLocal(key, void 0) && current()) setPending(void 0);
					}
					if (current()) setError(x.message + (x.requestState === "rejected" ? "" : "；原请求保留，只核对或重试此请求"));
				} finally {
					guard.current = false;
					if (current()) setBusy(false);
				}
			};
			const begin = (draft) => {
				if (guard.current || pending || !current()) return;
				if (!draft.recipientIds.length) {
					setError("请先在讨论输入区 @ 选择至少一位原成员，再点击任务卡生成；额外正文可以留空。");
					return;
				}
				const request = {
					requestId: crypto.randomUUID(),
					recipientIds: [...draft.recipientIds],
					instruction: draft.instruction,
					messageIds: [...draft.messageIds],
					assetIds: [...draft.assetIds]
				};
				if (!writeLocal(key, request)) {
					setError("本地请求无法保存，尚未发送，请保留当前草稿。");
					return;
				}
				setPending(request);
				finish(request);
			};
			return {
				pending,
				busy,
				error,
				notice,
				begin,
				retry: () => pending && void finish(pending)
			};
		}
		//#endregion
		//#region lib/client/ReleasePanel.js
		const labels = {
			queued: "等待投递",
			offline: "原会话恢复或投递需处理",
			delivering: "正在投递",
			uncertain: "投递待核实",
			delivered: "等待正式结果",
			in_progress: "本会任务执行中",
			completed: "结果已提交",
			failed: "执行失败",
			cancelled: "已结束"
		};
		function ReleasePanel({ meetingId, messages = [], releases = [], paused = false, archived = false, members, workflow, names = {}, memberStatus = {}, assets = [], view = "discussion", focusTask, onChanged, onViewChange, onOpenSession, onJumpMeeting, discussions = [], taskModal = false, onCloseTask, onOpenMember, taskCards = [], taskCardGenerations = [], cardPublications = [] }) {
			const { meetingCall, isCurrent } = useScopedOperations(), guard = (0, react.useRef)(false);
			const [cardsOpen, setCardsOpen] = (0, react.useState)(false), [filter, setFilter] = (0, react.useState)("attention"), [limit, setLimit] = (0, react.useState)(40), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [reference, setReference] = (0, react.useState)(), [publishOpen, setPublishOpen] = (0, react.useState)(false), [supplement, setSupplement] = (0, react.useState)(), [revisionTarget, setRevisionTarget] = (0, react.useState)(), [confirmation, setConfirmation] = (0, react.useState)();
			const generation = useCardGeneration(meetingId, onChanged, () => setCardsOpen(true));
			const activeRun = workflow && workflowSchemaSupported(workflow.schemaVersion) ? workflow.runs.find((r) => r.status === "active") : void 0, revisionTask = releases.flatMap((r) => r.tasks).find((t) => t.taskId === revisionTarget);
			const name = (id) => id === "user" ? "主持人" : id === "secretary" ? "秘书" : members.find((m) => m.id === id)?.name ?? names[id] ?? "已离会成员";
			const run = async (fn) => {
				if (guard.current || !isCurrent()) return;
				guard.current = true;
				setBusy(true);
				setError("");
				try {
					await fn();
				} catch (e) {
					if (isCurrent()) setError(e instanceof Error ? e.message : String(e));
				} finally {
					guard.current = false;
					if (isCurrent()) setBusy(false);
				}
			};
			const call = (action, body) => run(async () => {
				await meetingCall(meetingId, action, body);
				if (isCurrent()) await onChanged();
			});
			const showReference = (id) => {
				const m = messages.find((m) => m.id === id);
				if (m) setReference(m);
				else run(async () => {
					const v = await meetingCall(meetingId, "lookup-message", { id });
					if (isCurrent()) setReference(v.message);
				});
			};
			const visible = [...releases].reverse().filter((r) => filter === "all" || r.status === "draft" || r.tasks.some((t) => taskNeedsAction({ releases }, t)));
			(0, react.useEffect)(() => {
				if (!focusTask) return;
				setFilter("all");
				setLimit(releases.length);
				const timer = setTimeout(() => {
					[...document.querySelectorAll("[data-release-task]")].find((n) => n.getAttribute("data-release-task") === focusTask.id)?.scrollIntoView({ block: "center" });
				}, 60);
				return () => clearTimeout(timer);
			}, [focusTask?.nonce]);
			return (0, react_jsx_runtime.jsxs)("section", {
				"data-meeting-release-panel": "",
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 10,
					fontSize: 13,
					minWidth: 0,
					...view === "discussion" ? {
						flex: 1,
						minHeight: 0
					} : {}
				},
				children: [
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					generation.error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: generation.error
					}),
					generation.notice && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: generation.notice
					}),
					generation.pending && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						children: ["任务卡生成原请求待核实。", (0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							disabled: generation.busy,
							onClick: generation.retry,
							children: "核对并重试原生成请求"
						})]
					}),
					(0, react_jsx_runtime.jsx)(LegacyTaskRecovery, {
						readOnly: archived,
						meetingId,
						onChanged
					}),
					reference && (0, react_jsx_runtime.jsxs)("aside", {
						"aria-label": "引用原文",
						children: [
							(0, react_jsx_runtime.jsx)("b", { children: name(reference.sender) }),
							(0, react_jsx_runtime.jsx)("p", {
								style: { whiteSpace: "pre-wrap" },
								children: reference.text
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => setReference(void 0),
								children: "关闭引用"
							})
						]
					}),
					view === "discussion" && (0, react_jsx_runtime.jsx)(ChatDiscussion, {
						discussions,
						onOpenMember,
						onCreateTask: (d) => {
							if (!archived && !generation.busy) generation.begin(d);
						},
						meetingId,
						messages,
						releases,
						members,
						assets,
						names,
						memberStatus,
						draftRunIds: workflow && workflowSchemaSupported(workflow.schemaVersion) ? workflow.runs.map((r) => r.id) : [],
						run: activeRun,
						paused,
						archived,
						onChanged,
						onNavigate: onViewChange,
						onOpenSession,
						onPrepareTask: () => setError(""),
						onSupplement: (t) => setSupplement({
							taskId: t.taskId,
							sessionId: t.toSessionId,
							nonce: Date.now()
						}),
						onPublish: () => setPublishOpen(true)
					}),
					(publishOpen || supplement) && (0, react_jsx_runtime.jsx)(PublishPanel, {
						open: true,
						onClose: () => {
							setPublishOpen(false);
							setSupplement(void 0);
						},
						meetingId,
						members,
						releases,
						onChanged,
						initialTarget: supplement
					}),
					(0, react_jsx_runtime.jsx)(TaskCardsPanel, {
						readOnly: archived,
						meetingId,
						open: taskModal || cardsOpen,
						onClose: () => {
							setCardsOpen(false);
							onCloseTask?.();
						},
						cards: taskCards,
						generations: taskCardGenerations,
						publications: cardPublications,
						discussions,
						members,
						onChanged,
						onOpenMember
					}),
					view === "tasks" && (0, react_jsx_runtime.jsxs)("div", {
						"aria-label": "工作执行记录",
						children: [
							(0, react_jsx_runtime.jsxs)("div", { children: [
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									onClick: () => setCardsOpen(true),
									children: "查看生成任务卡"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: busy || archived,
									onClick: () => void call("release-pause", { paused: !paused }),
									children: paused ? "恢复投递队列" : "暂停后续投递"
								}),
								(0, react_jsx_runtime.jsxs)("select", {
									"aria-label": "任务筛选",
									value: filter,
									onChange: (e) => setFilter(e.target.value),
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "attention",
										children: "待处理与待验收"
									}), (0, react_jsx_runtime.jsx)("option", {
										value: "all",
										children: "全部任务"
									})]
								})
							] }),
							!visible.length && (0, react_jsx_runtime.jsx)("p", { children: "没有待处理工作。生成任务卡请在讨论区 @原成员。" }),
							visible.slice(0, limit).map((r) => (0, react_jsx_runtime.jsxs)("article", {
								"data-release-id": r.id,
								style: {
									border: "1px solid var(--dsw-alias-border-l2)",
									padding: 10,
									borderRadius: 10,
									marginTop: 8,
									overflowWrap: "anywhere"
								},
								children: [
									(0, react_jsx_runtime.jsxs)("b", { children: [
										r.title ?? r.instruction.slice(0, 55),
										" · ",
										r.status === "draft" ? "旧版本待放行记录" : r.recipientIds.map(name).join("、")
									] }),
									r.status === "draft" && (0, react_jsx_runtime.jsx)("p", { children: "此历史草稿可查看和复制；需要后续工作时，请由原成员生成新卡并核对发布。" }),
									r.tasks.map((t) => (0, react_jsx_runtime.jsxs)("section", {
										"data-release-task": t.taskId,
										style: {
											paddingTop: 8,
											borderTop: "1px solid var(--dsw-alias-border-l2)"
										},
										children: [
											(0, react_jsx_runtime.jsxs)("b", { children: [
												name(t.toSessionId),
												" · ",
												labels[t.status],
												t.status === "completed" ? ` · ${reviewState({ releases }, t)}` : ""
											] }),
											(0, react_jsx_runtime.jsx)(TaskRecovery, { task: t }),
											t.error && (0, react_jsx_runtime.jsx)("p", { children: t.error }),
											t.closedReason && (0, react_jsx_runtime.jsxs)("p", { children: ["结束说明：", t.closedReason] }),
											t.result && (0, react_jsx_runtime.jsxs)("p", {
												style: { whiteSpace: "pre-wrap" },
												children: [t.result.slice(0, 220), t.result.length > 220 ? "…" : ""]
											}),
											t.status === "queued" && memberStatus[t.toSessionId]?.blockers.filter((b) => b.taskId !== t.taskId).map((b) => (0, react_jsx_runtime.jsxs)("p", { children: [
												"等待「",
												b.title,
												"」",
												(0, react_jsx_runtime.jsx)("button", {
													style: uiButton,
													onClick: () => onJumpMeeting?.(b.meetingId),
													children: "查看阻塞会议"
												})
											] }, b.taskId)),
											(0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													gap: 5,
													flexWrap: "wrap"
												},
												children: [
													t.resultMessageId && (0, react_jsx_runtime.jsx)("button", {
														style: uiButton,
														onClick: () => showReference(t.resultMessageId),
														children: "查看结果与来源"
													}),
													[
														"delivered",
														"in_progress",
														"uncertain",
														"failed"
													].includes(t.status) && t.attempts !== 0 && (0, react_jsx_runtime.jsx)("button", {
														style: uiButton,
														disabled: archived,
														onClick: () => setSupplement({
															taskId: t.taskId,
															sessionId: t.toSessionId,
															nonce: Date.now()
														}),
														children: "人工补交"
													}),
													["offline", "uncertain"].includes(t.status) && (0, react_jsx_runtime.jsx)("button", {
														style: uiButton,
														disabled: busy || paused || archived,
														onClick: () => {
															if (t.status === "uncertain") setConfirmation({
																action: "retry-release",
																body: {
																	taskId: t.taskId,
																	allowDuplicate: true
																},
																text: "原消息可能已送达，请核对原窗口后确认；重试可能重复执行。"
															});
															else call("retry-release", { taskId: t.taskId });
														},
														children: "重试投递"
													}),
													!["completed", "cancelled"].includes(t.status) && (0, react_jsx_runtime.jsx)("button", {
														style: uiButton,
														disabled: busy,
														onClick: () => setConfirmation({
															action: "close-task",
															body: {
																taskId: t.taskId,
																confirmed: true
															},
															text: "结束这项会议等待；原窗口工作继续，晚到结果不重新打开本任务。"
														}),
														children: "结束本会等待"
													}),
													(0, react_jsx_runtime.jsx)("button", {
														style: uiButton,
														onClick: () => onOpenSession?.(t.toSessionId),
														children: "打开原窗口"
													}),
													t.status === "completed" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("button", {
														style: uiButton,
														disabled: busy || archived || t.review === "accepted" || !!revisionChild({ releases }, t),
														onClick: () => void call("review-task", {
															taskId: t.taskId,
															review: "accepted"
														}),
														children: "验收通过"
													}), (0, react_jsx_runtime.jsx)("button", {
														style: uiButton,
														disabled: busy || archived || !!revisionChild({ releases }, t),
														onClick: () => void run(async () => {
															await meetingCall(meetingId, "review-task", {
																taskId: t.taskId,
																review: "changes_requested",
																note: t.reviewNote ?? ""
															});
															if (isCurrent()) {
																await onChanged();
																setRevisionTarget(t.taskId);
															}
														}),
														children: "要求修改"
													})] })
												]
											}),
											(0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "投递记录" }), (0, react_jsx_runtime.jsxs)("p", { children: [
												"尝试 ",
												t.attempts,
												" 次 · 更新 ",
												new Date(t.updatedAt).toLocaleString(),
												" · 来源 ",
												t.resultSource?.kind === "manual" ? "人工补交" : t.resultSource?.kind === "agent" ? "Agent提交" : "旧记录未标注"
											] })] })
										]
									}, t.taskId)),
									(0, react_jsx_runtime.jsxs)("details", { children: [
										(0, react_jsx_runtime.jsx)("summary", { children: "要求与输入原文" }),
										(0, react_jsx_runtime.jsx)("pre", {
											style: { whiteSpace: "pre-wrap" },
											children: r.instruction
										}),
										(r.inputs ?? messages.filter((m) => r.messageIds.includes(m.id))).map((m) => (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
											name(m.sender),
											"：",
											m.text.slice(0, 60)
										] }), (0, react_jsx_runtime.jsx)("p", {
											style: { whiteSpace: "pre-wrap" },
											children: m.text
										})] }, m.id))
									] })
								]
							}, r.id)),
							visible.length > limit && (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => setLimit((n) => n + 40),
								children: "显示更多任务"
							})
						]
					}),
					revisionTask && (0, react_jsx_runtime.jsx)(RevisionPanel, {
						meetingId,
						task: revisionTask,
						memberName: name(revisionTask.toSessionId),
						onChanged,
						onClose: () => setRevisionTarget(void 0)
					}, revisionTask.taskId),
					confirmation && (0, react_jsx_runtime.jsxs)("div", {
						role: "alertdialog",
						"aria-label": "确认任务操作",
						children: [
							(0, react_jsx_runtime.jsx)("p", { children: confirmation.text }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => {
									call(confirmation.action, confirmation.body);
									setConfirmation(void 0);
								},
								children: "确认"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => setConfirmation(void 0),
								children: "取消"
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/MeetingFolderPanel.js
		function MeetingFolderPanel({ meetingId, folder, folderError, archived, onChanged }) {
			const { meetingCall, isCurrent } = useScopedOperations(), [snapshot, setSnapshot] = (0, react.useState)(), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [confirm, setConfirm] = (0, react.useState)(false), [query, setQuery] = (0, react.useState)(""), [preview, setPreview] = (0, react.useState)();
			const checkEpoch = (0, react.useRef)(0);
			const check = async () => {
				const epoch = ++checkEpoch.current;
				try {
					const v = await meetingCall(meetingId, "meeting-folder-status");
					if (isCurrent() && epoch === checkEpoch.current) {
						setSnapshot(v.snapshot);
						setError("");
					}
				} catch (e) {
					if (isCurrent() && epoch === checkEpoch.current) setError(e instanceof Error ? e.message : String(e));
				}
			};
			(0, react.useEffect)(() => {
				if (folder) check();
			}, [
				folder?.path,
				folder?.instructionsSha256,
				folder?.instructionsVersion,
				JSON.stringify(folder?.files)
			]);
			const connect = async () => {
				if (busy || archived || !isCurrent()) return;
				setBusy(true);
				setError("");
				try {
					await meetingCall(meetingId, "meeting-folder-connect", { confirmed: true });
					if (isCurrent()) {
						setConfirm(false);
						await onChanged();
						await check();
					}
				} catch (e) {
					if (isCurrent()) setError(e instanceof Error ? e.message : String(e));
				} finally {
					if (isCurrent()) setBusy(false);
				}
			};
			const read = async (ref) => {
				if (busy) return;
				setBusy(true);
				setError("");
				try {
					const { file } = await meetingCall(meetingId, "meeting-file-read", { fileId: ref.fileId });
					if (!isCurrent()) return;
					setPreview({
						name: ref.name,
						referenceOnly: file.referenceOnly,
						text: file.referenceOnly ? "完整原件引用，内容未解析；不自动解压或向模型传入二进制。保存位置：" + ref.relativePath + " · " + ref.size + "字节 · v" + ref.version + " · SHA256 " + ref.sha256 : file.text,
						...!file.referenceOnly && file.data && ref.mimeType?.startsWith("image/") ? { image: `data:${ref.mimeType};base64,${file.data}` } : {}
					});
				} catch (e) {
					if (isCurrent()) setError(e instanceof Error ? e.message : String(e));
				} finally {
					if (isCurrent()) setBusy(false);
				}
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": "本会工作区目录",
				style: {
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 8,
					padding: 10
				},
				children: [
					(0, react_jsx_runtime.jsx)("b", { children: "本会工作区目录" }),
					snapshot?.instructionsText !== void 0 && (0, react_jsx_runtime.jsxs)("details", { children: [
						(0, react_jsx_runtime.jsx)("summary", { children: "当前批准的会议说明" }),
						(0, react_jsx_runtime.jsx)("small", { children: snapshot.instructionsPath }),
						(0, react_jsx_runtime.jsx)("pre", {
							style: {
								whiteSpace: "pre-wrap",
								overflowWrap: "anywhere"
							},
							children: snapshot.instructionsText
						})
					] }),
					folder ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("p", {
							style: { overflowWrap: "anywhere" },
							children: folder.path
						}),
						(0, react_jsx_runtime.jsx)("p", { children: "原成员通过会议只读工具读取已核验版本；秘书使用实际读取的文本快照。任务发布、成果和纪要先写入此目录。" }),
						(0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							disabled: busy,
							onClick: () => void check(),
							children: "核对目录与文件"
						}),
						snapshot && (0, react_jsx_runtime.jsxs)("p", {
							role: "status",
							children: [snapshot.integrity === "ok" ? "已核对当前说明、索引和文件版本" : "目录核验未通过，不能用于新执行", snapshot.errors.length ? `：${snapshot.errors.join("；")}` : ""]
						}),
						(0, react_jsx_runtime.jsx)("input", {
							"aria-label": "搜索会议文件",
							value: query,
							onChange: (e) => setQuery(e.target.value),
							placeholder: "搜索材料、任务卡、成果或纪要"
						}),
						folder.files.filter((f) => `${f.name} ${f.kind} ${f.relativePath}`.toLowerCase().includes(query.toLowerCase())).map((f) => (0, react_jsx_runtime.jsxs)("div", {
							style: { paddingTop: 8 },
							children: [(0, react_jsx_runtime.jsxs)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => void read(f),
								children: [
									f.name,
									" · v",
									f.version
								]
							}), (0, react_jsx_runtime.jsx)("small", {
								style: { marginLeft: 6 },
								children: f.relativePath
							})]
						}, f.fileId))
					] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("p", { children: "本会尚未关联目录。确认后会在原会议工作区建立稳定目录并复制已有材料、任务、成果与纪要，不通知成员执行。" }),
						folderError && (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							children: folderError
						}),
						(0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							disabled: busy || archived,
							onClick: () => setConfirm(true),
							children: "关联本会目录…"
						})
					] }),
					confirm && (0, react_jsx_runtime.jsxs)("div", {
						role: "alertdialog",
						"aria-label": "确认关联会议目录",
						children: [
							(0, react_jsx_runtime.jsx)("p", { children: "保留原会议数据，在本会工作区保存历史版本；不启动任务或模型。" }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => void connect(),
								children: "确认关联并保存历史文件"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => setConfirm(false),
								children: "取消"
							})
						]
					}),
					preview && (0, react_jsx_runtime.jsxs)("div", {
						"aria-label": "会议文件预览",
						children: [
							(0, react_jsx_runtime.jsx)("b", { children: preview.name }),
							preview.image ? (0, react_jsx_runtime.jsx)("img", {
								alt: preview.name,
								src: preview.image,
								style: {
									maxWidth: "100%",
									maxHeight: 360
								}
							}) : (0, react_jsx_runtime.jsx)("pre", {
								style: {
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
									maxHeight: 420,
									overflow: "auto"
								},
								children: preview.text ?? "此版本为二进制文件"
							}),
							preview.text !== void 0 && !preview.referenceOnly && (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => downloadText(preview.name, preview.text),
								children: "保存文本副本"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => setPreview(void 0),
								children: "关闭预览"
							})
						]
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region lib/client/ResourcesPanel.js
		function ResourcesPanel({ meetingId, assets = [], templates = [], folder, folderError, archived = false, onChanged }) {
			const { meetingCall, isCurrent } = useScopedOperations(), scope = (0, react.useRef)(localScopeId()).current;
			const [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(""), [image, setImage] = (0, react.useState)();
			const run = async (fn) => {
				if (busy || !isCurrent()) return;
				setBusy(true);
				setError("");
				try {
					await fn();
				} catch (e) {
					if (isCurrent()) setError(String(e instanceof Error ? e.message : e));
				} finally {
					if (isCurrent()) setBusy(false);
				}
			};
			const read = (a, preview) => run(async () => {
				if (a.referenceOnly || a.contentKind === "file") {
					await downloadMeetingAsset(meetingId, a, scope, isCurrent);
					return;
				}
				const value = (await meetingCall(meetingId, "asset-read", { id: a.id })).asset;
				if (!isCurrent()) return;
				if (preview && a.image) {
					setImage(`data:${a.mimeType};base64,${value.data}`);
					return;
				}
				const data = Uint8Array.from(atob(value.data), (c) => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([data], { type: a.mimeType })), link = document.createElement("a");
				link.href = url;
				link.download = a.name;
				link.click();
				setTimeout(() => URL.revokeObjectURL(url), 1e3);
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 10,
					fontSize: 13
				},
				children: [
					(0, react_jsx_runtime.jsx)(MeetingFolderPanel, {
						meetingId,
						folder,
						folderError,
						archived,
						onChanged
					}, meetingId),
					(0, react_jsx_runtime.jsx)("b", { children: "会议资料与版本" }),
					(0, react_jsx_runtime.jsx)("p", { children: "将图片或文档拖入讨论区加载，这里归档已保存版本。加载不自动唤醒成员。在讨论中明确选择资料可发送给成员，也可用于生成任务卡。支持文本、代码、diff/patch，以及 PNG、JPEG、WebP；直接读取的图片和小文本每份最大2MB，文本最多10万字符；普通文件可保留完整原件引用，最大256MB，未自动解压或解析。" }),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					busy && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: "正在处理资料…"
					}),
					image && (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("img", {
						alt: "会议图片预览",
						src: image,
						style: {
							maxWidth: "100%",
							maxHeight: 360,
							objectFit: "contain"
						}
					}), (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						onClick: () => setImage(void 0),
						children: "关闭图片"
					})] }),
					!assets.length && (0, react_jsx_runtime.jsx)("p", { children: "暂无附件。项目文档可上传 Markdown 或文本，代码改动可上传 diff/patch。" }),
					assets.map((a) => (0, react_jsx_runtime.jsxs)("article", {
						style: {
							border: "1px solid var(--dsw-alias-border-l2)",
							padding: 10,
							borderRadius: 8,
							overflowWrap: "anywhere"
						},
						children: [
							(0, react_jsx_runtime.jsxs)("b", { children: [
								a.name,
								" · v",
								a.version
							] }),
							(0, react_jsx_runtime.jsxs)("p", { children: [
								(a.bytes / 1024).toFixed(1),
								"KB · ",
								new Date(a.createdAt).toLocaleString()
							] }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => {
									read(a, false);
								},
								children: "下载此版本"
							}),
							!!a.image && !a.referenceOnly && (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => {
									read(a, true);
								},
								children: "预览图片"
							}),
							(0, react_jsx_runtime.jsxs)("details", { children: [
								(0, react_jsx_runtime.jsx)("summary", { children: "内容与校验" }),
								(0, react_jsx_runtime.jsxs)("small", { children: ["SHA256 ", a.sha256] }),
								a.referenceOnly && (0, react_jsx_runtime.jsx)("p", { children: "完整原件引用，内容未解析；下载保留此版本完整文件，不自动解压。" }),
								!a.referenceOnly && a.text && (0, react_jsx_runtime.jsx)("pre", {
									style: { whiteSpace: "pre-wrap" },
									children: a.text
								})
							] })
						]
					}, a.id)),
					templates.length > 0 && (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "历史模板名称（只读）" }), templates.map((t) => (0, react_jsx_runtime.jsx)("p", { children: t.title }, t.id))] })
				]
			});
		}
		//#endregion
		//#region lib/workflow-steps.js
		const shortId = (id) => validWorkflowId(id) && id.length <= 64;
		const clone = (value) => structuredClone(value);
		function isStepsDefinition(value) {
			return !!value && typeof value === "object" && !Array.isArray(value) && value.steps?.version === 1;
		}
		function makeStepsDefinition(id, title = "会议进程", limits = DEFAULT_WORKFLOW_LIMITS) {
			if (!shortId(id)) throw Error("步骤流程ID需为1—64位合法ID");
			return {
				id,
				title,
				revision: 1,
				executionPolicy: "per-node-v1",
				steps: {
					version: 1,
					stages: []
				},
				entryId: "",
				nodes: [],
				edges: [],
				parallelGroups: [],
				loops: [],
				limits: clone(limits),
				layoutRevision: 1,
				positions: {}
			};
		}
		function stepsUserNodes(d) {
			if (!isStepsDefinition(d) || !Array.isArray(d.steps.stages) || !Array.isArray(d.nodes)) return [];
			const nodes = new Map(d.nodes.filter((n) => n && !n.stepsInternal).map((n) => [n.id, n]));
			return d.steps.stages.flatMap((stage) => stage.nodeIds.map((id) => nodes.get(id)).filter((n) => !!n));
		}
		function helper(id, kind) {
			return {
				id,
				title: kind === "entry" ? "步骤入口" : "并行步骤结束",
				kind: "join",
				memberIds: [],
				instruction: "",
				inputs: [],
				includeIncoming: true,
				stepsInternal: kind
			};
		}
		/** Rebuild ONLY structural fields. All real step fields and saved coordinates survive unchanged. */
		function compileStepsDefinition(d) {
			if (!isStepsDefinition(d) || !shortId(d.id) || d.executionPolicy !== "per-node-v1" || !Array.isArray(d.steps.stages) || !Array.isArray(d.nodes)) throw Error("步骤编排格式或流程ID非法");
			if (Object.keys(d.steps).some((k) => !["version", "stages"].includes(k))) throw Error("步骤编排字段未知");
			const next = clone(d), users = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set(), stageIds = /* @__PURE__ */ new Set();
			for (const n of d.nodes) {
				if (!n || !validWorkflowId(n.id)) throw Error("步骤ID非法");
				if (n.stepsInternal !== void 0) continue;
				if (n.kind !== "work" || users.has(n.id)) throw Error("步骤类型非法或ID重复");
				users.set(n.id, n);
			}
			const nodes = [], edges = [], groups = [];
			let predecessor = d.steps.stages.length ? `steps-entry-${d.id}` : "";
			if (predecessor) {
				if (users.has(predecessor)) throw Error("步骤ID与内部入口冲突");
				nodes.push(helper(predecessor, "entry"));
			}
			for (const stage of d.steps.stages) {
				if (!stage || !shortId(stage.id) || stageIds.has(stage.id) || !Array.isArray(stage.nodeIds) || !stage.nodeIds.length || Object.keys(stage).some((k) => !["id", "nodeIds"].includes(k))) throw Error("阶段ID需唯一且不超过64位，每个阶段至少一个步骤");
				stageIds.add(stage.id);
				for (const [index, id] of stage.nodeIds.entries()) {
					if (!validWorkflowId(id) || seen.has(id) || !users.has(id)) throw Error("阶段步骤缺失、重复或ID非法");
					seen.add(id);
					nodes.push(clone(users.get(id)));
					edges.push({
						id: `steps-edge-${stage.id}-${index}`,
						from: predecessor,
						to: id,
						kind: "flow"
					});
				}
				if (stage.nodeIds.length > 1) {
					const joinId = `steps-join-${stage.id}`;
					if (users.has(joinId) || nodes.some((n) => n.id === joinId)) throw Error("步骤ID与内部汇合冲突");
					nodes.push(helper(joinId, "join"));
					stage.nodeIds.forEach((id, index) => edges.push({
						id: `steps-merge-${stage.id}-${index}`,
						from: id,
						to: joinId,
						kind: "flow"
					}));
					groups.push({
						id: `steps-group-${stage.id}`,
						sourceId: predecessor,
						branchIds: [...stage.nodeIds],
						joinId
					});
					predecessor = joinId;
				} else predecessor = stage.nodeIds[0];
			}
			if (seen.size !== users.size) throw Error("存在未归入用户阶段的步骤");
			if (nodes.length > 200 || edges.length > 600) throw Error("步骤编排超过节点或连线限额");
			next.entryId = d.steps.stages.length ? `steps-entry-${d.id}` : "";
			next.nodes = nodes;
			next.edges = edges;
			next.parallelGroups = groups;
			next.loops = [];
			const ids = new Set(nodes.map((n) => n.id));
			next.positions = Object.fromEntries(Object.entries(d.positions ?? {}).filter(([id]) => ids.has(id)));
			return next;
		}
		function editable(d, run, structural = false) {
			if (!isStepsDefinition(d)) throw Error("当前流程不是自由步骤编排；请先明确创建新的步骤草稿");
			if (structural && run?.status === "active") throw Error("运行中的流程结构已冻结，请先结束本轮后调整");
			return clone(d);
		}
		function newNode(id) {
			if (!validWorkflowId(id)) throw Error("步骤ID非法");
			return {
				id,
				title: "",
				kind: "work",
				memberIds: [],
				instruction: "",
				inputs: [],
				includeIncoming: true,
				autoReceiveAndRun: false
			};
		}
		function unusedNode(d, id) {
			if (d.nodes.some((n) => n.id === id)) throw Error("步骤ID重复或与内部节点冲突");
		}
		function appendStepsNode(d, nodeId, stageId, afterStageId, run) {
			const next = editable(d, run, true);
			unusedNode(next, nodeId);
			if (!shortId(stageId) || next.steps.stages.some((s) => s.id === stageId)) throw Error("阶段ID重复或超过64位");
			let index = next.steps.stages.length;
			if (afterStageId !== void 0) {
				const after = next.steps.stages.findIndex((s) => s.id === afterStageId);
				if (after < 0) throw Error("指定阶段不存在");
				index = after + 1;
			}
			next.nodes.push(newNode(nodeId));
			next.steps.stages.splice(index, 0, {
				id: stageId,
				nodeIds: [nodeId]
			});
			return compileStepsDefinition(next);
		}
		function addStepsParallel(d, targetNodeId, nodeId, stageId, run) {
			const next = editable(d, run, true), stage = next.steps.stages.find((s) => s.nodeIds.includes(targetNodeId));
			unusedNode(next, nodeId);
			if (!stage || stage.id !== stageId) throw Error("目标步骤或并行阶段位置已变化");
			stage.nodeIds.push(nodeId);
			next.nodes.push(newNode(nodeId));
			return compileStepsDefinition(next);
		}
		function removeStepsNode(d, nodeId, run) {
			const next = editable(d, run, true);
			if (!next.steps.stages.some((s) => s.nodeIds.includes(nodeId))) throw Error("步骤不存在");
			next.steps.stages = next.steps.stages.map((s) => ({
				...s,
				nodeIds: s.nodeIds.filter((id) => id !== nodeId)
			})).filter((s) => s.nodeIds.length);
			next.nodes = next.nodes.filter((n) => n.id !== nodeId).map((n) => ({
				...n,
				inputs: n.inputs.filter((b) => b.kind !== "node" || b.nodeId !== nodeId)
			}));
			return compileStepsDefinition(next);
		}
		function moveStepsStage(d, stageId, direction, run) {
			const next = editable(d, run, true), index = next.steps.stages.findIndex((s) => s.id === stageId);
			if (index < 0 || !["up", "down"].includes(direction)) throw Error("所选阶段或移动方向非法");
			const target = index + (direction === "up" ? -1 : 1);
			if (target >= 0 && target < next.steps.stages.length) {
				const [stage] = next.steps.stages.splice(index, 1);
				next.steps.stages.splice(target, 0, stage);
			}
			return compileStepsDefinition(next);
		}
		function patchStepsNode(d, nodeId, patch, run) {
			const next = editable(d, run), node = next.nodes.find((n) => n.id === nodeId && !n.stepsInternal);
			if (!node || !next.steps.stages.some((s) => s.nodeIds.includes(nodeId))) throw Error("步骤不存在");
			const allowed = /* @__PURE__ */ new Set([
				"title",
				"memberIds",
				"instruction",
				"inputs",
				"includeIncoming",
				"requireReview",
				"confirmation",
				"autoReceiveAndRun",
				"cardBinding"
			]);
			if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((k) => !allowed.has(k))) throw Error("不能修改步骤ID、类型或内部字段");
			if (patch.includeIncoming !== void 0 && patch.includeIncoming !== true) throw Error("步骤必须接收实际上游信息");
			if (Object.entries(patch).some(([key, value]) => JSON.stringify(node[key]) !== JSON.stringify(value)) && run?.status === "active" && run.activations.some((a) => !a.temporary && a.nodeId === nodeId)) throw Error("已开始的环节字段已冻结");
			Object.assign(node, clone(patch));
			return compileStepsDefinition(next);
		}
		//#endregion
		//#region lib/client/MaterialPicker.js
		const materialAssetIds = (messages, value) => [.../* @__PURE__ */ new Set([...value.assetIds, ...messages.filter((m) => value.messageIds.includes(m.id)).flatMap((m) => m.assetIds ?? [])])];
		/** Transactional selection: only Confirm changes the caller's draft. No delivery or private history reads. */
		function MaterialPicker({ messages, assets, value, names = {}, onApply, onCancel }) {
			const [selected, setSelected] = (0, react.useState)(() => ({
				messageIds: [...new Set(value.messageIds)],
				assetIds: [...new Set(value.assetIds)]
			})), [category, setCategory] = (0, react.useState)("all"), [query, setQuery] = (0, react.useState)("");
			const publicMessages = messages.filter((m) => !m.previewOnly), q = query.trim().toLowerCase(), files = materialAssetIds(publicMessages, selected);
			const list = publicMessages.filter((m) => (category === "all" || category === "result" ? category === "all" || m.kind === "result" : category === "message" && m.kind !== "result") && (!q || `${names[m.sender] ?? m.sender} ${m.text}`.toLowerCase().includes(q)));
			const toggle = (key, id) => setSelected((s) => ({
				...s,
				[key]: s[key].includes(id) ? s[key].filter((v) => v !== id) : [...s[key], id]
			}));
			return (0, react_jsx_runtime.jsxs)("section", {
				role: "region",
				"aria-label": "选择任务资料",
				style: {
					padding: 12,
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 10,
					display: "flex",
					flexDirection: "column",
					gap: 9,
					minWidth: 0
				},
				children: [
					(0, react_jsx_runtime.jsx)("strong", { children: "选择本次实际输入" }),
					(0, react_jsx_runtime.jsx)("p", {
						style: { margin: 0 },
						children: "只使用正式会议消息、明确的文件版本和已发布结果。确认选择只更新草稿，不投递。"
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6,
							flexWrap: "wrap"
						},
						children: [(0, react_jsx_runtime.jsxs)("select", {
							"aria-label": "资料类型",
							style: uiButton,
							value: category,
							onChange: (e) => setCategory(e.target.value),
							children: [
								(0, react_jsx_runtime.jsx)("option", {
									value: "all",
									children: "全部资料"
								}),
								(0, react_jsx_runtime.jsx)("option", {
									value: "message",
									children: "会议消息"
								}),
								(0, react_jsx_runtime.jsx)("option", {
									value: "asset",
									children: "文件版本"
								}),
								(0, react_jsx_runtime.jsx)("option", {
									value: "result",
									children: "历史结果"
								})
							]
						}), (0, react_jsx_runtime.jsx)("input", {
							"aria-label": "搜索会议资料",
							style: {
								...uiInput,
								flex: 1,
								minWidth: 140
							},
							placeholder: "搜索内容、成员或文件名",
							value: query,
							onChange: (e) => setQuery(e.target.value)
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							maxHeight: 340,
							overflow: "auto",
							overflowWrap: "anywhere"
						},
						children: [
							list.map((m) => (0, react_jsx_runtime.jsxs)("div", {
								style: {
									padding: "6px 0",
									borderBottom: "1px solid var(--dsw-alias-border-l2)"
								},
								children: [(0, react_jsx_runtime.jsxs)("label", { children: [
									(0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										"data-material-message": m.id,
										checked: selected.messageIds.includes(m.id),
										onChange: () => toggle("messageIds", m.id)
									}),
									m.kind === "result" ? "结果" : "消息",
									" · ",
									names[m.sender] ?? (m.sender === "user" ? "主持人" : m.sender),
									"：",
									m.text.slice(0, 80)
								] }), (0, react_jsx_runtime.jsxs)("details", { children: [
									(0, react_jsx_runtime.jsx)("summary", { children: "预览原文" }),
									(0, react_jsx_runtime.jsx)("p", {
										style: { whiteSpace: "pre-wrap" },
										children: m.text
									}),
									m.assetIds?.map((id) => (0, react_jsx_runtime.jsxs)("small", { children: [
										assets.find((a) => a.id === id)?.name ?? "缺失附件",
										" · v",
										assets.find((a) => a.id === id)?.version,
										" "
									] }, id))
								] })]
							}, m.id)),
							(category === "all" || category === "asset") && assets.filter((a) => !q || `${a.name} ${a.text ?? ""}`.toLowerCase().includes(q)).map((a) => {
								const inherited = publicMessages.some((m) => selected.messageIds.includes(m.id) && m.assetIds?.includes(a.id));
								return (0, react_jsx_runtime.jsxs)("div", {
									style: { padding: "6px 0" },
									children: [(0, react_jsx_runtime.jsxs)("label", { children: [
										(0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											"data-material-asset": a.id,
											checked: files.includes(a.id),
											disabled: inherited && !selected.assetIds.includes(a.id),
											onChange: () => toggle("assetIds", a.id)
										}),
										a.name,
										" · v",
										a.version,
										inherited ? "（随所选消息；取消该消息后可移除）" : ""
									] }), (0, react_jsx_runtime.jsxs)("details", { children: [
										(0, react_jsx_runtime.jsx)("summary", { children: "预览此版本" }),
										(0, react_jsx_runtime.jsx)("p", {
											style: { whiteSpace: "pre-wrap" },
											children: a.text ?? "图片原件；投递前会核对成员模型能力。"
										}),
										(0, react_jsx_runtime.jsxs)("small", { children: ["SHA256 ", a.sha256] })
									] })]
								}, a.id);
							}),
							!list.length && (category !== "asset" && category !== "all" || !assets.some((a) => !q || a.name.toLowerCase().includes(q))) && (0, react_jsx_runtime.jsx)("p", { children: "没有匹配的资料。" })
						]
					}),
					(0, react_jsx_runtime.jsxs)("p", {
						style: { margin: 0 },
						children: [
							"本次已选 ",
							selected.messageIds.length,
							" 条消息／结果、",
							files.length,
							" 份附件；不会自动使用其他版本。"
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6,
							flexWrap: "wrap"
						},
						children: [(0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							onClick: () => onApply({
								messageIds: [...new Set(selected.messageIds)],
								assetIds: [...new Set(selected.assetIds)]
							}),
							children: "确认选择资料"
						}), (0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							onClick: onCancel,
							children: "取消选资料"
						})]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/WorkflowSteps.js
		const statusLabels = {
			not_started: "未开始",
			not_walked: "未走此路径",
			waiting_inputs: "等待输入",
			ready: "可开始",
			waiting_decision: "待你决定",
			queued: "等待投递",
			offline: "原窗口未连接",
			delivering: "正在投递",
			uncertain: "投递待核实",
			in_progress: "处理中",
			waiting_review: "待验收",
			changes_requested: "待修改",
			submitted: "已提交",
			failed: "执行失败",
			ended: "已结束",
			skipped: "已跳过",
			limit: "达到上限"
		};
		const active = (run) => run?.status === "active";
		const started = (run, nodeId) => !!active(run) && !!run?.activations.some((a) => a.nodeId === nodeId && !a.temporary);
		/** Edit the user's step IDs, never infer intent, send messages, or migrate an old graph. */
		function WorkflowSteps(props) {
			const { definition, members, run, views = [], selected, busy = false, readOnly = false, messages = [], assets = [], onSelect, onPrepareEmpty, onShowGraph, onOpenMembers, renderExecution } = props;
			const steps = isStepsDefinition(definition), nodes = steps ? stepsUserNodes(definition) : definition.nodes.filter((n) => !n.stepsInternal);
			const [collapsed, setCollapsed] = (0, react.useState)(false), [materials, setMaterials] = (0, react.useState)(), [error, setError] = (0, react.useState)("");
			const host = (0, react.useRef)(null), pendingFocus = (0, react.useRef)(), latest = (0, react.useRef)(props), materialOwner = (0, react.useRef)();
			latest.current = props;
			const key = JSON.stringify([
				definition.id,
				readOnly,
				run?.id,
				run?.status,
				steps
			]), owner = (0, react.useRef)({
				key,
				epoch: 0,
				alive: true
			});
			if (owner.current.key !== key) owner.current = {
				...owner.current,
				key,
				epoch: owner.current.epoch + 1
			};
			const captured = {
				key: owner.current.key,
				epoch: owner.current.epoch
			};
			const valid = () => owner.current.alive && owner.current.key === captured.key && owner.current.epoch === captured.epoch;
			const writable = () => valid() && !latest.current.busy && !latest.current.readOnly && isStepsDefinition(latest.current.definition);
			(0, react.useEffect)(() => {
				owner.current.alive = true;
				return () => {
					owner.current.alive = false;
					owner.current.epoch++;
				};
			}, []);
			const setPicker = (next) => {
				materialOwner.current = next;
				setMaterials(next);
			};
			(0, react.useEffect)(() => {
				setCollapsed(false);
				setPicker(void 0);
				setError("");
			}, [selected, key]);
			(0, react.useEffect)(() => {
				const id = pendingFocus.current;
				if (!id || !nodes.some((n) => n.id === id)) return;
				const field = host.current?.querySelector(`[data-steps-title="${id}"]`);
				if (field) {
					field.focus();
					pendingFocus.current = void 0;
				}
			}, [definition, selected]);
			const mutate = (change, structure = false, nodeId) => {
				if (!writable() || structure && active(latest.current.run) || nodeId && (!latest.current.definition.nodes.some((n) => n.id === nodeId && !n.stepsInternal) || started(latest.current.run, nodeId))) return;
				setError("");
				latest.current.onEdit((current) => {
					if (!writable() || current.id !== definition.id || !isStepsDefinition(current) || structure && active(latest.current.run) || nodeId && (!current.nodes.some((n) => n.id === nodeId && !n.stepsInternal) || started(latest.current.run, nodeId))) return current;
					try {
						return change(current, latest.current.run);
					} catch (e) {
						const message = e instanceof Error ? e.message : String(e);
						Promise.resolve().then(() => {
							if (valid()) setError(message);
						});
						return current;
					}
				});
			};
			const patch = (nodeId, fields) => mutate((d, r) => {
				if (d.nodes.find((n) => n.id === nodeId)?.cardBinding && ("instruction" in fields || "inputs" in fields)) return d;
				return patchStepsNode(d, nodeId, fields, r);
			}, false, nodeId);
			const add = (afterStageId) => {
				if (!writable() || active(latest.current.run) || afterStageId && !latest.current.definition.steps?.stages.some((s) => s.id === afterStageId)) return;
				const nodeId = crypto.randomUUID(), stageId = crypto.randomUUID();
				pendingFocus.current = nodeId;
				setCollapsed(false);
				mutate((d, r) => appendStepsNode(d, nodeId, stageId, afterStageId, r), true);
				if (valid()) onSelect(nodeId);
			};
			const parallel = (nodeId, stageId) => {
				if (!writable() || active(latest.current.run) || !latest.current.definition.steps?.stages.some((s) => s.id === stageId && s.nodeIds.includes(nodeId))) return;
				const newId = crypto.randomUUID();
				pendingFocus.current = newId;
				setCollapsed(false);
				mutate((d, r) => addStepsParallel(d, nodeId, newId, stageId, r), true);
				if (valid()) onSelect(newId);
			};
			const remove = (nodeId) => {
				if (!writable() || active(latest.current.run) || !latest.current.definition.steps?.stages.some((s) => s.nodeIds.includes(nodeId))) return;
				mutate((d, r) => removeStepsNode(d, nodeId, r), true, nodeId);
				if (valid() && latest.current.selected === nodeId) onSelect("");
				if (valid() && materialOwner.current?.nodeId === nodeId) setPicker(void 0);
			};
			const expand = (nodeId) => {
				if (!valid()) return;
				setCollapsed(selected === nodeId ? !collapsed : false);
				setPicker(void 0);
				onSelect(nodeId);
			};
			const select = (nodeId) => {
				if (!valid()) return;
				if (selected !== nodeId) setCollapsed(false);
				onSelect(nodeId);
			};
			const lockedStructure = readOnly || busy || active(run) || !steps;
			const row = (node, position, stageId) => {
				const open = selected === node.id && !collapsed, locked = readOnly || busy || !steps || started(run, node.id), inputLocked = locked || !!node.cardBinding, memberId = node.memberIds[0] ?? "", missingMember = memberId && !members.some((m) => m.id === memberId), view = views.find((v) => v.nodeId === node.id);
				const picker = materials?.nodeId === node.id && materials.key === key && materials.epoch === owner.current.epoch && open && !inputLocked;
				return (0, react_jsx_runtime.jsxs)("section", {
					className: "rt-steps-card",
					"data-workflow-step": node.id,
					"data-selected": open ? "true" : "false",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: "rt-steps-head",
							children: [
								(0, react_jsx_runtime.jsx)("input", {
									"data-steps-title": node.id,
									"aria-label": `环节名称 ${position}`,
									className: "rt-steps-title",
									style: {
										...uiInput,
										width: "auto",
										minWidth: 90,
										padding: "5px 1px",
										background: "transparent",
										borderColor: "transparent",
										fontWeight: 500
									},
									placeholder: "点击命名",
									value: node.title,
									disabled: locked,
									onFocus: () => select(node.id),
									onChange: (e) => patch(node.id, { title: e.target.value }),
									onKeyDown: (e) => {
										if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
											e.preventDefault();
											e.currentTarget.blur();
										}
									}
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: "rt-steps-status",
									children: statusLabels[view?.status ?? "not_started"] ?? view?.status
								}),
								steps && (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: uiButton,
									className: "rt-steps-link",
									"data-steps-action": "parallel",
									"data-node-id": node.id,
									disabled: lockedStructure,
									onClick: () => parallel(node.id, stageId),
									children: "设置并行"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: uiButton,
									className: "rt-steps-link",
									"data-steps-action": "expand",
									"data-node-id": node.id,
									"aria-expanded": open,
									onClick: () => expand(node.id),
									children: open ? "收起 ▴" : "展开 ▾"
								}),
								steps && (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: uiButton,
									className: "rt-steps-link rt-steps-delete",
									"data-steps-action": "delete",
									"data-node-id": node.id,
									"aria-label": `删除环节 ${position}`,
									title: readOnly ? "当前记录只读" : active(run) ? "本轮已开始，结束本轮后可调整环节" : busy ? "正在处理，请稍候" : "删除此环节；保存后更新会议配置",
									disabled: lockedStructure,
									onClick: () => remove(node.id),
									children: "删除"
								})
							]
						}),
						node.kind === "work" ? (0, react_jsx_runtime.jsxs)("label", {
							className: "rt-steps-assignment",
							children: [(0, react_jsx_runtime.jsx)("span", { children: "成员Agent" }), (0, react_jsx_runtime.jsxs)("select", {
								style: uiInput,
								"data-steps-assignee": node.id,
								"aria-label": `成员Agent ${position}`,
								value: memberId,
								disabled: locked,
								onChange: (e) => patch(node.id, { memberIds: e.target.value ? [e.target.value] : [] }),
								children: [
									(0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "请选择成员Agent"
									}),
									missingMember && (0, react_jsx_runtime.jsxs)("option", {
										value: memberId,
										disabled: true,
										children: ["原成员已不可用 · ", memberId]
									}),
									members.map((m) => (0, react_jsx_runtime.jsx)("option", {
										value: m.id,
										children: m.name
									}, m.id))
								]
							})]
						}) : (0, react_jsx_runtime.jsx)("p", {
							className: "rt-steps-type",
							children: node.kind === "minutes" ? "秘书整理" : node.decision ? "汇合／人工选择" : "汇合"
						}),
						!steps && node.memberIds.length > 1 && (0, react_jsx_runtime.jsxs)("p", {
							className: "rt-steps-type",
							children: ["原流程指派：", node.memberIds.map((id) => members.find((m) => m.id === id)?.name ?? `${id}（原成员已不可用）`).join("、")]
						}),
						steps && (0, react_jsx_runtime.jsxs)("label", {
							className: "rt-steps-auto",
							children: [(0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								"data-steps-auto": node.id,
								"aria-label": `自动接收上游信息并运行 ${position}`,
								checked: node.autoReceiveAndRun === true,
								disabled: locked,
								onChange: (e) => patch(node.id, { autoReceiveAndRun: e.target.checked })
							}), (0, react_jsx_runtime.jsx)("span", { children: "自动接收上游信息并运行" })]
						}),
						open && (0, react_jsx_runtime.jsxs)("div", {
							className: "rt-steps-detail",
							children: [
								locked && (0, react_jsx_runtime.jsx)("p", {
									className: "rt-steps-note",
									children: !steps ? "原流程保持原有结构，切换为空白编排后可自行安排。" : readOnly ? "当前记录只读。" : started(run, node.id) ? "此环节已开始，成员、要求和输入已冻结。" : "正在保存，请稍候。"
								}),
								node.cardBinding && (0, react_jsx_runtime.jsxs)("p", {
									className: "rt-steps-note",
									children: [
										"已绑定任务卡 v",
										node.cardBinding.version,
										"，要求与资料来自已发布文件。解除绑定后可修改要求与资料。"
									]
								}),
								(0, react_jsx_runtime.jsxs)("label", {
									className: "rt-steps-field",
									children: [(0, react_jsx_runtime.jsx)("span", { children: "本环节要求" }), (0, react_jsx_runtime.jsx)("textarea", {
										rows: 3,
										style: uiInput,
										"data-steps-instruction": node.id,
										"aria-label": `本环节要求 ${position}`,
										placeholder: "填写这个环节需要完成的工作…",
										value: node.instruction,
										disabled: inputLocked,
										onChange: (e) => patch(node.id, { instruction: e.target.value })
									})]
								}),
								!!node.inputs.length && (0, react_jsx_runtime.jsxs)("p", {
									className: "rt-steps-note",
									children: [
										"已选 ",
										node.inputs.filter((i) => i.kind === "message").length,
										" 条消息、",
										node.inputs.filter((i) => i.kind === "asset").length,
										" 份附件",
										node.inputs.some((i) => i.kind === "node" || i.kind === "activation") ? "；保留明确选择的节点／执行记录" : "",
										"。"
									]
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: "rt-steps-detail-tools",
									children: steps && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: uiButton,
										"data-steps-action": "materials",
										"data-node-id": node.id,
										disabled: inputLocked,
										onClick: () => {
											if (writable() && !started(latest.current.run, node.id) && !latest.current.definition.nodes.find((n) => n.id === node.id)?.cardBinding) setPicker({
												nodeId: node.id,
												key,
												epoch: owner.current.epoch
											});
										},
										children: "选择会议资料"
									})
								}),
								picker && (0, react_jsx_runtime.jsx)(MaterialPicker, {
									messages,
									assets,
									names: Object.fromEntries(members.map((m) => [m.id, m.name])),
									value: {
										messageIds: node.inputs.filter((i) => i.kind === "message").map((i) => i.id),
										assetIds: node.inputs.filter((i) => i.kind === "asset").map((i) => i.id)
									},
									onApply: (value) => {
										if (!writable() || materialOwner.current !== materials || latest.current.selected !== node.id || owner.current.epoch !== materials.epoch || started(latest.current.run, node.id)) return;
										mutate((d, r) => {
											const n = d.nodes.find((n) => n.id === node.id);
											if (!n || n.cardBinding) return d;
											return patchStepsNode(d, node.id, { inputs: [
												...n.inputs.filter((i) => i.kind !== "message" && i.kind !== "asset"),
												...value.messageIds.map((id) => ({
													kind: "message",
													id
												})),
												...value.assetIds.map((id) => ({
													kind: "asset",
													id
												}))
											] }, r);
										}, false, node.id);
										setPicker(void 0);
									},
									onCancel: () => {
										if (valid() && materialOwner.current === materials && latest.current.selected === node.id) setPicker(void 0);
									}
								}, `${key}:${node.id}:${materials.epoch}`),
								renderExecution?.(node.id)
							]
						})
					]
				}, node.id);
			};
			const stages = steps ? definition.steps.stages : nodes.map((n) => ({
				id: n.id,
				nodeIds: [n.id]
			}));
			return (0, react_jsx_runtime.jsxs)("section", {
				ref: host,
				className: "rt-workflow-steps",
				"aria-label": "会议步骤列表",
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: workflowStepsStyles }),
					!steps && (0, react_jsx_runtime.jsxs)("div", {
						className: "rt-steps-legacy",
						role: "status",
						children: [(0, react_jsx_runtime.jsx)("p", { children: "这是原有流程，按实际节点只读显示，尚未转换为空白步骤编排。" }), (0, react_jsx_runtime.jsxs)("div", {
							className: "rt-steps-actions",
							children: [onPrepareEmpty && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: uiButton,
								"data-steps-action": "prepare-empty",
								disabled: readOnly || busy || active(run),
								onClick: () => {
									if (valid() && !latest.current.readOnly && !latest.current.busy && !active(latest.current.run)) onPrepareEmpty();
								},
								children: "新建空白步骤编排"
							}), onShowGraph && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: uiButton,
								"data-steps-action": "graph",
								onClick: onShowGraph,
								children: "查看原流程图"
							})]
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "rt-steps-list-head",
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("strong", { children: "会议环节" }), (0, react_jsx_runtime.jsxs)("small", { children: [
							nodes.length,
							"个环节",
							stages.some((s) => s.nodeIds.length > 1) ? ` · ${stages.filter((s) => s.nodeIds.length > 1).length}组并行` : ""
						] })] }), steps && (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: uiButton,
							"data-steps-action": "add",
							disabled: lockedStructure,
							onClick: () => add(),
							children: "＋ 添加环节"
						})]
					}),
					steps && !nodes.length && (0, react_jsx_runtime.jsxs)("div", {
						className: "rt-steps-empty",
						children: [
							(0, react_jsx_runtime.jsx)("strong", { children: "从空白开始编排" }),
							(0, react_jsx_runtime.jsx)("p", { children: "点击“添加环节”，自己命名并指定成员Agent。" }),
							(0, react_jsx_runtime.jsx)("p", { children: "需要并行时，在对应环节旁设置。" })
						]
					}),
					active(run) && steps && (0, react_jsx_runtime.jsx)("p", {
						className: "rt-steps-note",
						children: "本轮已开始，环节顺序与并行结构保持冻结。尚未开始的环节可更新成员、要求和自动运行选择。"
					}),
					stages.map((stage, index) => {
						const group = stage.nodeIds.length > 1, stageNodes = stage.nodeIds.map((id) => nodes.find((n) => n.id === id)).filter((n) => !!n), assigned = stageNodes.flatMap((n) => n.memberIds), same = assigned.length !== new Set(assigned).size;
						return (0, react_jsx_runtime.jsxs)("section", {
							className: "rt-steps-stage",
							"data-steps-stage": stage.id,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "rt-steps-index",
								children: index + 1
							}), (0, react_jsx_runtime.jsxs)("div", {
								className: "rt-steps-stage-body",
								children: [
									group && (0, react_jsx_runtime.jsxs)("div", {
										className: "rt-steps-group-head",
										children: [(0, react_jsx_runtime.jsx)("strong", { children: "并行组" }), (0, react_jsx_runtime.jsxs)("p", { children: [
											stageNodes.length,
											"项无先后依赖，全部完成后继续",
											same ? "；同一Agent的多项工作可能按序处理" : ""
										] })]
									}),
									(0, react_jsx_runtime.jsx)("div", {
										className: group ? "rt-steps-group-items" : "",
										children: stageNodes.map((n, i) => row(n, group ? `${index + 1}.${i + 1}` : String(index + 1), stage.id))
									}),
									steps && (0, react_jsx_runtime.jsxs)("div", {
										className: "rt-steps-stage-tools",
										children: [
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												style: uiButton,
												"aria-label": `上移第${index + 1}阶段`,
												"data-steps-action": "up",
												"data-stage-id": stage.id,
												disabled: lockedStructure || index === 0,
												onClick: () => mutate((d, r) => moveStepsStage(d, stage.id, "up", r), true),
												children: "↑"
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												style: uiButton,
												"aria-label": `下移第${index + 1}阶段`,
												"data-steps-action": "down",
												"data-stage-id": stage.id,
												disabled: lockedStructure || index === stages.length - 1,
												onClick: () => mutate((d, r) => moveStepsStage(d, stage.id, "down", r), true),
												children: "↓"
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												style: uiButton,
												className: "rt-steps-link",
												"data-steps-action": "insert",
												"data-stage-id": stage.id,
												disabled: lockedStructure,
												onClick: () => add(stage.id),
												children: "＋ 后续环节"
											})
										]
									})
								]
							})]
						}, stage.id);
					}),
					!members.length && steps && (0, react_jsx_runtime.jsxs)("p", {
						className: "rt-steps-note",
						children: ["本会还没有可选成员。", onOpenMembers && (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: uiButton,
							onClick: onOpenMembers,
							children: "查看会议成员"
						})]
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					steps && (0, react_jsx_runtime.jsx)("p", {
						className: "rt-steps-bottom",
						children: "名称直接点击修改。成员Agent在每行选择，自动运行默认关闭。"
					})
				]
			});
		}
		const workflowStepsStyles = `
.rt-workflow-steps{min-width:0;max-width:100%;font-size:13px;line-height:1.5;container:workflow-steps/inline-size;color:inherit}
.rt-workflow-steps *{box-sizing:border-box}.rt-workflow-steps p{margin:0}.rt-workflow-steps button,.rt-workflow-steps input,.rt-workflow-steps select,.rt-workflow-steps textarea{font:inherit;max-width:100%}.rt-workflow-steps button{min-height:30px}.rt-workflow-steps button:disabled,.rt-workflow-steps input:disabled,.rt-workflow-steps select:disabled,.rt-workflow-steps textarea:disabled{cursor:default;opacity:.6}
.rt-workflow-steps :is(button,input,select,textarea):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.rt-steps-list-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.rt-steps-list-head small{display:block;font-size:12px;color:var(--dsw-alias-label-secondary)}
.rt-steps-empty{padding:26px 12px;text-align:center;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px}.rt-steps-empty p{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:7px}.rt-steps-stage{display:grid;grid-template-columns:26px minmax(0,1fr);gap:8px;margin-top:12px}.rt-steps-index{width:26px;height:26px;margin-top:10px;display:grid;place-items:center;background:var(--dsw-alias-interactive-bg-hover);border-radius:50%;color:var(--dsw-alias-label-secondary);font-size:12px}.rt-steps-stage-body{min-width:0}.rt-steps-card{min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base)}.rt-steps-card[data-selected=true]{border-color:var(--dsw-alias-state-business-primary)}
.rt-steps-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 10px}.rt-workflow-steps input.rt-steps-title{width:auto;flex:1 1 145px;min-width:90px;padding:5px 1px;background:transparent;border-color:transparent;font-weight:500}.rt-workflow-steps input.rt-steps-title:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)!important}.rt-workflow-steps input.rt-steps-title::placeholder{color:var(--dsw-alias-label-secondary)}.rt-steps-status{font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);padding:3px 6px;border-radius:4px;white-space:nowrap}.rt-workflow-steps button.rt-steps-link{border-color:transparent!important;background:transparent!important;color:var(--dsw-alias-state-business-primary)!important;padding:4px 6px!important}
.rt-workflow-steps button.rt-steps-delete{color:var(--dsw-alias-state-error-primary,#b42318)!important}
.rt-steps-assignment{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;padding:0 11px 10px;font-size:12px}.rt-steps-assignment select{width:100%;min-width:0;max-width:360px}.rt-steps-type{padding:0 11px 10px;font-size:12px}.rt-steps-auto{display:flex;align-items:center;gap:7px;padding:0 11px 11px;font-size:12px}.rt-steps-auto input{flex:0 0 15px;width:15px;height:15px;margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.rt-steps-detail{padding:12px;border-top:1px solid var(--dsw-alias-border-l2);border-radius:0 0 8px 8px;background:var(--dsw-alias-interactive-bg-hover);display:grid;gap:9px;min-width:0}.rt-steps-field{display:grid;gap:5px;font-size:12px;min-width:0}.rt-steps-field textarea{min-width:0;min-height:85px;resize:vertical}.rt-steps-note{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.rt-steps-detail-tools,.rt-steps-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.rt-steps-detail-tools{justify-content:space-between}.rt-steps-group-head{margin:3px 0 8px}.rt-steps-group-head p{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.rt-steps-group-items{display:grid;gap:8px;padding-left:12px;border-left:2px solid var(--dsw-alias-border-l2);min-width:0}.rt-steps-stage-tools{display:flex;justify-content:flex-end;gap:4px;flex-wrap:wrap;margin-top:5px}.rt-steps-stage-tools button{padding:3px 6px;min-height:26px;font-size:12px}.rt-steps-bottom{margin-top:14px!important;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;color:var(--dsw-alias-label-secondary)}.rt-steps-legacy{padding:10px;margin-bottom:12px;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;display:grid;gap:8px;font-size:12px}
@container workflow-steps (max-width:380px){.rt-steps-stage{grid-template-columns:24px minmax(0,1fr);gap:6px}.rt-steps-index{width:24px;height:24px}.rt-steps-head{padding:7px;gap:5px}.rt-steps-assignment{padding:0 8px 9px;gap:6px}.rt-steps-auto{padding:0 8px 10px}.rt-steps-group-items{padding-left:8px}.rt-steps-detail{padding:9px}.rt-steps-list-head>button{padding:5px 8px!important}}
@media(pointer:coarse){.rt-workflow-steps button{min-height:44px}.rt-workflow-steps input,.rt-workflow-steps select,.rt-workflow-steps textarea{font-size:16px}.rt-steps-auto{min-height:44px}}
`;
		//#endregion
		//#region lib/workflow-graph.js
		const strings$1 = (x) => Array.isArray(x) && x.every((v) => typeof v === "string");
		const stable = (value) => JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
		function validate(value, partial) {
			const errors = [];
			const issue = (code, message, nodeId, edgeId) => errors.push({
				code,
				message,
				...nodeId ? { nodeId } : {},
				...edgeId ? { edgeId } : {}
			});
			if (!value || typeof value !== "object" || Array.isArray(value)) return [{
				code: "shape",
				message: "流程必须为对象"
			}];
			const d = value;
			const steps = d.steps !== void 0, allowPartial = partial && steps;
			if (steps) try {
				if (!isStepsDefinition(d)) throw Error("步骤编排版本未知");
				const expected = compileStepsDefinition(d), structure = (x) => ({
					entryId: x.entryId,
					nodeIds: x.nodes.map((n) => n.id),
					helpers: x.nodes.filter((n) => n.stepsInternal !== void 0),
					edges: x.edges,
					parallelGroups: x.parallelGroups,
					loops: x.loops
				});
				if (stable(structure(d)) !== stable(structure(expected))) issue("steps-canonical", "步骤依赖结构与用户指定的阶段不一致，请重新编排");
				for (const n of d.nodes) if (!n.stepsInternal && n.includeIncoming !== true) issue("steps-inputs", "步骤必须接收实际所走上游的信息", n.id);
			} catch (error) {
				issue("steps-shape", error instanceof Error ? error.message : "步骤编排格式非法");
			}
			else if (Array.isArray(d.nodes) && d.nodes.some((n) => n?.stepsInternal !== void 0)) issue("steps-internal", "内部步骤标记只能属于已校验的自由步骤编排");
			if (d.executionPolicy !== void 0 && d.executionPolicy !== "per-node-v1") issue("execution-policy", "流程执行策略未知，请升级插件");
			if (!validWorkflowId(d.id) || typeof d.title !== "string" || !d.title.trim() || !Number.isSafeInteger(d.revision) || d.revision < 1) issue("identity", "流程ID、名称或版本非法");
			if (!Array.isArray(d.nodes) || !d.nodes.length && !allowPartial || d.nodes.length > 200 || !Array.isArray(d.edges) || d.edges.length > 600 || !Array.isArray(d.parallelGroups) || !Array.isArray(d.loops)) return [...errors, {
				code: "shape",
				message: "需要1—200个节点、边和明确的并行／回路组"
			}];
			const nodes = /* @__PURE__ */ new Map(), titles = /* @__PURE__ */ new Set();
			for (const n of d.nodes) {
				if (d.executionPolicy === "per-node-v1" && n?.autoReceiveAndRun === true && n.includeIncoming !== true) issue("automatic-inputs", "自动接收并运行必须接收所走上游的正式输入", n?.id);
				if (n?.autoReceiveAndRun !== void 0 && d.executionPolicy !== "per-node-v1") issue("execution-policy", "环节自动权限必须有明确的逐环节策略，不能回落旧全局模式", n?.id);
				if (!n || !validWorkflowId(n.id)) {
					issue("node-id", "节点ID非法");
					continue;
				}
				if (nodes.has(n.id)) issue("duplicate-node", "节点ID重复", n.id);
				nodes.set(n.id, n);
				if (typeof n.title !== "string" || !allowPartial && !n.title.trim() || !steps && titles.has(n.title.trim())) issue("node-title", "节点名称为空或重复", n.id);
				else titles.add(n.title.trim());
				if (![
					"work",
					"join",
					"minutes"
				].includes(n.kind) || !strings$1(n.memberIds) || !Array.isArray(n.inputs) || typeof n.instruction !== "string" || n.instruction.length > 1e5 || typeof n.includeIncoming !== "boolean" || n.decision !== void 0 && typeof n.decision !== "boolean" || n.requireReview !== void 0 && typeof n.requireReview !== "boolean" || n.confirmation !== void 0 && typeof n.confirmation !== "boolean" || n.autoReceiveAndRun !== void 0 && typeof n.autoReceiveAndRun !== "boolean") issue("node-shape", "节点字段非法", n.id);
				else {
					if (n.cardBinding !== void 0 && (!isWorkflowCardBinding(n.cardBinding) || n.kind !== "work")) issue("node-shape", "任务卡绑定必须指向一个已发布的固定版本", n.id);
					if (n.kind !== "work" && n.memberIds.length) issue("control-member", "汇合／秘书节点不能配置普通执行成员", n.id);
					if (n.kind === "work" && (!allowPartial && !n.memberIds.length || new Set(n.memberIds).size !== n.memberIds.length || steps && n.memberIds.length > 1)) issue("members", steps ? "每个步骤执行时需指定一位成员Agent；并行工作请建立独立步骤" : "工作节点需配置不重复的成员", n.id);
					if (n.kind !== "join" && n.decision) issue("decision", "只有汇合节点可设置人工选路", n.id);
					for (const b of n.inputs) if (!b || ![
						"message",
						"asset",
						"node",
						"activation"
					].includes(b.kind)) issue("input", "输入绑定非法", n.id);
					else if (b.kind === "node" && (!validWorkflowId(b.nodeId) || !["current", "previous"].includes(b.round))) issue("input", "节点结果需明确当前轮或上一轮", n.id);
					else if (b.kind === "activation" && !validWorkflowId(b.activationId)) issue("input", "执行来源ID非法", n.id);
					else if ((b.kind === "message" || b.kind === "asset") && (typeof b.id !== "string" || !b.id)) issue("input", "固定资料ID不能为空", n.id);
				}
			}
			if (d.executionPolicy === void 0 && d.nodes.some((n) => n && n.autoReceiveAndRun !== void 0)) issue("execution-policy", "逐环节自动配置必须使用明确的执行策略");
			if (errors.some((e) => [
				"node-shape",
				"node-id",
				"input"
			].includes(e.code))) return errors;
			for (const n of d.nodes) for (const b of n.inputs) if (b.kind === "node" && !nodes.has(b.nodeId)) issue("input-node", "引用的节点不存在", n.id);
			const edgeIds = /* @__PURE__ */ new Set(), pairs = /* @__PURE__ */ new Set();
			const normal = [];
			for (const e of d.edges) {
				if (!e || !validWorkflowId(e.id) || edgeIds.has(e.id)) {
					issue("edge-id", "边ID非法或重复", void 0, e?.id);
					continue;
				}
				edgeIds.add(e.id);
				if (!nodes.has(e.from) || !nodes.has(e.to)) {
					issue("dangling", "连线端点不存在", void 0, e.id);
					continue;
				}
				if (e.from === e.to) issue("self-cycle", "不允许节点自环", e.from, e.id);
				if (![
					"flow",
					"choice",
					"loop"
				].includes(e.kind)) issue("edge-kind", "连线类型非法", void 0, e.id);
				if (e.kind !== "loop") normal.push(e);
				const key = e.from + ">" + e.to + ":" + e.kind;
				if (pairs.has(key)) issue("duplicate-edge", "重复连线", void 0, e.id);
				pairs.add(key);
				if (e.kind === "choice" && (!nodes.get(e.from)?.decision || typeof e.label !== "string" || !e.label.trim())) issue("choice", "人工出口需要汇合决策节点与可读名称", e.from, e.id);
				if (e.kind === "flow" && nodes.get(e.from)?.decision) issue("choice", "人工决策出口必须标为条件路径", e.from, e.id);
			}
			if (errors.some((e) => [
				"edge-id",
				"dangling",
				"edge-kind",
				"choice"
			].includes(e.code))) return errors;
			if (d.nodes.length && !nodes.has(d.entryId)) issue("entry", "入口不存在");
			const roots = d.nodes.filter((n) => !normal.some((e) => e.to === n.id));
			if (d.nodes.length && (roots.length !== 1 || roots[0]?.id !== d.entryId)) issue("entry", "流程需要一个明确入口，不能有无入口或游离节点");
			const indegree = new Map(d.nodes.map((n) => [n.id, normal.filter((e) => e.to === n.id).length])), queue = roots.map((n) => n.id), order = [];
			while (queue.length) {
				const id = queue.shift();
				order.push(id);
				for (const e of normal.filter((e) => e.from === id)) {
					const n = (indegree.get(e.to) ?? 1) - 1;
					indegree.set(e.to, n);
					if (n === 0) queue.push(e.to);
				}
			}
			if (order.length !== nodes.size) issue("cycle", "除声明的回路返回边外，流程不能有环");
			const reachable = /* @__PURE__ */ new Set();
			const visit = (id) => {
				if (reachable.has(id)) return;
				reachable.add(id);
				normal.filter((e) => e.from === id).forEach((e) => visit(e.to));
			};
			if (nodes.has(d.entryId)) visit(d.entryId);
			for (const n of d.nodes) if (!reachable.has(n.id)) issue("unreachable", "节点从入口不可达", n.id);
			for (const n of d.nodes) if (n.decision) {
				const out = normal.filter((e) => e.from === n.id);
				if (out.length < 2 || out.some((e) => e.kind !== "choice") || new Set(out.map((e) => e.label)).size !== out.length) issue("choice", "人工分支需至少两个名称不同的出口", n.id);
			}
			const occupied = /* @__PURE__ */ new Set(), loopIds = /* @__PURE__ */ new Set();
			for (const l of d.loops) {
				if (!l || !validWorkflowId(l.id) || loopIds.has(l.id) || !strings$1(l.nodeIds) || !strings$1(l.entryIds) || !l.entryIds.length || !Number.isSafeInteger(l.maxRounds) || l.maxRounds < 1) {
					issue("loop-shape", "回路需合法ID、入口、节点范围及正整数轮次");
					continue;
				}
				loopIds.add(l.id);
				if (!nodes.get(l.gateId)?.decision || nodes.get(l.advanceId)?.kind !== "work" || !l.nodeIds.includes(l.gateId) || !l.nodeIds.includes(l.advanceId)) issue("loop-gate", "回路需要人工决策门和修改工作节点", l.gateId);
				for (const id of l.nodeIds) {
					if (!nodes.has(id)) issue("loop-node", "回路节点不存在", id);
					if (occupied.has(id)) issue("nested-loop", "本版不支持嵌套或交叉回路", id);
					occupied.add(id);
				}
				if (new Set(l.nodeIds).size !== l.nodeIds.length || new Set(l.entryIds).size !== l.entryIds.length) issue("loop-node", "回路范围或入口重复");
				if (!normal.some((e) => e.from === l.gateId && e.to === l.advanceId && e.kind === "choice")) issue("loop-gate", "修改节点必须由本回路的人工选择直接进入", l.advanceId);
				if (!normal.some((e) => e.from === l.gateId && !l.nodeIds.includes(e.to))) issue("loop-exit", "回路缺少退出路径", l.gateId);
				for (const id of l.entryIds) if (!l.nodeIds.includes(id) || !d.edges.some((e) => e.from === l.advanceId && e.to === id && e.kind === "loop" && e.loopId === l.id)) issue("loop-return", "每个回路入口都要有正确返回边", id);
				for (const e of normal) {
					if (!l.nodeIds.includes(e.from) && l.nodeIds.includes(e.to) && !l.entryIds.includes(e.to)) issue("loop-entry", "回路只能从声明的评审入口进入", e.to, e.id);
					if (l.nodeIds.includes(e.from) && !l.nodeIds.includes(e.to) && e.from !== l.gateId) issue("loop-exit", "回路只能由决策门退出", e.from, e.id);
				}
				const beforeGate = /* @__PURE__ */ new Set();
				const walk = (id) => {
					if (beforeGate.has(id) || id === l.advanceId) return;
					beforeGate.add(id);
					if (id !== l.gateId) normal.filter((e) => e.from === id && l.nodeIds.includes(e.to)).forEach((e) => walk(e.to));
				};
				l.entryIds.forEach(walk);
				const reachesGate = /* @__PURE__ */ new Set([l.gateId]);
				for (let i = 0; i < l.nodeIds.length; i++) for (const e of normal) if (beforeGate.has(e.from) && reachesGate.has(e.to)) reachesGate.add(e.from);
				for (const id of l.nodeIds) if (id !== l.advanceId && (!beforeGate.has(id) || !reachesGate.has(id))) issue("loop-region", "回路中的评审节点必须位于入口到决策门的路径上", id);
				if (normal.some((e) => e.from === l.advanceId) || normal.filter((e) => e.to === l.advanceId).some((e) => e.from !== l.gateId)) issue("loop-advance", "修改节点只能从决策门进入并沿返回边离开", l.advanceId);
			}
			if (errors.some((e) => e.code === "loop-shape")) return errors;
			for (const e of d.edges.filter((e) => e.kind === "loop")) {
				const l = d.loops.find((l) => l.id === e.loopId);
				if (!l || e.from !== l.advanceId || !l.entryIds.includes(e.to)) issue("loop-edge", "返回边不属于合法回路入口", void 0, e.id);
			}
			const groupIds = /* @__PURE__ */ new Set();
			for (const g of d.parallelGroups) {
				if (!g || !validWorkflowId(g.id) || groupIds.has(g.id) || !strings$1(g.branchIds) || g.branchIds.length < 2) {
					issue("group", "并行组字段非法");
					continue;
				}
				groupIds.add(g.id);
				if (!nodes.has(g.sourceId) || nodes.get(g.joinId)?.kind !== "join" || new Set(g.branchIds).size !== g.branchIds.length) issue("group", "并行组需要来源、独立分支与汇合节点", g.joinId);
				const children = normal.filter((e) => e.from === g.sourceId && e.kind === "flow").map((e) => e.to);
				if (children.length !== g.branchIds.length || g.branchIds.some((id) => !children.includes(id))) issue("group", "并行组必须完整包含来源的实际分支", g.sourceId);
				const branchSets = g.branchIds.map((id) => {
					const set = /* @__PURE__ */ new Set();
					const walk = (x) => {
						if (x === g.joinId || set.has(x)) return;
						set.add(x);
						normal.filter((e) => e.from === x).forEach((e) => walk(e.to));
					};
					walk(id);
					return set;
				});
				for (let i = 0; i < branchSets.length; i++) {
					const set = branchSets[i];
					if (![...set].some((id) => normal.some((e) => e.from === id && e.to === g.joinId))) issue("group-exit", "分支不能到达约定汇合", g.branchIds[i]);
					for (const id of set) if (!normal.some((e) => e.from === id) && !d.edges.some((e) => e.from === id && e.kind === "loop")) issue("group-exit", "分支在汇合前提前结束", id);
					for (let j = i + 1; j < branchSets.length; j++) if ([...set].some((id) => branchSets[j].has(id))) issue("group-overlap", "并行分支在约定汇合之前发生重叠", g.joinId);
				}
			}
			if (errors.some((e) => e.code === "group")) return errors;
			for (const n of d.nodes) if (normal.filter((e) => e.from === n.id && e.kind === "flow").length > 1 && !d.parallelGroups.some((g) => g.sourceId === n.id)) issue("group-required", "多个普通出口必须声明并行组及汇合", n.id);
			if (!d.limits || Object.values(d.limits).length !== 3 || ![
				"nodeAttempts",
				"workAttempts",
				"minutesStarts"
			].every((k) => Number.isSafeInteger(d.limits[k]) && d.limits[k] > 0)) issue("limits", "所有执行上限必须为正整数");
			if (!Number.isSafeInteger(d.layoutRevision) || d.layoutRevision < 1 || !d.positions || typeof d.positions !== "object" || Array.isArray(d.positions) || Object.entries(d.positions).some(([id, p]) => !nodes.has(id) || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) issue("layout", "布局版本和坐标非法");
			return errors;
		}
		function validateWorkflowGraph(value) {
			return validate(value, false);
		}
		/** Only an explicitly authored steps draft may remain empty or partially configured. */
		function validateWorkflowDraft(value) {
			return validate(value, true);
		}
		function workflowSemantic(d) {
			const { positions, layoutRevision, revision, ...semantic } = d;
			return semantic;
		}
		function layoutWorkflow(d) {
			const copy = structuredClone(d), ranks = /* @__PURE__ */ new Map([[d.entryId, 0]]);
			for (let pass = 0; pass < d.nodes.length; pass++) for (const e of d.edges.filter((e) => e.kind !== "loop")) if (ranks.has(e.from)) ranks.set(e.to, Math.max(ranks.get(e.to) ?? 0, ranks.get(e.from) + 1));
			const rows = /* @__PURE__ */ new Map();
			copy.positions = {};
			for (const n of d.nodes) {
				const x = ranks.get(n.id) ?? 0, y = rows.get(x) ?? 0;
				rows.set(x, y + 1);
				copy.positions[n.id] = {
					x: 40 + x * 260,
					y: 50 + y * 190
				};
			}
			return copy;
		}
		//#endregion
		//#region lib/client/workflow-viewport.js
		const WORKFLOW_MIN_ZOOM = .1;
		const WORKFLOW_MAX_ZOOM = 1.6;
		const clampWorkflowZoom = (value) => Math.max(WORKFLOW_MIN_ZOOM, Math.min(WORKFLOW_MAX_ZOOM, value));
		const workflowPosition = (definition, id) => definition.positions[id] ?? {
			x: 30,
			y: 30
		};
		/** Shared by painting and bounds calculation, including return rails and curve controls. */
		function workflowEdgeGeometry(definition, edge) {
			const a = workflowPosition(definition, edge.from), b = workflowPosition(definition, edge.to);
			const returning = edge.kind === "loop", vertical = !returning && Math.abs(b.x - a.x) < 240;
			const sx = a.x + 220, sy = a.y + 58, tx = b.x, ty = b.y + 58;
			const lane = definition.edges.filter((e) => e.kind === "loop").findIndex((e) => e.id === edge.id), rail = Math.max(6, b.x - 34 - lane * 14), bottom = Math.max(a.y, b.y) + 146 + lane * 14;
			const points = returning ? [
				[a.x + 110, a.y + 124],
				[a.x + 110, bottom],
				[rail, bottom],
				[rail, ty],
				[tx, ty]
			] : vertical ? [
				[a.x + 110, a.y + 124],
				[a.x + 110, a.y + 170],
				[b.x + 110, b.y - 40],
				[b.x + 110, b.y]
			] : [
				[sx, sy],
				[sx + 60, sy],
				[tx - 60, ty],
				[tx, ty]
			];
			const path = returning ? `M ${a.x + 110} ${a.y + 124} L ${a.x + 110} ${bottom} L ${rail} ${bottom} L ${rail} ${ty} L ${tx} ${ty}` : vertical ? `M ${a.x + 110} ${a.y + 124} C ${a.x + 110} ${a.y + 170}, ${b.x + 110} ${b.y - 40}, ${b.x + 110} ${b.y}` : `M ${sx} ${sy} C ${sx + 60} ${sy}, ${tx - 60} ${ty}, ${tx} ${ty}`;
			const labelX = returning ? (a.x + 110 + rail) / 2 : vertical ? a.x + 150 : (sx + tx) / 2, labelY = returning ? bottom - 6 : vertical ? (a.y + 124 + b.y) / 2 : (sy + ty) / 2 - 9;
			const label = returning ? "返回下一轮" : edge.label ?? "", labelWidth = Array.from(label).reduce((sum, ch) => sum + (ch.codePointAt(0) >= 11904 ? 12 : 7), 0);
			if (label) points.push([labelX - labelWidth / 2, labelY - 12], [labelX + labelWidth / 2, labelY + 3]);
			return {
				path,
				points,
				labelX,
				labelY
			};
		}
		function workflowSurface(definition, origin) {
			const points = definition.nodes.flatMap((n) => {
				const p = workflowPosition(definition, n.id);
				return [[p.x - 10, p.y], [p.x + 230, p.y + 124]];
			});
			for (const edge of definition.edges) points.push(...workflowEdgeGeometry(definition, edge).points);
			if (!points.length) return {
				width: 320,
				height: 180,
				fitWidth: 320,
				fitHeight: 180,
				centerX: 160,
				centerY: 90,
				offsetX: 84,
				offsetY: 64
			};
			const minX = Math.min(...points.map((p) => p[0])), minY = Math.min(...points.map((p) => p[1])), maxX = Math.max(...points.map((p) => p[0])), maxY = Math.max(...points.map((p) => p[1]));
			const offsetX = origin?.x ?? Math.max(84, 24 - minX), offsetY = origin?.y ?? Math.max(64, 24 - minY);
			return {
				width: maxX + offsetX + 24,
				height: maxY + offsetY + 24,
				fitWidth: maxX - minX + 48,
				fitHeight: maxY - minY + 48,
				centerX: (minX + maxX) / 2 + offsetX,
				centerY: (minY + maxY) / 2 + offsetY,
				offsetX,
				offsetY
			};
		}
		function fitWorkflowZoom(surface, width, height) {
			return clampWorkflowZoom(Math.min(1, Math.max(1, width) / (surface.fitWidth ?? surface.width), Math.max(1, height) / (surface.fitHeight ?? surface.height)));
		}
		const workflowAvailableHeight = (top, bottom) => Math.max(120, Math.floor(bottom - top - 32));
		function anchoredWorkflowScroll(oldZoom, newZoom, scrollLeft, scrollTop, x, y) {
			return {
				left: Math.max(0, (scrollLeft + x) / oldZoom * newZoom - x),
				top: Math.max(0, (scrollTop + y) / oldZoom * newZoom - y)
			};
		}
		//#endregion
		//#region lib/client/WorkflowCanvas.js
		const workflowLabels = {
			not_started: "未开始",
			not_walked: "未走此路径",
			waiting_inputs: "等待输入",
			ready: "可开始",
			waiting_decision: "待你决定",
			queued: "等待投递",
			offline: "原窗口未连接",
			delivering: "正在投递",
			uncertain: "投递待核实",
			in_progress: "处理中",
			waiting_review: "待验收",
			changes_requested: "待修改",
			submitted: "已提交",
			failed: "执行失败",
			ended: "已结束",
			skipped: "已跳过",
			limit: "达到上限"
		};
		const workflowColor = (status) => status === "submitted" ? "#16794c" : status === "ready" ? "#2470b5" : [
			"waiting_decision",
			"uncertain",
			"failed",
			"limit"
		].includes(status ?? "") ? "#a55d00" : [
			"skipped",
			"not_walked",
			"ended"
		].includes(status ?? "") ? "#85858b" : "#5b6677";
		function WorkflowCanvas({ definition, views, run, selected, onSelect, onMove, zoom, members, readOnly = false, selectedEdge, onSelectEdge, onConnect, onZoomChange, fitRequest = 0, manualZoomRequest = 0 }) {
			const drag = (0, react.useRef)();
			const surface = (0, react.useRef)(null), linkRef = (0, react.useRef)();
			const [link, setLink] = (0, react.useState)();
			const viewport = (0, react.useRef)(null), automatic = (0, react.useRef)(true), lastFit = (0, react.useRef)(-1), lastManual = (0, react.useRef)(manualZoomRequest), previousZoom = (0, react.useRef)(zoom), currentZoom = (0, react.useRef)(zoom);
			currentZoom.current = zoom;
			const pendingScroll = (0, react.useRef)(), [canvasHeight, setCanvasHeight] = (0, react.useState)(120);
			const initialBounds = workflowSurface(definition), origin = (0, react.useRef)({
				id: definition.id,
				x: initialBounds.offsetX,
				y: initialBounds.offsetY
			});
			if (origin.current.id !== definition.id) {
				origin.current = {
					id: definition.id,
					x: initialBounds.offsetX,
					y: initialBounds.offsetY
				};
				automatic.current = true;
			}
			const bounds = workflowSurface(definition, origin.current), { width, height, offsetX, offsetY } = bounds;
			(0, react.useEffect)(() => {
				if (lastManual.current !== manualZoomRequest) {
					automatic.current = false;
					pendingScroll.current = void 0;
					lastManual.current = manualZoomRequest;
				}
			}, [manualZoomRequest]);
			(0, react.useEffect)(() => {
				const element = viewport.current;
				if (!element) return;
				if (lastFit.current !== fitRequest) {
					automatic.current = true;
					lastFit.current = fitRequest;
				}
				const host = element.closest(".rt-meeting-content"), parent = element.parentElement;
				const measure = () => {
					const hostRect = host?.getBoundingClientRect(), bottom = Math.min(hostRect?.bottom ?? window.innerHeight, window.innerHeight), available = workflowAvailableHeight(Math.max(element.getBoundingClientRect().top, hostRect?.top ?? -Infinity), bottom);
					setCanvasHeight((current) => current === available ? current : available);
					if (!automatic.current || !onZoomChange || !element.clientWidth) return;
					const chrome = Math.max(0, (element.offsetHeight ?? element.clientHeight) - element.clientHeight), usableHeight = Math.max(1, available - chrome);
					const next = fitWorkflowZoom(bounds, element.clientWidth, usableHeight), scroll = {
						zoom: next,
						left: Math.max(0, bounds.centerX * next - element.clientWidth / 2),
						top: Math.max(0, bounds.centerY * next - usableHeight / 2)
					};
					if (next === currentZoom.current) {
						pendingScroll.current = void 0;
						element.scrollLeft = scroll.left;
						element.scrollTop = scroll.top;
					} else {
						pendingScroll.current = scroll;
						onZoomChange(next);
					}
				};
				measure();
				const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(measure);
				observer?.observe(element);
				if (host) observer?.observe(host);
				if (parent) observer?.observe(parent);
				window.addEventListener("resize", measure);
				return () => {
					observer?.disconnect();
					window.removeEventListener("resize", measure);
				};
			}, [
				definition.id,
				width,
				height,
				offsetX,
				offsetY,
				bounds.fitWidth,
				bounds.fitHeight,
				bounds.centerX,
				bounds.centerY,
				fitRequest,
				onZoomChange
			]);
			(0, react.useEffect)(() => {
				const element = viewport.current;
				if (!element) return;
				const pending = pendingScroll.current;
				if (pending && pending.zoom === zoom) {
					element.scrollLeft = pending.left;
					element.scrollTop = pending.top;
					pendingScroll.current = void 0;
				} else if (!pending && previousZoom.current !== zoom) {
					const scroll = anchoredWorkflowScroll(previousZoom.current, zoom, element.scrollLeft, element.scrollTop, element.clientWidth / 2, element.clientHeight / 2);
					element.scrollLeft = scroll.left;
					element.scrollTop = scroll.top;
				}
				previousZoom.current = zoom;
			}, [zoom]);
			(0, react.useEffect)(() => {
				const element = viewport.current;
				if (!element || !onZoomChange) return;
				const wheel = (event) => {
					if (!event.ctrlKey) return;
					event.preventDefault();
					event.stopPropagation();
					automatic.current = false;
					if (drag.current || linkRef.current || !event.deltaY) return;
					const pending = pendingScroll.current, oldZoom = pending?.zoom ?? zoom;
					const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1), next = clampWorkflowZoom(oldZoom * Math.exp(-Math.max(-300, Math.min(300, delta)) * .0015));
					if (next === oldZoom) return;
					const rect = element.getBoundingClientRect(), scroll = anchoredWorkflowScroll(oldZoom, next, pending?.left ?? element.scrollLeft, pending?.top ?? element.scrollTop, event.clientX - rect.left - element.clientLeft, event.clientY - rect.top - element.clientTop);
					pendingScroll.current = {
						zoom: next,
						...scroll
					};
					onZoomChange(next);
				};
				element.addEventListener("wheel", wheel, { passive: false });
				return () => element.removeEventListener("wheel", wheel);
			}, [zoom, onZoomChange]);
			const locked = (id) => readOnly || run?.status === "active" && run.activations.some((a) => a.nodeId === id && !a.temporary);
			const clear = () => {
				linkRef.current = void 0;
				setLink(void 0);
			};
			const begin = (id, x, y) => {
				const p = position(id);
				linkRef.current = {
					from: id,
					x: p.x + 220,
					y: p.y + 58,
					clientX: x,
					clientY: y
				};
				setLink(linkRef.current);
			};
			const finish = (to) => {
				const start = linkRef.current;
				if (start && !locked(to)) {
					clear();
					onConnect?.(start.from, to);
				}
			};
			const position = (id) => {
				const p = workflowPosition(definition, id);
				return {
					x: p.x + offsetX,
					y: p.y + offsetY
				};
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: viewport,
				className: "rt-workflow-canvas",
				"aria-label": "流程画布，可横向和纵向滚动；Ctrl＋滚轮缩放",
				tabIndex: 0,
				onKeyDown: (e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						clear();
					}
				},
				style: {
					overflow: "auto",
					height: canvasHeight,
					minHeight: 120,
					boxSizing: "border-box",
					flexShrink: 0,
					position: "relative",
					overscrollBehavior: "contain",
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					background: "var(--dsw-alias-bg-l1, #f5f6f8)"
				},
				children: [link && (0, react_jsx_runtime.jsx)("span", {
					role: "status",
					style: {
						position: "absolute",
						zIndex: 4,
						background: "var(--dsw-alias-bg-base,white)",
						padding: 5,
						pointerEvents: "none"
					},
					children: "拖到另一环节左侧圆点，或点击接收点；Esc取消。"
				}), (0, react_jsx_runtime.jsx)("div", {
					style: {
						width: width * zoom,
						height: height * zoom,
						position: "relative"
					},
					children: (0, react_jsx_runtime.jsxs)("div", {
						ref: surface,
						"data-workflow-surface": "",
						style: {
							width,
							height,
							transform: `scale(${zoom})`,
							transformOrigin: "top left",
							position: "relative"
						},
						children: [(0, react_jsx_runtime.jsxs)("svg", {
							width,
							height,
							style: {
								position: "absolute",
								inset: 0,
								pointerEvents: "none"
							},
							children: [
								(0, react_jsx_runtime.jsx)("defs", { children: (0, react_jsx_runtime.jsx)("marker", {
									id: "rt-flow-arrow",
									markerWidth: "8",
									markerHeight: "8",
									refX: "7",
									refY: "4",
									orient: "auto",
									children: (0, react_jsx_runtime.jsx)("path", {
										d: "M0,0 L8,4 L0,8",
										fill: "#87909c"
									})
								}) }),
								definition.edges.map((e) => {
									const fromView = views.find((v) => v.nodeId === e.from), toView = views.find((v) => v.nodeId === e.to);
									const sources = (run?.activations.find((a) => a.id === toView?.activationId))?.sourceActivationIds ?? toView?.sourceActivationIds ?? [];
									const sameExecution = fromView?.activationId ? sources.includes(fromView.activationId) : !!fromView?.sourceActivationIds.length && fromView.sourceActivationIds.every((id) => sources.includes(id));
									const chosen = fromView?.status === "submitted" && toView?.incomingEdgeIds.includes(e.id) && sameExecution, color = chosen ? "#16794c" : "#87909c";
									const returning = e.kind === "loop", { path, labelX, labelY } = workflowEdgeGeometry(definition, e);
									return (0, react_jsx_runtime.jsxs)("g", {
										transform: `translate(${offsetX} ${offsetY})`,
										children: [
											(0, react_jsx_runtime.jsx)("path", {
												"data-workflow-edge-hit": e.id,
												role: "button",
												tabIndex: 0,
												"aria-label": `连线：${definition.nodes.find((n) => n.id === e.from)?.title} → ${definition.nodes.find((n) => n.id === e.to)?.title}`,
												"aria-pressed": selectedEdge === e.id,
												d: path,
												fill: "none",
												stroke: "transparent",
												strokeWidth: 18,
												style: {
													pointerEvents: "stroke",
													cursor: "pointer"
												},
												onClick: () => onSelectEdge?.(e.id),
												onKeyDown: (event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														onSelectEdge?.(e.id);
													}
												}
											}),
											(0, react_jsx_runtime.jsx)("path", {
												"data-workflow-edge": e.id,
												d: path,
												fill: "none",
												stroke: selectedEdge === e.id ? "#2470b5" : color,
												strokeWidth: selectedEdge === e.id ? 3 : chosen ? 2.5 : 1.5,
												strokeDasharray: returning ? "6 4" : e.kind === "choice" && !chosen ? "3 4" : void 0,
												markerEnd: "url(#rt-flow-arrow)"
											}),
											(0, react_jsx_runtime.jsx)("text", {
												x: labelX,
												y: labelY,
												fontSize: "11",
												fill: color,
												textAnchor: "middle",
												children: returning ? "返回下一轮" : e.label ?? ""
											})
										]
									}, e.id);
								}),
								link && (0, react_jsx_runtime.jsx)("path", {
									"data-workflow-preview-line": "",
									d: `M ${position(link.from).x + 220} ${position(link.from).y + 58} L ${link.x} ${link.y}`,
									fill: "none",
									stroke: "#2470b5",
									strokeWidth: 2,
									strokeDasharray: "5 4"
								})
							]
						}), definition.nodes.map((n) => {
							const p = position(n.id), v = views.find((v) => v.nodeId === n.id), color = workflowColor(v?.status);
							return (0, react_jsx_runtime.jsxs)("div", {
								style: {
									position: "absolute",
									left: p.x,
									top: p.y,
									width: 220,
									height: 124
								},
								children: [(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"data-workflow-node": n.id,
									"aria-label": `${n.title}，${workflowLabels[v?.status ?? "not_started"]}`,
									"aria-pressed": selected === n.id,
									style: {
										position: "absolute",
										inset: 0,
										width: 220,
										height: 124,
										overflow: "hidden",
										boxSizing: "border-box",
										padding: 14,
										textAlign: "left",
										font: "inherit",
										color: "inherit",
										background: "var(--dsw-alias-bg-base,white)",
										border: `${selected === n.id ? 2 : 1}px solid ${selected === n.id ? "#2470b5" : "var(--dsw-alias-border-l2,#d4d9df)"}`,
										borderRadius: 12,
										boxShadow: "0 3px 8px #00000008",
										touchAction: "none",
										cursor: readOnly ? "default" : "grab",
										overflowWrap: "anywhere"
									},
									onClick: () => onSelect(n.id),
									onPointerDown: (e) => {
										if (e.button !== 0 || readOnly) return;
										automatic.current = false;
										onSelect(n.id);
										e.currentTarget.setPointerCapture(e.pointerId);
										const raw = workflowPosition(definition, n.id);
										drag.current = {
											id: n.id,
											x: e.clientX,
											y: e.clientY,
											atX: raw.x,
											atY: raw.y,
											pointerId: e.pointerId
										};
									},
									onPointerMove: (e) => {
										const d = drag.current;
										if (d?.id === n.id && d.pointerId === e.pointerId) onMove(n.id, Math.max(0, Math.round(d.atX + (e.clientX - d.x) / zoom)), Math.max(0, Math.round(d.atY + (e.clientY - d.y) / zoom)));
									},
									onPointerUp: () => {
										drag.current = void 0;
									},
									onPointerCancel: () => {
										drag.current = void 0;
									},
									onKeyDown: (e) => {
										const step = {
											ArrowLeft: [-20, 0],
											ArrowRight: [20, 0],
											ArrowUp: [0, -20],
											ArrowDown: [0, 20]
										}[e.key];
										if (step && e.altKey && !readOnly) {
											e.preventDefault();
											automatic.current = false;
											const raw = workflowPosition(definition, n.id);
											onMove(n.id, Math.max(0, raw.x + step[0]), Math.max(0, raw.y + step[1]));
										}
									},
									children: [
										(0, react_jsx_runtime.jsxs)("small", {
											style: {
												color,
												display: "block",
												marginBottom: 7
											},
											children: [n.kind === "join" ? "◇ 汇合与选择" : n.kind === "minutes" ? "▤ 会议秘书" : "● 成员处理", v?.loopId ? ` · 第${v.round}轮` : ""]
										}),
										(0, react_jsx_runtime.jsx)("strong", {
											style: {
												display: "block",
												fontSize: 14,
												marginBottom: 6,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis"
											},
											children: n.title
										}),
										(0, react_jsx_runtime.jsx)("span", {
											style: {
												display: "block",
												fontSize: 11,
												color: "#78818c",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap"
											},
											children: n.memberIds.map((id) => members.find((m) => m.id === id)?.name ?? id).join("、") || (n.kind === "minutes" ? "独立秘书，只读整理" : "脚本判断，不调用模型")
										}),
										(0, react_jsx_runtime.jsxs)("span", {
											style: {
												display: "block",
												marginTop: 8,
												color,
												fontSize: 12
											},
											children: [workflowLabels[v?.status ?? "not_started"], v && v.required > 0 ? ` · ${v.submitted}/${v.required}` : ""]
										})
									]
								}), !readOnly && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-workflow-in": n.id,
									"aria-label": `接收点：${n.title}`,
									title: "从另一个环节右侧圆点拖到这里；也可先点发送点，再点这里。",
									disabled: !!locked(n.id),
									onClick: () => finish(n.id),
									style: {
										position: "absolute",
										left: -10,
										top: 48,
										width: 20,
										height: 20,
										borderRadius: "50%",
										border: "2px solid #2470b5",
										background: "var(--dsw-alias-bg-base,white)",
										padding: 0,
										cursor: "crosshair",
										zIndex: 2
									}
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"data-workflow-out": n.id,
									"aria-label": `发送点：${n.title}`,
									title: "拖到下一环节的左侧圆点建立连线；仅编辑，不执行。",
									disabled: !!locked(n.id),
									style: {
										position: "absolute",
										right: -10,
										top: 48,
										width: 20,
										height: 20,
										borderRadius: "50%",
										border: "2px solid #2470b5",
										background: "#dceafa",
										padding: 0,
										cursor: "crosshair",
										touchAction: "none",
										zIndex: 2
									},
									onPointerDown: (e) => {
										if (e.button !== 0) return;
										e.stopPropagation();
										begin(n.id, e.clientX, e.clientY);
										e.currentTarget.setPointerCapture(e.pointerId);
									},
									onPointerMove: (e) => {
										if (!linkRef.current) return;
										const rect = surface.current?.getBoundingClientRect();
										if (rect) setLink({
											from: linkRef.current.from,
											x: (e.clientX - rect.left) / zoom,
											y: (e.clientY - rect.top) / zoom
										});
									},
									onPointerUp: (e) => {
										const start = linkRef.current;
										if (!start) return;
										const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-workflow-in]")?.getAttribute("data-workflow-in");
										if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
										if (target) finish(target);
										else if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 6) clear();
									},
									onPointerCancel: clear,
									onClick: (e) => {
										if (e.detail === 0) begin(n.id, 0, 0);
									}
								})] })]
							}, n.id);
						})]
					})
				})]
			});
		}
		//#endregion
		//#region lib/client/WorkflowToolbar.js
		/** Compact hierarchy only: the owning WorkflowPanel retains all state, business conditions and handlers. */
		function WorkflowToolbar({ view, onViewChange, historyValue, historyOptions, onHistoryChange, viewingNote, historical = false, readOnly = false, configurationStatus, configurationTone = "unavailable", configurationActions, runStatus, runNote, collaborationControls, primaryAction, runOperations, runtimeDetails, readOnlyReturn }) {
			const menu = (0, react.useRef)(null), summary = (0, react.useRef)(null);
			const mutable = !historical && !readOnly;
			const primary = mutable && (0, react.isValidElement)(primaryAction) && primaryAction.type === "button" ? primaryAction : null;
			const closeMenu = (restoreFocus = false) => {
				if (!menu.current?.open) return;
				menu.current.open = false;
				if (restoreFocus) summary.current?.focus();
			};
			(0, react.useEffect)(() => {
				if (typeof document === "undefined") return;
				const outside = (event) => {
					if (menu.current?.open && !menu.current.contains(event.target)) closeMenu();
				};
				document.addEventListener("pointerdown", outside, true);
				return () => document.removeEventListener("pointerdown", outside, true);
			}, []);
			(0, react.useEffect)(() => {
				closeMenu();
			}, [
				historyValue,
				historical,
				readOnly,
				view
			]);
			const segmentStyle = (selected) => ({
				...uiButton,
				padding: "4px 9px",
				border: 0,
				borderRadius: 6,
				background: selected ? "var(--dsw-alias-bg-base)" : "transparent",
				boxShadow: selected ? "0 0 0 1px var(--dsw-alias-border-l2)" : void 0,
				fontWeight: selected ? 600 : 400
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "rt-workflow-toolbar",
				"data-workflow-toolbar": "",
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: WORKFLOW_TOOLBAR_CSS }),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "rt-workflow-view-row",
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: "rt-workflow-viewing",
							children: [(0, react_jsx_runtime.jsxs)("label", {
								className: "rt-workflow-view-field",
								children: [(0, react_jsx_runtime.jsx)("span", { children: "正在查看" }), (0, react_jsx_runtime.jsx)("select", {
									"aria-label": "正在查看",
									style: {
										...uiInput,
										padding: "5px 8px"
									},
									value: historyValue,
									onChange: (e) => onHistoryChange(e.target.value),
									children: historyOptions.map((option) => (0, react_jsx_runtime.jsx)("option", {
										value: option.value,
										disabled: option.disabled,
										children: option.label
									}, option.value))
								})]
							}), (viewingNote || historical || readOnly) && (0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-view-note",
								children: [historical ? (0, react_jsx_runtime.jsx)("span", {
									className: "rt-workflow-read-only",
									children: "历史记录 · 只读"
								}) : readOnly ? (0, react_jsx_runtime.jsx)("span", {
									className: "rt-workflow-read-only",
									children: "当前会议 · 只读"
								}) : null, viewingNote && (0, react_jsx_runtime.jsx)("span", { children: viewingNote })]
							})]
						}), (0, react_jsx_runtime.jsxs)("div", {
							className: "rt-workflow-display",
							children: [(0, react_jsx_runtime.jsx)("span", { children: "显示方式" }), (0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-segments",
								role: "group",
								"aria-label": "显示方式",
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: segmentStyle(view === "sequence"),
									"aria-pressed": view === "sequence",
									onClick: () => onViewChange("sequence"),
									children: "步骤列表"
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: segmentStyle(view === "graph"),
									"aria-pressed": view === "graph",
									onClick: () => onViewChange("graph"),
									children: "流程图"
								})]
							})]
						})]
					}),
					mutable && (0, react_jsx_runtime.jsxs)("section", {
						className: "rt-workflow-configuration-band",
						"aria-label": "流程配置",
						"data-configuration-tone": configurationTone,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: "rt-workflow-configuration-copy",
							children: [
								(0, react_jsx_runtime.jsx)("strong", { children: "流程配置" }),
								(0, react_jsx_runtime.jsx)("span", {
									className: "rt-workflow-configuration-status",
									role: "status",
									children: configurationStatus
								}),
								(0, react_jsx_runtime.jsx)("small", { children: "保存只记录安排" })
							]
						}), configurationActions && (0, react_jsx_runtime.jsx)("div", {
							className: "rt-workflow-configuration-actions",
							children: configurationActions
						})]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: "rt-workflow-run-band",
						"aria-label": "本轮运行",
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-run-copy",
								children: [(0, react_jsx_runtime.jsx)("strong", { children: runStatus }), runNote && (0, react_jsx_runtime.jsx)("div", {
									className: "rt-workflow-run-note",
									children: runNote
								})]
							}),
							mutable && (collaborationControls || primary || runOperations) && (0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-run-actions",
								children: [
									collaborationControls && (0, react_jsx_runtime.jsx)("div", {
										className: "rt-workflow-collaboration-controls",
										children: collaborationControls
									}),
									primary && (0, react_jsx_runtime.jsx)("div", {
										className: "rt-workflow-primary-slot",
										children: primary
									}),
									runOperations && (0, react_jsx_runtime.jsxs)("details", {
										className: "rt-workflow-operation-menu",
										ref: menu,
										onKeyDown: (e) => {
											if (e.key === "Escape" && menu.current?.open) {
												e.preventDefault();
												e.stopPropagation();
												closeMenu(true);
											}
										},
										children: [(0, react_jsx_runtime.jsxs)("summary", {
											ref: summary,
											children: ["运行操作", (0, react_jsx_runtime.jsx)("span", {
												"aria-hidden": "true",
												children: "⌄"
											})]
										}), (0, react_jsx_runtime.jsx)("div", {
											className: "rt-workflow-operation-items",
											"aria-label": "运行操作选项",
											onClick: (e) => {
												if (e.target.closest?.("button,a[href]")) closeMenu(true);
											},
											children: runOperations
										})]
									})
								]
							}),
							!mutable && readOnlyReturn && (0, react_jsx_runtime.jsx)("div", {
								className: "rt-workflow-read-only-return",
								children: readOnlyReturn
							})
						]
					}),
					runtimeDetails && (0, react_jsx_runtime.jsx)("div", {
						className: "rt-workflow-runtime-details",
						children: runtimeDetails
					})
				]
			});
		}
		const WORKFLOW_TOOLBAR_CSS = `
.rt-workflow-toolbar{--rt-wf-gap:8px;--rt-wf-radius:8px;--rt-wf-secondary:var(--dsw-alias-label-secondary);display:grid;gap:var(--rt-wf-gap);min-width:0;max-width:100%;font-size:13px;line-height:1.5;container:workflow-toolbar/inline-size}
.rt-workflow-toolbar>*{min-width:0}.rt-workflow-toolbar button,.rt-workflow-toolbar select,.rt-workflow-toolbar summary{font:inherit;box-sizing:border-box;max-width:100%}
.rt-workflow-toolbar button{min-height:30px;overflow-wrap:anywhere}.rt-workflow-toolbar button:disabled{cursor:default;opacity:.55}
.rt-workflow-toolbar :is(button,select,summary):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.rt-workflow-view-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px}
.rt-workflow-view-field{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:var(--rt-wf-gap);max-width:460px}.rt-workflow-view-field>span,.rt-workflow-display>span{font-size:12px;color:var(--rt-wf-secondary);white-space:nowrap}.rt-workflow-view-field select{min-width:0;width:100%;text-overflow:ellipsis}
.rt-workflow-view-note{display:flex;gap:8px;flex-wrap:wrap;color:var(--rt-wf-secondary);font-size:12px;margin-top:3px;overflow-wrap:anywhere}.rt-workflow-read-only{font-weight:600}
.rt-workflow-display{display:flex;align-items:center;gap:var(--rt-wf-gap);min-width:0}
.rt-workflow-segments{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--rt-wf-radius);background:var(--dsw-alias-interactive-bg-hover);padding:3px;min-width:170px}.rt-workflow-segments>button{white-space:nowrap;color:inherit}
.rt-workflow-configuration-band,.rt-workflow-run-band{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:var(--rt-wf-gap);padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--rt-wf-radius);background:var(--dsw-alias-interactive-bg-hover)}
.rt-workflow-configuration-copy{display:flex;align-items:baseline;gap:var(--rt-wf-gap);flex-wrap:wrap;min-width:0}.rt-workflow-configuration-copy>strong,.rt-workflow-run-copy>strong{font-size:13px;font-weight:600}.rt-workflow-configuration-copy>small{color:var(--rt-wf-secondary);font-size:12px}
.rt-workflow-configuration-status{display:inline-flex;align-items:center;gap:5px;font-size:12px;overflow-wrap:anywhere}.rt-workflow-configuration-status::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary);flex:none}
.rt-workflow-configuration-band[data-configuration-tone=dirty] .rt-workflow-configuration-status{color:var(--dsw-alias-state-warning-primary,#a55d00)}.rt-workflow-configuration-band[data-configuration-tone=dirty] .rt-workflow-configuration-status::before{background:currentColor}
.rt-workflow-configuration-band[data-configuration-tone=saved] .rt-workflow-configuration-status{color:var(--rt-wf-secondary)}
.rt-workflow-configuration-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}.rt-workflow-configuration-actions>button{padding:4px 9px}.rt-workflow-configuration-actions>button:last-child:not(:first-child){border-color:transparent!important;background:transparent!important}
.rt-workflow-run-copy{min-width:0;overflow-wrap:anywhere}.rt-workflow-run-note{font-size:12px;color:var(--rt-wf-secondary);margin-top:3px;line-height:1.5}.rt-workflow-run-note p{margin:0}
.rt-workflow-run-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:start;justify-content:flex-end;min-width:0;max-width:100%}.rt-workflow-collaboration-controls{flex:1 1 100%;min-width:0;font-size:12px}.rt-workflow-collaboration-controls label{display:flex;align-items:center;gap:6px;min-width:0}.rt-workflow-collaboration-controls select{min-width:0;flex:1}
.rt-workflow-primary-slot{min-width:0;max-width:100%}.rt-workflow-primary-slot>button{padding:5px 10px;white-space:normal;min-height:32px}
.rt-workflow-primary-slot>[data-workflow-primary]{background:var(--dsw-alias-state-business-primary)!important;border-color:var(--dsw-alias-state-business-primary)!important;color:var(--dsw-alias-label-on-color,#fff)!important}
.rt-workflow-operation-menu{min-width:0;max-width:100%;font-size:13px}
.rt-workflow-operation-menu>summary{display:flex;align-items:center;justify-content:center;gap:5px;list-style:none;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--rt-wf-radius);padding:5px 9px;min-height:32px;background:var(--dsw-alias-bg-base);white-space:nowrap}.rt-workflow-operation-menu>summary::-webkit-details-marker{display:none}.rt-workflow-operation-menu[open]>summary>span{transform:rotate(180deg)}
.rt-workflow-operation-items{display:grid;gap:6px;max-height:min(220px,40vh);overflow:auto;overscroll-behavior:contain;padding:8px;margin-top:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--rt-wf-radius);background:var(--dsw-alias-bg-base);min-width:0}.rt-workflow-operation-items button{width:100%;text-align:left;white-space:normal;padding:5px 8px}
.rt-workflow-read-only-return{min-width:0}.rt-workflow-read-only-return>button{padding:4px 9px;background:var(--dsw-alias-bg-base)!important;color:inherit!important}
.rt-workflow-runtime-details{min-width:0;font-size:12px;color:var(--rt-wf-secondary)}.rt-workflow-runtime-details summary{cursor:pointer}
@container workflow-toolbar (max-width:560px){.rt-workflow-view-row{grid-template-columns:minmax(0,1fr);gap:8px}.rt-workflow-view-field{max-width:none}.rt-workflow-display{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px}.rt-workflow-segments{min-width:0}.rt-workflow-configuration-band,.rt-workflow-run-band{grid-template-columns:minmax(0,1fr);align-items:start}.rt-workflow-run-actions{justify-content:stretch}.rt-workflow-primary-slot{flex:1 1 140px}.rt-workflow-primary-slot>button{width:100%}.rt-workflow-read-only-return>button{width:100%}}
@container workflow-toolbar (max-width:320px){.rt-workflow-view-field{grid-template-columns:minmax(0,1fr);gap:3px}.rt-workflow-primary-slot{flex-basis:100%}.rt-workflow-operation-menu{width:100%}.rt-workflow-operation-items{max-height:min(180px,35vh)}}
`;
		//#endregion
		//#region lib/client/WorkflowInspector.js
		function WorkflowInspector({ definition, node, members, messages, assets, run, readOnly = false, view = "graph", onChange, onRemove }) {
			const [materials, setMaterials] = (0, react.useState)();
			const locked = readOnly || run?.status === "active" && run.activations.some((a) => a.nodeId === node.id && !a.temporary);
			const contextKey = JSON.stringify([
				definition.id,
				node.id,
				run?.id,
				!!locked,
				view,
				definition.executionPolicy
			]), owner = (0, react.useRef)({
				key: contextKey,
				epoch: 0,
				present: true,
				alive: true
			});
			if (owner.current.key !== contextKey) owner.current = {
				...owner.current,
				key: contextKey,
				epoch: owner.current.epoch + 1
			};
			owner.current.present = definition.nodes.some((n) => n.id === node.id);
			(0, react.useEffect)(() => {
				owner.current.alive = true;
				return () => {
					owner.current.alive = false;
					owner.current.epoch++;
				};
			}, []);
			(0, react.useEffect)(() => {
				setMaterials(void 0);
			}, [contextKey]);
			const current = owner.current, valid = (captured) => owner.current.alive && owner.current.present && !locked && owner.current.key === captured.key && owner.current.epoch === captured.epoch;
			const change = (p) => {
				if (valid(current)) onChange({
					...node,
					...p
				});
			};
			const has = (b) => node.inputs.some((x) => JSON.stringify(x) === JSON.stringify(b));
			const toggle = (b) => change({ inputs: has(b) ? node.inputs.filter((x) => JSON.stringify(x) !== JSON.stringify(b)) : [...node.inputs, b] });
			return (0, react_jsx_runtime.jsxs)("aside", {
				"aria-label": "节点设置",
				className: "rt-workflow-inspector",
				style: {
					minWidth: 0,
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					padding: 12,
					display: "flex",
					flexDirection: "column",
					gap: 10,
					maxHeight: 640,
					overflowY: "auto"
				},
				children: [
					(0, react_jsx_runtime.jsx)("strong", { children: "环节设置" }),
					locked && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: "此环节已开始，要求和输入已冻结。可查看记录，或通过返工建立新一轮。"
					}),
					(0, react_jsx_runtime.jsxs)("fieldset", {
						disabled: locked,
						style: {
							border: 0,
							padding: 0,
							margin: 0,
							minWidth: 0,
							display: "flex",
							flexDirection: "column",
							gap: 10
						},
						children: [
							(0, react_jsx_runtime.jsxs)("label", { children: ["环节名称", (0, react_jsx_runtime.jsx)("input", {
								"aria-label": "环节名称",
								style: uiInput,
								value: node.title,
								onChange: (e) => change({ title: e.target.value })
							})] }),
							(0, react_jsx_runtime.jsxs)("label", { children: ["环节类型", (0, react_jsx_runtime.jsxs)("select", {
								"aria-label": "环节类型",
								style: uiInput,
								value: node.kind,
								onChange: (e) => change({
									kind: e.target.value,
									memberIds: [],
									decision: false
								}),
								children: [
									(0, react_jsx_runtime.jsx)("option", {
										value: "work",
										children: "成员处理"
									}),
									(0, react_jsx_runtime.jsx)("option", {
										value: "join",
										children: "汇合／人工选择"
									}),
									(0, react_jsx_runtime.jsx)("option", {
										value: "minutes",
										children: "秘书整理"
									})
								]
							})] }),
							node.kind === "work" && (0, react_jsx_runtime.jsxs)("fieldset", {
								style: { minWidth: 0 },
								children: [
									(0, react_jsx_runtime.jsx)("legend", { children: "由谁处理" }),
									members.map((m) => (0, react_jsx_runtime.jsxs)("label", {
										style: {
											display: "block",
											padding: 4
										},
										children: [(0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: node.memberIds.includes(m.id),
											onChange: () => change({ memberIds: node.memberIds.includes(m.id) ? node.memberIds.filter((id) => id !== m.id) : [...node.memberIds, m.id] })
										}), m.name]
									}, m.id)),
									!members.length && (0, react_jsx_runtime.jsx)("p", { children: "请先在成员页加入原窗口。" })
								]
							}),
							node.kind === "join" && (0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: !!node.decision,
								onChange: (e) => change({ decision: e.target.checked })
							}), "汇合后由我选择路线"] }),
							(0, react_jsx_runtime.jsxs)("label", { children: [node.kind === "join" ? "主持备注" : "本环节要求", (0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": "环节要求",
								rows: 3,
								style: uiInput,
								value: node.instruction,
								onChange: (e) => change({ instruction: e.target.value })
							})] }),
							view === "sequence" && node.requireReview === true && (0, react_jsx_runtime.jsx)("small", { children: "此配置保留成果验收要求；正式提交后仍需在结果处验收，记录不会自动改为通过。" }),
							view === "graph" && node.kind === "work" && (0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: node.requireReview === true,
								onChange: (e) => change({ requireReview: e.target.checked })
							}), "结果经主持人验收通过后，才可用于下游（未勾选仍会拦截明确退回的结果）"] }),
							view === "graph" && (0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: node.includeIncoming,
								onChange: (e) => change({
									includeIncoming: e.target.checked,
									...definition.executionPolicy === "per-node-v1" && !e.target.checked ? { autoReceiveAndRun: false } : {}
								})
							}), "接收所走上游环节的正式结果"] }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => {
									if (valid(current)) {
										owner.current.epoch++;
										setMaterials({
											key: current.key,
											epoch: current.epoch
										});
									}
								},
								children: "选择消息、附件与正式结果"
							}),
							materials && valid(materials) && (0, react_jsx_runtime.jsx)(MaterialPicker, {
								messages,
								assets,
								value: {
									messageIds: node.inputs.filter((x) => x.kind === "message").map((x) => x.id),
									assetIds: node.inputs.filter((x) => x.kind === "asset").map((x) => x.id)
								},
								names: Object.fromEntries(members.map((m) => [m.id, m.name])),
								onApply: (v) => {
									if (!valid(materials)) return;
									change({ inputs: [
										...node.inputs.filter((x) => x.kind !== "message" && x.kind !== "asset"),
										...v.messageIds.map((id) => ({
											kind: "message",
											id
										})),
										...v.assetIds.map((id) => ({
											kind: "asset",
											id
										}))
									] });
									owner.current.epoch++;
									setMaterials(void 0);
								},
								onCancel: () => {
									if (valid(materials)) {
										owner.current.epoch++;
										setMaterials(void 0);
									}
								}
							}, `${materials.key}:${materials.epoch}`),
							(0, react_jsx_runtime.jsxs)("details", { children: [
								(0, react_jsx_runtime.jsx)("summary", { children: "指定节点／旧轮结果" }),
								(0, react_jsx_runtime.jsx)("p", { children: "仅使用正式提交。明确选择上一轮时，没有旧轮会提示缺失。" }),
								definition.nodes.filter((n) => n.id !== node.id).map((n) => (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("strong", { children: n.title }), ["current", "previous"].map((round) => (0, react_jsx_runtime.jsxs)("label", {
									style: { display: "block" },
									children: [(0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: has({
											kind: "node",
											nodeId: n.id,
											round
										}),
										onChange: () => toggle({
											kind: "node",
											nodeId: n.id,
											round
										})
									}), round === "current" ? "本轮" : "上一轮"]
								}, round))] }, n.id))
							] }),
							run && (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "明确沿用历史执行" }), run.activations.filter((a) => !a.skipped && a.nodeId !== node.id && (a.releaseId || a.minutesId)).map((a) => (0, react_jsx_runtime.jsxs)("label", {
								style: { display: "block" },
								children: [
									(0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: has({
											kind: "activation",
											activationId: a.id
										}),
										onChange: () => toggle({
											kind: "activation",
											activationId: a.id
										})
									}),
									a.node.title,
									" · 第",
									a.round || 1,
									"轮／尝试",
									a.attempt,
									" · 定义v",
									a.definitionRevision
								]
							}, a.id))] }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: onRemove,
								children: "删除此环节及其连线"
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/workflow-step-policy.js
		const STEP_POLICY = "per-node-v1";
		/** A future draft only: never alter an existing run or imply execution. */
		function stepPolicyDraft(definition) {
			const known = definition.executionPolicy === STEP_POLICY;
			return {
				...definition,
				executionPolicy: STEP_POLICY,
				nodes: definition.nodes.map((node) => ({
					...node,
					autoReceiveAndRun: known ? node.autoReceiveAndRun === true : false
				}))
			};
		}
		//#endregion
		//#region lib/workflow-editor.js
		function mutable(ids, run) {
			if (run?.status === "active" && run.activations.some((a) => !a.temporary && ids.includes(a.nodeId))) throw Error("已开始的环节及其连线已冻结；请结束本次流程后修改。");
		}
		function editWorkflowEdge(d, edge, replaceId, run) {
			const old = d.edges.find((e) => e.id === replaceId);
			mutable([
				edge.from,
				edge.to,
				...old ? [old.from, old.to] : []
			], run);
			if (replaceId && !old) throw Error("所选连线已不存在");
			if (edge.from === edge.to) throw Error("不能把环节连接到自己；返工请连接到评审环节。");
			if (d.edges.some((e) => e.id !== replaceId && e.from === edge.from && e.to === edge.to && e.kind === edge.kind)) throw Error("这两个环节之间已有同类型连线，不能重复添加。");
			const from = d.nodes.find((n) => n.id === edge.from), to = d.nodes.find((n) => n.id === edge.to);
			if (!from || !to) throw Error("连线起点或终点不存在");
			if (edge.kind === "choice" && (!from.decision || from.kind !== "join" || !edge.label?.trim())) throw Error("人工选择出口需要从“汇合／人工选择”环节引出，并填写出口名称。");
			if (edge.kind === "choice" && d.edges.some((e) => e.id !== replaceId && e.from === edge.from && e.kind === "choice" && e.label?.trim() === edge.label?.trim())) throw Error("同一人工选择的出口名称不能重复。");
			if (edge.kind === "flow" && from.decision) throw Error("人工决策环节的出口必须使用“由我选择”，不能直接顺序连接。");
			const next = structuredClone(d), clean = {
				id: replaceId ?? edge.id,
				from: edge.from,
				to: edge.to,
				kind: edge.kind,
				...edge.kind === "choice" ? { label: edge.label.trim() } : {},
				...edge.kind === "loop" ? { loopId: edge.loopId } : {}
			};
			next.edges = replaceId ? next.edges.map((e) => e.id === replaceId ? clean : e) : [...next.edges, clean];
			if (clean.kind !== "loop") {
				const visited = /* @__PURE__ */ new Set(), reachesSource = (id) => {
					if (id === clean.from) return true;
					if (visited.has(id)) return false;
					visited.add(id);
					return next.edges.some((e) => e.kind !== "loop" && e.from === id && reachesSource(e.to));
				};
				if (reachesSource(clean.to)) throw Error("除声明的回路返回边外，流程不能有环");
			}
			if (old?.kind === "loop" && (clean.kind !== "loop" || old.loopId !== clean.loopId || old.to !== clean.to)) next.loops = next.loops.map((l) => l.id === old.loopId ? {
				...l,
				entryIds: l.entryIds.filter((id) => id !== old.to || next.edges.some((e) => e.kind === "loop" && e.loopId === l.id && e.to === id))
			} : l);
			if (clean.kind === "loop") {
				const loop = next.loops.find((l) => l.id === clean.loopId);
				if (!loop || loop.advanceId !== clean.from || !loop.nodeIds.includes(clean.to) || clean.to === loop.advanceId || clean.to === loop.gateId) throw Error("返回线必须从本回路的修改环节连到评审入口；请先配置返工范围。");
				if (!loop.entryIds.includes(clean.to)) loop.entryIds.push(clean.to);
			}
			const signature = (x) => `${x.code}/${x.nodeId ?? ""}/${x.edgeId ?? ""}`;
			const before = new Set(validateWorkflowGraph(d).map(signature));
			const hard = /* @__PURE__ */ new Set([
				"edge-id",
				"dangling",
				"self-cycle",
				"edge-kind",
				"duplicate-edge",
				"cycle",
				"loop-edge",
				"loop-entry",
				"loop-exit",
				"loop-region",
				"loop-advance",
				"nested-loop",
				"group-overlap"
			]);
			const introduced = validateWorkflowGraph(next).find((x) => hard.has(x.code) && !before.has(signature(x)));
			if (introduced) throw Error(introduced.message);
			return next;
		}
		function removeWorkflowEdge(d, id, run) {
			const edge = d.edges.find((e) => e.id === id);
			if (!edge) throw Error("连线不存在");
			mutable([edge.from, edge.to], run);
			const next = structuredClone(d);
			next.edges = next.edges.filter((e) => e.id !== id);
			if (edge.kind === "loop") next.loops = next.loops.map((l) => l.id === edge.loopId ? {
				...l,
				entryIds: l.entryIds.filter((x) => x !== edge.to || next.edges.some((e) => e.kind === "loop" && e.loopId === l.id && e.to === x))
			} : l);
			return next;
		}
		function removeWorkflowNode(d, id, run) {
			mutable([id, ...d.edges.filter((e) => e.from === id || e.to === id).flatMap((e) => [e.from, e.to])], run);
			if (run?.status === "active" && (d.entryId === id || d.loops.some((l) => l.nodeIds.includes(id)) || d.parallelGroups.some((g) => g.sourceId === id || g.joinId === id || g.branchIds.includes(id)))) throw Error("运行中的入口、返工范围和并行分组不能删除；请先结束流程。");
			const next = structuredClone(d), removedLoops = new Set(next.loops.filter((l) => l.gateId === id || l.advanceId === id).map((l) => l.id));
			next.nodes = next.nodes.filter((n) => n.id !== id).map((n) => ({
				...n,
				inputs: n.inputs.filter((b) => b.kind !== "node" || b.nodeId !== id)
			}));
			next.edges = next.edges.filter((e) => e.from !== id && e.to !== id && (!e.loopId || !removedLoops.has(e.loopId)));
			next.loops = next.loops.filter((l) => !removedLoops.has(l.id)).map((l) => ({
				...l,
				nodeIds: l.nodeIds.filter((x) => x !== id),
				entryIds: l.entryIds.filter((x) => x !== id)
			}));
			next.parallelGroups = next.parallelGroups.filter((g) => g.sourceId !== id && g.joinId !== id).map((g) => ({
				...g,
				branchIds: g.branchIds.filter((x) => x !== id)
			})).filter((g) => g.branchIds.length >= 2);
			delete next.positions[id];
			if (next.entryId === id) next.entryId = next.nodes.find((n) => !next.edges.some((e) => e.to === n.id && e.kind !== "loop"))?.id ?? "";
			return next;
		}
		//#endregion
		//#region lib/workflow-budget.js
		/** Grants extend only cumulative starts. Per-member per-round retry limits stay intact. */
		function workflowBudget(run) {
			return {
				workAttempts: run.definition.limits.workAttempts + (run.budgetGrants ?? []).reduce((n, g) => n + g.work, 0),
				minutesStarts: run.definition.limits.minutesStarts + (run.budgetGrants ?? []).reduce((n, g) => n + g.minutes, 0)
			};
		}
		//#endregion
		//#region lib/client/WorkflowPanel.js
		const id = () => crypto.randomUUID();
		const blank = () => makeStepsDefinition(id());
		function template(members) {
			const d = {
				...blank(),
				steps: void 0
			}, work = (nodeId, title, index) => ({
				id: nodeId,
				title,
				kind: "work",
				memberIds: members[index] ? [members[index].id] : [],
				instruction: "根据所选资料处理并正式提交结果",
				inputs: [],
				includeIncoming: true,
				requireReview: false,
				autoReceiveAndRun: false
			});
			d.entryId = "proposal";
			d.title = "方案评审与返工";
			d.nodes = [
				work("proposal", "提出方案", 0),
				work("tech", "技术评审", 1),
				work("budget", "预算评审", 2),
				{
					id: "gate",
					title: "汇合并决定",
					kind: "join",
					memberIds: [],
					instruction: "",
					inputs: [],
					includeIncoming: true,
					decision: true
				},
				work("revise", "修改方案", 0),
				{
					id: "minutes",
					title: "整理纪要",
					kind: "minutes",
					memberIds: [],
					instruction: "基于本轮结果整理决策、任务进展与未决事项",
					inputs: [],
					includeIncoming: true
				}
			];
			d.edges = [
				{
					id: "e1",
					from: "proposal",
					to: "tech",
					kind: "flow"
				},
				{
					id: "e2",
					from: "proposal",
					to: "budget",
					kind: "flow"
				},
				{
					id: "e3",
					from: "tech",
					to: "gate",
					kind: "flow"
				},
				{
					id: "e4",
					from: "budget",
					to: "gate",
					kind: "flow"
				},
				{
					id: "approve",
					from: "gate",
					to: "minutes",
					kind: "choice",
					label: "通过"
				},
				{
					id: "rework",
					from: "gate",
					to: "revise",
					kind: "choice",
					label: "需要修改"
				},
				{
					id: "back1",
					from: "revise",
					to: "tech",
					kind: "loop",
					loopId: "review"
				},
				{
					id: "back2",
					from: "revise",
					to: "budget",
					kind: "loop",
					loopId: "review"
				}
			];
			d.parallelGroups = [{
				id: "parallel",
				sourceId: "proposal",
				branchIds: ["tech", "budget"],
				joinId: "gate"
			}];
			d.loops = [{
				id: "review",
				nodeIds: [
					"tech",
					"budget",
					"gate",
					"revise"
				],
				entryIds: ["tech", "budget"],
				gateId: "gate",
				advanceId: "revise",
				maxRounds: 3
			}];
			d.positions = {
				proposal: {
					x: 25,
					y: 175
				},
				tech: {
					x: 300,
					y: 35
				},
				budget: {
					x: 300,
					y: 250
				},
				gate: {
					x: 585,
					y: 175
				},
				revise: {
					x: 585,
					y: 440
				},
				minutes: {
					x: 875,
					y: 175
				}
			};
			return d;
		}
		function WorkflowPanel({ meeting, members, onChanged, onOpenSession, onNavigate }) {
			const { readLocal, writeLocal, meetingCall: rawMeetingCall } = scopedLocal((0, react.useRef)(localScopeId()).current);
			const { meetingId, workflow, messages = [], assets = [], releases = [] } = meeting;
			const key = `workflow-editor.${meetingId}`;
			const legacyActive = !!workflow && workflowSchemaSupported(workflow.schemaVersion) && workflow.runs.some((r) => r.status === "active" && r.executionPolicy !== "per-node-v1");
			const normalizeDraft = (definition) => isStepsDefinition(definition) || legacyActive || workflow && !workflowSchemaSupported(workflow.schemaVersion) ? definition : stepPolicyDraft(definition);
			const [draft, setDraft] = (0, react.useState)(() => {
				const saved = readLocal(key, void 0) ?? {
					definition: workflow?.draft ?? blank(),
					baseRevision: workflow?.draft?.revision
				};
				return {
					...saved,
					definition: normalizeDraft(saved.definition)
				};
			});
			const [dirty, setDirty] = (0, react.useState)(() => !!readLocal(key, void 0) || !!workflow?.draft && !legacyActive && workflow.draft.executionPolicy !== "per-node-v1"), [selected, setSelected] = (0, react.useState)(() => readLocal(`workflow-selection.${meetingId}`, isStepsDefinition(draft.definition) ? "" : draft.definition.entryId)), [mode, setMode] = (0, react.useState)(() => readLocal(`workflow-view.${meetingId}`, "sequence") === "graph" ? "graph" : "sequence");
			const [zoom, setZoom] = (0, react.useState)(.8), [issues, setIssues] = (0, react.useState)([]), [error, setError] = (0, react.useState)(""), [notice, setNotice] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false);
			const [fitRequest, setFitRequest] = (0, react.useState)(0), [manualZoomRequest, setManualZoomRequest] = (0, react.useState)(0);
			const [preview, setPreviewRaw] = (0, react.useState)(), [historyId, setHistoryId] = (0, react.useState)("");
			const [historyProjection, setHistoryProjection] = (0, react.useState)(), [historyRetry, setHistoryRetry] = (0, react.useState)(0);
			const historyRequest = (0, react.useRef)(0), localPersistence = useLocalPersistence();
			const [confirm, setConfirmRaw] = (0, react.useState)(), [supplement, setSupplement] = (0, react.useState)();
			const [collaboration, setCollaboration] = (0, react.useState)(() => readLocal(`workflow-collaboration.${meetingId}`, "manual"));
			const [stage, setStage] = (0, react.useState)(() => readLocal(`workflow-stage.${meetingId}`, void 0)), [publishedCards, setPublishedCards] = (0, react.useState)([]);
			(0, react.useEffect)(() => {
				writeLocal(`workflow-stage.${meetingId}`, stage);
			}, [stage, meetingId]);
			const [revisionTarget, setRevisionTarget] = (0, react.useState)();
			const revisionTask = releases.flatMap((r) => r.tasks).find((t) => t.taskId === revisionTarget);
			const [bypass, setBypass] = (0, react.useState)();
			const [from, setFrom] = (0, react.useState)(""), [to, setTo] = (0, react.useState)(""), [edgeKind, setEdgeKind] = (0, react.useState)("flow"), [edgeLabel, setEdgeLabel] = (0, react.useState)(""), [edgeLoop, setEdgeLoop] = (0, react.useState)("");
			const [edgeDraft, setEdgeDraft] = (0, react.useState)(), [extraWork, setExtraWork] = (0, react.useState)(30), [extraMinutes, setExtraMinutes] = (0, react.useState)(0);
			const [budgetRequest, setBudgetRequest] = (0, react.useState)(() => readLocal(`workflow-budget-request.${meetingId}`, void 0));
			const busyRef = (0, react.useRef)(false), container = (0, react.useRef)(null), previewRef = (0, react.useRef)(null), readySectionRef = (0, react.useRef)(null), contentRef = (0, react.useRef)(null), edgeSettingsRef = (0, react.useRef)(null);
			const active = workflow && workflowSchemaSupported(workflow.schemaVersion) ? workflow.runs.find((r) => r.status === "active") : void 0, run = historyId ? workflow?.runs.find((r) => r.id === historyId) : active;
			const historical = !!historyId && historyId !== active?.id, missingHistory = historical && !run, d = historical && run ? run.definition : draft.definition;
			const matchingHistory = historyProjection?.meetingId === meetingId && historyProjection?.runId === historyId ? historyProjection : void 0;
			const views = historical ? matchingHistory?.phase === "ready" ? matchingHistory.views : [] : active ? meeting.workflowViews ?? [] : [];
			const lastRun = workflow && workflowSchemaSupported(workflow.schemaVersion) ? workflow.runs.at(-1) : void 0, nextDraft = !historyId && !active && !!lastRun;
			const node = missingHistory || workflow && !workflowSchemaSupported(workflow.schemaVersion) ? void 0 : d.nodes.find((n) => n.id === selected && !n.stepsInternal), view = views.find((v) => v.nodeId === selected), activation = run?.activations.find((a) => a.id === view?.activationId), release = releases.find((r) => r.id === activation?.releaseId);
			const perNode = d.executionPolicy === STEP_POLICY, freeSteps = isStepsDefinition(d), sequenceMode = mode === "sequence", startIssues = freeSteps ? validateWorkflowGraph(d) : [];
			const frozen = !!active, readOnly = historical || !!meeting.archivedAt || !!workflow && !workflowSchemaSupported(workflow.schemaVersion);
			const compatibleVersion = !workflow || workflowSchemaSupported(workflow.schemaVersion) ? "supported" : workflow.schemaVersion;
			const mutationKey = JSON.stringify([
				meetingId,
				historyId,
				readOnly,
				compatibleVersion,
				d.id
			]), alive = (0, react.useRef)(true);
			const mutableView = (0, react.useRef)({
				key: mutationKey,
				epoch: 0,
				readOnly
			});
			if (mutableView.current.key !== mutationKey) mutableView.current = {
				key: mutationKey,
				epoch: mutableView.current.epoch + 1,
				readOnly
			};
			const mutationOwner = mutableView.current, canMutate = () => alive.current && !mutableView.current.readOnly && mutableView.current.key === mutationOwner.key && mutableView.current.epoch === mutationOwner.epoch;
			const setConfirm = (value) => {
				if (canMutate()) setConfirmRaw(value);
			};
			const previewKey = readOnly ? "readonly:" + historyId : JSON.stringify([
				d.id,
				d.revision,
				workflowSemantic(d),
				dirty
			]);
			const previewEpoch = (0, react.useRef)({
				key: previewKey,
				version: 0
			});
			if (previewEpoch.current.key !== previewKey) previewEpoch.current = {
				key: previewKey,
				version: previewEpoch.current.version + 1
			};
			const capturedPreviewEpoch = previewEpoch.current.version, previewCurrent = () => canMutate() && previewEpoch.current.version === capturedPreviewEpoch;
			const setPreview = (value) => {
				if (canMutate() && (value === void 0 || previewCurrent())) setPreviewRaw(value);
			};
			(0, react.useEffect)(() => {
				setPreviewRaw(void 0);
			}, [previewKey]);
			const meetingCall = (mid, actionName, body = {}) => {
				if (actionName !== "workflow-view" && !canMutate()) return Promise.reject(Error("当前查看对象已变化或只读，未执行流程操作"));
				return rawMeetingCall(mid, actionName, body).then((value) => {
					if (actionName !== "workflow-view" && !canMutate()) throw Error("当前查看对象已变化，保留已接受的服务端操作；未继续本地修改");
					return value;
				});
			};
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				if (readOnly) {
					setPreviewRaw(void 0);
					setConfirmRaw(void 0);
					setBypass(void 0);
					setRevisionTarget(void 0);
					setSupplement(void 0);
					setEdgeDraft(void 0);
				}
			}, [readOnly]);
			const changeHistory = (value) => {
				const nextReadOnly = !!value && value !== active?.id || !!meeting.archivedAt || !!workflow && !workflowSchemaSupported(workflow.schemaVersion);
				mutableView.current = {
					key: JSON.stringify([
						meetingId,
						value,
						nextReadOnly,
						compatibleVersion,
						value ? workflow?.runs.find((r) => r.id === value)?.definition.id ?? d.id : draft.definition.id
					]),
					epoch: mutableView.current.epoch + 1,
					readOnly: nextReadOnly
				};
				setHistoryId(value);
				setPreviewRaw(void 0);
				setConfirmRaw(void 0);
				setBypass(void 0);
				setRevisionTarget(void 0);
				setSupplement(void 0);
				setEdgeDraft(void 0);
				setError("");
				setNotice("");
			};
			const inspectorKey = JSON.stringify([
				meetingId,
				d.id,
				selected,
				mode,
				d.executionPolicy,
				readOnly,
				active?.id,
				!!active?.activations.some((a) => a.nodeId === selected && !a.temporary)
			]), inspectorIdentity = (0, react.useRef)({
				key: inspectorKey,
				epoch: 0
			});
			if (inspectorIdentity.current.key !== inspectorKey) inspectorIdentity.current = {
				key: inspectorKey,
				epoch: inspectorIdentity.current.epoch + 1
			};
			const inspectorOwner = inspectorIdentity.current, validInspector = () => canMutate() && inspectorIdentity.current.key === inspectorOwner.key && inspectorIdentity.current.epoch === inspectorOwner.epoch;
			const budget = run ? workflowBudget(run) : void 0, admissionBlocked = !!run?.paused && (!run.automatic || run.automatic.pauseReason === "主持人暂停后续执行" || workflowNeedsExplicitResume(run));
			const edgeLocked = readOnly || !!(edgeDraft && active?.activations.some((a) => !a.temporary && (a.nodeId === edgeDraft.from || a.nodeId === edgeDraft.to)));
			const name = (memberId) => members.find((m) => m.id === memberId)?.name ?? memberId;
			(0, react.useEffect)(() => {
				if (dirty) writeLocal(key, draft);
			}, [
				draft,
				dirty,
				key
			]);
			(0, react.useEffect)(() => {
				writeLocal(`workflow-budget-request.${meetingId}`, budgetRequest);
			}, [budgetRequest, meetingId]);
			(0, react.useEffect)(() => {
				if (!dirty && workflow?.draft) setDraft({
					definition: normalizeDraft(workflow.draft),
					baseRevision: workflow.draft.revision
				});
			}, [
				workflow?.draft?.revision,
				workflow?.draft?.layoutRevision,
				dirty
			]);
			(0, react.useEffect)(() => {
				writeLocal(`workflow-selection.${meetingId}`, selected);
				writeLocal(`workflow-view.${meetingId}`, mode);
			}, [
				selected,
				mode,
				meetingId
			]);
			(0, react.useEffect)(() => {
				const request = ++historyRequest.current;
				if (!historyId || !historical) {
					setHistoryProjection(void 0);
					return;
				}
				let alive = true;
				setHistoryProjection({
					meetingId,
					runId: historyId,
					phase: "loading",
					views: []
				});
				meetingCall(meetingId, "workflow-view", { runId: historyId }).then((v) => {
					if (alive && request === historyRequest.current) setHistoryProjection({
						meetingId,
						runId: historyId,
						phase: "ready",
						views: v.views
					});
				}).catch((e) => {
					if (alive && request === historyRequest.current) setHistoryProjection({
						meetingId,
						runId: historyId,
						phase: "error",
						views: [],
						error: e instanceof Error ? e.message : String(e)
					});
				});
				return () => {
					alive = false;
				};
			}, [
				historyId,
				meetingId,
				historical,
				historyRetry
			]);
			(0, react.useEffect)(() => {
				if (preview) previewRef.current?.scrollIntoView({ block: "nearest" });
			}, [preview]);
			(0, react.useEffect)(() => {
				if (edgeDraft) edgeSettingsRef.current?.scrollIntoView({ block: "nearest" });
			}, [edgeDraft?.id]);
			const action = async (fn) => {
				if (!canMutate() || busyRef.current) return;
				busyRef.current = true;
				setBusy(true);
				setError("");
				try {
					await fn();
				} catch (e) {
					if (canMutate()) setError(e instanceof Error ? e.message : String(e));
				} finally {
					busyRef.current = false;
					if (alive.current) setBusy(false);
				}
			};
			const call = async (actionName, body) => {
				if (!canMutate()) return;
				await meetingCall(meetingId, actionName, body);
				if (canMutate()) await onChanged();
			};
			const edit = (next, layoutOnly = false) => {
				if (!canMutate()) return;
				previewEpoch.current.version++;
				setConfirmRaw(void 0);
				setDraft((x) => ({
					...x,
					definition: normalizeDraft(next)
				}));
				setDirty(true);
				setIssues([]);
				if (!layoutOnly) setPreview(void 0);
			};
			const applyEdge = (edge, existing) => {
				if (!canMutate()) return;
				try {
					setError("");
					edit(editWorkflowEdge(d, edge, existing, active));
					setEdgeDraft(void 0);
					setNotice("连线已修改，保存后生效；没有启动任务。");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const selectEdge = (edgeId) => {
				const e = d.edges.find((e) => e.id === edgeId);
				if (e) setEdgeDraft({
					...e,
					existing: true
				});
			};
			const connect = (from, to) => {
				if (!canMutate()) return;
				const loop = d.loops.find((l) => l.advanceId === from && l.nodeIds.includes(to)), choice = d.nodes.find((n) => n.id === from)?.decision;
				setEdgeDraft({
					id: id(),
					from,
					to,
					kind: loop ? "loop" : choice ? "choice" : "flow",
					...loop ? { loopId: loop.id } : {},
					...choice ? { label: "" } : {}
				});
				setError("");
			};
			const deleteEdge = (edgeId) => {
				if (!canMutate()) return;
				try {
					edit(removeWorkflowEdge(d, edgeId, active));
					setEdgeDraft(void 0);
					setNotice("连线已移除；请保存流程。");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				}
			};
			const save = (confirmedFuture = false) => action(async () => {
				if (active?.automatic && dirty && JSON.stringify(workflowSemantic(d)) !== JSON.stringify(workflowSemantic(active.definition)) && !confirmedFuture) {
					setConfirm({
						text: "确认更新自动协作尚未开始的环节、要求和资料？后续自动接力将使用这次配置；历史激活的节点与输入保持冻结。",
						action: async () => {
							const result = await meetingCall(meetingId, "workflow-save", {
								definition: d,
								expectedRevision: draft.baseRevision,
								confirmedFuture: true
							});
							setDraft({
								definition: result.definition,
								baseRevision: result.definition.revision
							});
							setDirty(false);
							writeLocal(key, void 0);
							await onChanged();
							setNotice(active?.executionPolicy === "per-node-v1" ? "未来环节规则已保存，本轮暂停；核对后确认继续，保存本身没有开始任务。" : "尚未开始的环节已更新；历史输入没有变化。");
						}
					});
					return;
				}
				const errors = validateWorkflowDraft(d);
				setIssues(errors);
				if (errors.length) {
					setNotice("请先处理配置问题，尚未保存。");
					return;
				}
				const result = await meetingCall(meetingId, "workflow-save", {
					definition: d,
					expectedRevision: draft.baseRevision,
					confirmedFuture
				});
				setDraft({
					definition: result.definition,
					baseRevision: result.definition.revision
				});
				setDirty(false);
				writeLocal(key, void 0);
				await onChanged();
				setNotice("流程已保存；没有投递消息。");
			});
			const inspect = (ids, retry = false) => action(async () => {
				if (!run || dirty || !previewCurrent()) return;
				const value = await meetingCall(meetingId, "workflow-preview", {
					runId: run.id,
					nodeIds: ids,
					retry
				});
				setPreview({
					plan: value.plan,
					retry,
					requestId: id()
				});
			});
			const start = () => action(async () => {
				if (!preview || dirty || !previewCurrent()) return;
				if (preview.initial) await call("workflow-initial-start", {
					definitionRevision: preview.plan.definitionRevision,
					fingerprint: preview.plan.fingerprint,
					requestId: preview.requestId,
					mode: preview.collaboration ?? "manual",
					confirmed: true
				});
				else if (run) await call("workflow-start", {
					runId: run.id,
					nodeIds: preview.plan.nodeIds,
					fingerprint: preview.plan.fingerprint,
					requestId: preview.requestId,
					retry: preview.retry,
					confirmed: true
				});
				else return;
				setPreview(void 0);
				setNotice(preview.perNode || run?.executionPolicy === "per-node-v1" ? "已确认本轮逐环节规则；只有勾选环节可自动接力，未勾选的仍需手动开始。" : preview.collaboration === "automatic" || run?.automatic ? "已确认自动协作；例行环节按冻结配置接力，验收、选路、输入不足或异常处等待你处理。" : "已授权。输入将投递到原窗口；下一环节仍等你开始。");
			});
			const nodeOptions = (value, set, label) => (0, react_jsx_runtime.jsxs)("select", {
				"aria-label": label,
				style: uiInput,
				value,
				onChange: (e) => set(e.target.value),
				children: [(0, react_jsx_runtime.jsx)("option", {
					value: "",
					children: "请选择环节"
				}), d.nodes.map((n) => (0, react_jsx_runtime.jsx)("option", {
					value: n.id,
					children: n.title
				}, n.id))]
			});
			const ready = views.filter((v) => v.status === "ready" && (run?.executionPolicy !== "per-node-v1" || d.nodes.find((n) => n.id === v.nodeId)?.autoReceiveAndRun !== true || d.nodes.find((n) => n.id === v.nodeId)?.confirmation === true));
			const automaticSummary = "普通投递最多" + d.limits.workAttempts + "次" + (freeSteps ? "" : "，秘书最多" + d.limits.minutesStarts + "次") + "；" + (freeSteps ? stepsUserNodes(d) : d.nodes).map((n) => n.title + (perNode ? n.autoReceiveAndRun ? "（自动接收并运行）" : "（手动开始）" : "") + "→" + (n.kind === "minutes" ? "秘书" : n.kind === "join" ? "汇合／选路" : n.memberIds.map(name).join("、")) + (n.requireReview ? "（成果需验收）" : "") + (n.confirmation ? "（开始需确认）" : "")).join("；") + (d.loops.length ? "；自动返工上限：" + d.loops.map((l) => (d.nodes.find((n) => n.id === l.gateId)?.title ?? "返工") + l.maxRounds + "轮").join("、") : "");
			const historyOptions = [
				{
					value: "",
					label: nextDraft ? "下一轮编辑草稿" : active ? `本轮流程 · ${active.paused ? "已暂停" : active.automatic ? "自动接力" : "手动主持"}` : "当前配置"
				},
				...(workflow?.runs ?? []).map((r, i) => ({
					value: r.id,
					label: `第${i + 1}次运行 · ${r.status === "active" ? "进行中" : r.status === "completed" ? "已完成" : "已停止"}`
				})),
				...missingHistory ? [{
					value: historyId,
					label: "所选历史运行不可用"
				}] : []
			];
			const runStatus = missingHistory ? "历史记录不可用" : historical ? "历史运行记录" : meeting.archivedAt ? "会议已归档 · 只读" : workflow && !workflowSchemaSupported(workflow.schemaVersion) ? "当前版本无法解释此流程" : run ? run.paused ? "本轮已暂停" : run.executionPolicy === "per-node-v1" ? "按环节规则运行中" : run.automatic ? "自动协作中" : "手动主持中" : nextDraft ? "下一轮尚未启动" : "本轮尚未启动";
			const runNote = historical ? "仅查看本次记录，不执行或修改。" : readOnly ? "当前内容只读，修改与执行入口已收起。" : run?.paused ? run.automatic ? (0, react_jsx_runtime.jsxs)("span", { children: [
				"暂停原因：",
				run.automatic.pauseReason ?? "本轮已暂停",
				"。检查后按本轮冻结配置继续",
				dirty ? "；未保存修改不会用于执行" : "",
				"。"
			] }) : (0, react_jsx_runtime.jsxs)("span", { children: ["继续已确认的工作，新环节仍需手动开始。", dirty ? "按已确认配置继续；未保存修改不会用于执行。" : ""] }) : run?.executionPolicy === "per-node-v1" ? "勾选环节按规则接力；未勾选环节等待手动预览开始，验收、选路与异常仍停下。" : run?.automatic ? "按本轮规则推进；验收、选路与异常等待你处理。" : run ? ready.length ? "新环节先预览，再由你确认开始。" : "等待当前结果或处理本轮事项。" : dirty || !workflow?.draft ? "先保存配置，保存后可预览；保存不会发任务。" : freeSteps && startIssues.length ? "已保存为草稿；请补齐环节名称和成员Agent，再保存并预览。" : collaboration === "automatic" ? "先预览完整配置并确认，再按规则自动接力。" : "先预览，再确认启动本轮；普通讨论不受影响。";
			const primaryAction = !readOnly ? !active ? (0, react_jsx_runtime.jsx)("button", {
				style: uiButton,
				"data-workflow-primary": "",
				disabled: busy || dirty || !workflow?.draft || meeting.releasePaused || startIssues.length > 0,
				onClick: () => {
					if (dirty || !workflow?.draft || meeting.releasePaused || startIssues.length || !previewCurrent()) return;
					action(async () => {
						const requestId = id();
						if (!perNode && d.nodes.find((n) => n.id === d.entryId)?.kind === "join") {
							if (collaboration === "automatic") {
								setConfirm({
									text: "确认按当前保存配置开启自动协作？" + automaticSummary + "。成员、资料和额度按本次快照使用，验收与选路等待主持，重启后不会自动续跑。",
									action: () => call("workflow-create", {
										definitionRevision: workflow.draft.revision,
										requestId,
										mode: collaboration,
										confirmed: true
									})
								});
								return;
							}
							await call("workflow-create", {
								definitionRevision: workflow.draft.revision,
								requestId
							});
							setNotice("运行已建立，请在入口汇合节点选择路线。");
						} else {
							const value = await meetingCall(meetingId, "workflow-initial-preview", { requestId });
							setPreview({
								plan: value.plan,
								retry: false,
								requestId,
								initial: true,
								collaboration: perNode ? "automatic" : collaboration,
								perNode
							});
						}
					});
				},
				children: !perNode && d.nodes.find((n) => n.id === d.entryId)?.kind === "join" ? "建立本轮并主持选路…" : "预览并启动本轮…"
			}) : run?.paused ? (0, react_jsx_runtime.jsx)("button", {
				style: uiButton,
				"data-workflow-primary": "",
				disabled: busy,
				onClick: () => {
					if (run.paused && run.automatic) setConfirm({
						text: `${run.automatic.pauseReason ?? "流程已暂停"}。确认已检查输入、结果与原窗口，继续按本次冻结配置自动接力？不会重发已建档的执行。`,
						action: () => call("workflow-control", {
							runId: run.id,
							control: "resume",
							confirmed: true
						})
					});
					else action(() => call("workflow-control", {
						runId: run.id,
						control: run.paused ? "resume" : "pause"
					}));
				},
				children: run.paused ? run.automatic ? "检查并继续自动协作…" : "继续本轮" : "暂停后续执行"
			}) : run?.automatic && run.executionPolicy !== "per-node-v1" ? (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: uiButton,
				onClick: () => contentRef.current?.scrollIntoView({ block: "nearest" }),
				children: "查看当前进展"
			}) : ready.length === 1 ? (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: uiButton,
				"data-workflow-primary": "",
				disabled: busy || dirty || admissionBlocked || meeting.releasePaused,
				onClick: () => {
					if (!canMutate()) return;
					setSelected(ready[0].nodeId);
					inspect([ready[0].nodeId]);
				},
				children: "预览下一环节"
			}) : ready.length > 1 ? (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: uiButton,
				onClick: () => readySectionRef.current?.scrollIntoView({ block: "nearest" }),
				children: "查看可开始环节"
			}) : (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: uiButton,
				onClick: () => contentRef.current?.scrollIntoView({ block: "nearest" }),
				children: "查看当前进展"
			}) : void 0;
			const editSteps = (update) => {
				if (!canMutate() || busyRef.current) return;
				previewEpoch.current.version++;
				setPreviewRaw(void 0);
				setConfirmRaw(void 0);
				setIssues([]);
				setDraft((current) => current.definition.id === d.id ? {
					...current,
					definition: update(current.definition)
				} : current);
				setDirty(true);
			};
			const prepareEmpty = () => {
				if (!canMutate() || busyRef.current || active) return;
				const next = makeStepsDefinition(id(), "会议进程", d.limits);
				mutableView.current = {
					...mutableView.current,
					epoch: mutableView.current.epoch + 1
				};
				setDraft({
					definition: next,
					baseRevision: workflow?.draft?.revision
				});
				setDirty(true);
				setSelected("");
				setMode("sequence");
				setPreviewRaw(void 0);
				setConfirmRaw(void 0);
				setIssues([]);
				setEdgeDraft(void 0);
				setNotice("已建立空白步骤草稿。旧配置和运行历史会保留，保存前尚未替换会议配置。");
			};
			const execution = node ? (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": "本环节执行",
				style: {
					border: "1px solid var(--dsw-alias-border-l2)",
					padding: 12,
					borderRadius: 12
				},
				children: [
					!freeSteps && (0, react_jsx_runtime.jsxs)("b", { children: [
						node.title,
						" · ",
						workflowLabels[view?.status ?? "not_started"]
					] }),
					view?.missing.map((x) => (0, react_jsx_runtime.jsx)("p", { children: x }, x)),
					!readOnly && run && node.kind !== "join" && (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						disabled: busy || !!stage?.sent,
						onClick: () => setStage({
							nodeId: node.id,
							text: "",
							messageIds: [],
							assetIds: [],
							requestId: id()
						}),
						children: "添加环节资料／补充输入"
					}),
					stage && stage.nodeId === node.id && !readOnly && run && (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": "补充环节输入",
						children: [
							(0, react_jsx_runtime.jsxs)("p", { children: [
								"目标：",
								node.title,
								" · 沿用",
								node.kind === "minutes" ? "会议秘书" : node.memberIds.map(name).join("、"),
								"。仅暂存到可用本轮或下一轮，确认不会立即投递，也不改变执行成员。"
							] }),
							(0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": "环节补充说明",
								disabled: busy || stage.sent,
								style: {
									...uiInput,
									width: "100%",
									minHeight: 75
								},
								value: stage.text,
								onChange: (e) => setStage({
									...stage,
									text: e.target.value
								})
							}),
							(0, react_jsx_runtime.jsxs)("details", { children: [
								(0, react_jsx_runtime.jsx)("summary", { children: "引用会议消息与资料" }),
								messages.filter((m) => !m.previewOnly).map((m) => (0, react_jsx_runtime.jsxs)("label", {
									style: { display: "block" },
									children: [(0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										disabled: busy || stage.sent,
										checked: stage.messageIds.includes(m.id),
										onChange: () => setStage({
											...stage,
											messageIds: stage.messageIds.includes(m.id) ? stage.messageIds.filter((x) => x !== m.id) : [...stage.messageIds, m.id]
										})
									}), m.text.slice(0, 100)]
								}, m.id)),
								assets.map((a) => (0, react_jsx_runtime.jsxs)("label", {
									style: { display: "block" },
									children: [
										(0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: stage.assetIds.includes(a.id),
											onChange: () => setStage({
												...stage,
												assetIds: stage.assetIds.includes(a.id) ? stage.assetIds.filter((x) => x !== a.id) : [...stage.assetIds, a.id]
											})
										}),
										a.name,
										" · v",
										a.version
									]
								}, a.id))
							] }),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-tools",
								children: [(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: busy || !stage.text.trim() && !stage.messageIds.length && !stage.assetIds.length,
									onClick: () => {
										const pending = stage;
										action(async () => {
											setStage({
												...pending,
												sent: true
											});
											const result = await meetingCall(meetingId, "workflow-input-add", {
												runId: run.id,
												nodeId: pending.nodeId,
												requestId: pending.requestId,
												text: pending.text,
												messageIds: pending.messageIds,
												assetIds: pending.assetIds,
												confirmed: true
											});
											setStage((current) => current?.requestId === pending.requestId ? void 0 : current);
											await onChanged();
											setNotice("资料已暂存到第" + (result.round || 1) + "轮；没有立即执行。");
										});
									},
									children: "确认暂存资料"
								}), (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: busy,
									onClick: () => {
										if (stage.sent) setConfirm({
											text: "这次资料暂存的响应尚未确认，原请求可能已保存。确认关闭编辑，不重新提交或删除原资料？",
											action: async () => {
												setStage(void 0);
											}
										});
										else setStage(void 0);
									},
									children: "取消"
								})]
							})
						]
					}),
					!readOnly && !active?.activations.some((a) => a.nodeId === node.id && !a.temporary) && (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": "环节协作配置",
						children: [!freeSteps && (0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: !!node.confirmation,
							onChange: (e) => edit({
								...d,
								nodes: d.nodes.map((n) => n.id === node.id ? {
									...n,
									confirmation: e.target.checked
								} : n)
							})
						}), "自动协作开始此环节前等待主持确认"] }), node.kind === "work" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [mode === "graph" && !freeSteps && (0, react_jsx_runtime.jsxs)("label", {
							style: { display: "block" },
							children: [(0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: !!node.requireReview,
								onChange: (e) => edit({
									...d,
									nodes: d.nodes.map((n) => n.id === node.id ? {
										...n,
										requireReview: e.target.checked
									} : n)
								})
							}), "正式成果需主持验收后才供下一环节使用"]
						}), (0, react_jsx_runtime.jsxs)("details", { children: [
							(0, react_jsx_runtime.jsx)("summary", { children: "绑定已发布任务卡" }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => {
									action(async () => {
										const value = await meetingCall(meetingId, "workflow-published-cards", {});
										setPublishedCards(value.cards ?? []);
									});
								},
								children: "查看已发布卡片"
							}),
							publishedCards.map((c) => (0, react_jsx_runtime.jsxs)("article", { children: [
								(0, react_jsx_runtime.jsxs)("strong", { children: [
									c.title,
									" · v",
									c.version
								] }),
								(0, react_jsx_runtime.jsx)("p", {
									style: { whiteSpace: "pre-wrap" },
									children: c.body
								}),
								(0, react_jsx_runtime.jsxs)("p", { children: [
									"建议负责人：",
									c.assigneeSessionId ? name(c.assigneeSessionId) : "尚未指定",
									" · ",
									c.assetIds.length,
									"项材料 · ",
									c.fileRef.relativePath
								] }),
								c.releaseId && (0, react_jsx_runtime.jsx)("p", { children: "这张卡已独立派发；绑定流程后，明确开始新的运行会再次作为新的环节执行，原任务记录保留。" }),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: busy,
									onClick: () => {
										action(async () => {
											const binding = {
												publicationId: c.publicationId,
												cardId: c.id,
												version: c.version,
												fileId: c.fileRef.fileId,
												sha256: c.fileRef.sha256
											}, value = await meetingCall(meetingId, "workflow-bind-card", {
												node,
												binding
											});
											if (!validInspector()) return;
											edit({
												...d,
												nodes: d.nodes.map((n) => n.id === node.id ? value.node : n)
											});
											setNotice("已在流程草稿绑定这张已发布卡的要求、建议成员与材料版本；保存后生效，尚未执行。");
										});
									},
									children: "使用此发布版本"
								})
							] }, c.publicationId + ":" + c.id + ":" + c.version)),
							node.cardBinding && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("p", { children: [
								"已绑定任务卡v",
								node.cardBinding.version,
								"。修改要求或固定资料前请解除绑定；历史执行不会改变。"
							] }), (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => {
									const { cardBinding, ...next } = node;
									edit({
										...d,
										nodes: d.nodes.map((n) => n.id === node.id ? next : n)
									});
								},
								children: "解除卡片绑定，保留当前要求"
							})] })
						] })] })]
					}),
					!readOnly && run && node.decision && view?.status === "waiting_decision" && (0, react_jsx_runtime.jsx)("div", {
						className: "rt-workflow-tools",
						children: d.edges.filter((e) => e.from === node.id && e.kind === "choice").map((e) => (0, react_jsx_runtime.jsxs)("button", {
							style: uiButton,
							disabled: busy || dirty || run.paused && !run.automatic?.pauseReason,
							onClick: () => {
								action(() => call("workflow-choice", {
									runId: run.id,
									nodeId: node.id,
									edgeId: e.id
								}));
							},
							children: [
								e.label,
								" → ",
								d.nodes.find((n) => n.id === e.to)?.title
							]
						}, e.id))
					}),
					!readOnly && run && activation?.choiceEdgeId && (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						disabled: busy || run.paused,
						onClick: () => {
							action(() => call("workflow-clear-choice", {
								runId: run.id,
								nodeId: node.id,
								activationId: activation.id
							}));
						},
						children: "撤销尚未执行的选择"
					}),
					!readOnly && run && node.kind === "join" && view?.status === "waiting_inputs" && d.parallelGroups.some((g) => g.joinId === node.id) && (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						disabled: busy || dirty || run.paused,
						onClick: () => {
							action(async () => {
								const { plan } = await meetingCall(meetingId, "workflow-partial-preview", {
									runId: run.id,
									joinId: node.id
								});
								setConfirm({
									text: `使用已有结果继续，将跳过：${plan.branches.filter((b) => plan.skipBranchIds.includes(b.branchId)).map((b) => b.title).join("、")}。晚到结果不进入本次汇合，原窗口继续工作。`,
									action: () => call("workflow-partial", {
										runId: run.id,
										joinId: node.id,
										skipBranchIds: plan.skipBranchIds,
										fingerprint: plan.fingerprint,
										confirmed: true,
										reason: "主持人在流程面板确认使用已有结果继续"
									})
								});
							});
						},
						children: "使用已有结果继续…"
					}),
					activation?.minutesError && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: activation.minutesError
					}),
					activation?.minutesId && (0, react_jsx_runtime.jsx)("p", { children: "纪要已生成，保存在“纪要”页；尚未发送的内容由你决定是否发送。" }),
					!readOnly && run && node.kind !== "join" && !run.definition.loops.some((l) => l.advanceId === node.id) && ![
						"skipped",
						"not_walked",
						"waiting_inputs",
						"limit"
					].includes(view?.status ?? "waiting_inputs") && (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						disabled: busy || dirty || run.paused,
						onClick: () => setBypass({
							nodeId: node.id,
							activationId: view?.activationId,
							reason: ""
						}),
						children: "跳过处理并沿用输入…"
					}),
					(release ? effectiveReleaseTasks({ releases }, release) : []).map((t) => (0, react_jsx_runtime.jsxs)("article", {
						style: {
							paddingTop: 10,
							marginTop: 10,
							borderTop: "1px solid var(--dsw-alias-border-l2)"
						},
						children: [
							(0, react_jsx_runtime.jsxs)("strong", { children: [
								name(t.toSessionId),
								" · ",
								t.status === "completed" ? "已提交" : t.status === "delivered" ? "已投递，等待结果" : workflowLabels[t.status] ?? t.status
							] }),
							(0, react_jsx_runtime.jsx)(TaskRecovery, { task: t }),
							t.error && (0, react_jsx_runtime.jsx)("p", { children: t.error }),
							t.result && (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsxs)("summary", { children: [t.result.slice(0, 90), t.result.length > 90 ? "…" : ""] }), (0, react_jsx_runtime.jsx)("p", {
								style: {
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere"
								},
								children: t.result
							})] }),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-tools",
								style: { marginTop: 8 },
								children: [(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									onClick: () => onOpenSession(t.toSessionId),
									children: "打开原窗口"
								}), !readOnly && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									["offline", "uncertain"].includes(t.status) && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy || run?.paused,
										onClick: () => setConfirm({
											text: t.status === "uncertain" ? "原消息可能已送达。检查原窗口后确认重试，可能重复执行并消耗额度。" : "在原窗口恢复连接后重试投递。",
											action: () => call("retry-release", {
												taskId: t.taskId,
												allowDuplicate: t.status === "uncertain"
											})
										}),
										children: "重试投递…"
									}),
									t.attempts > 0 && [
										"delivered",
										"in_progress",
										"uncertain",
										"failed"
									].includes(t.status) && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										onClick: () => setSupplement({
											taskId: t.taskId,
											sessionId: t.toSessionId
										}),
										children: "人工补交"
									}),
									!["completed", "cancelled"].includes(t.status) && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										onClick: () => setConfirm({
											text: "结束本项会议等待，不取消原窗口当前工作。",
											action: () => call("close-task", {
												taskId: t.taskId,
												confirmed: true
											})
										}),
										children: "结束等待…"
									}),
									t.status === "completed" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										(0, react_jsx_runtime.jsx)("button", {
											style: uiButton,
											disabled: busy || t.review === "accepted",
											onClick: () => {
												action(() => call("review-task", {
													taskId: t.taskId,
													review: "accepted"
												}));
											},
											children: "验收通过"
										}),
										(0, react_jsx_runtime.jsx)("button", {
											style: uiButton,
											disabled: busy || !!revisionChild({ releases }, t),
											onClick: () => {
												action(async () => {
													await call("review-task", {
														taskId: t.taskId,
														review: "changes_requested",
														note: t.reviewNote ?? ""
													});
													setRevisionTarget(t.taskId);
												});
											},
											children: "要求修改"
										}),
										(0, react_jsx_runtime.jsx)("span", { children: reviewState({ releases }, t) })
									] })
								] })]
							}),
							(0, react_jsx_runtime.jsxs)("small", { children: [
								"投递尝试",
								t.attempts,
								"次 · ",
								new Date(t.updatedAt).toLocaleString()
							] })
						]
					}, t.taskId)),
					!readOnly && run && [
						"submitted",
						"failed",
						"ended",
						"waiting_review",
						"changes_requested"
					].includes(view?.status ?? "") && node.kind !== "join" && (0, react_jsx_runtime.jsx)("button", {
						style: {
							...uiButton,
							marginTop: 10
						},
						disabled: busy || dirty || run.paused,
						onClick: () => {
							inspect([node.id], true);
						},
						children: "预览重新执行…"
					}),
					!readOnly && supplement && (0, react_jsx_runtime.jsx)(PublishPanel, {
						meetingId,
						members,
						releases,
						initialTarget: supplement,
						onChanged
					}, supplement.taskId)
				]
			}) : void 0;
			return (0, react_jsx_runtime.jsxs)("section", {
				ref: container,
				"data-workflow-panel": "",
				style: {
					fontSize: 13,
					minWidth: 0,
					overflowWrap: "anywhere",
					display: "flex",
					flexDirection: "column",
					flexShrink: 0,
					gap: 8,
					containerType: "inline-size",
					containerName: "rt-workflow"
				},
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: `.rt-step-auto{display:flex;align-items:flex-start;gap:6px;margin:7px 4px;line-height:1.5;font-size:12px;overflow-wrap:anywhere}.rt-step-auto input{flex:none;margin-top:3px}.rt-workflow-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:12}.rt-workflow-tools{display:flex;flex-wrap:wrap;gap:6}.rt-workflow-layout input,.rt-workflow-layout select{max-width:100%}.rt-workflow-content-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.rt-workflow-content-heading>button{padding:4px 9px}.rt-workflow-field{display:flex;flex-direction:column;gap:7px;min-width:0}@container rt-workflow (min-width:760px){.rt-workflow-layout:not(.rt-workflow-list-layout){grid-template-columns:minmax(0,1fr) 290px}}` }),
					(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsx)("h3", {
						style: {
							margin: 0,
							fontSize: 16
						},
						children: "会议进程"
					}), (0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: "2px 0 0",
							color: "var(--dsw-alias-label-secondary)"
						},
						children: "自行命名环节、指定成员，安排顺序与并行协作。"
					})] }),
					nextDraft && (0, react_jsx_runtime.jsxs)("p", {
						role: "status",
						children: [lastRun.status === "completed" ? "上一轮已完成" : "上一轮已停止", "。当前显示下一轮编辑草稿，尚未建立新运行；上一轮结果可在“正在查看”中选择。"]
					}),
					!localPersistence.available && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						children: [
							"流程草稿仅在本次窗口保留，关闭后可能丢失：",
							localPersistence.reason,
							"。可用“保存配置／保存修改”将有效安排保存到会议。"
						]
					}),
					historical && !missingHistory && matchingHistory?.phase !== "ready" && (matchingHistory?.phase === "error" ? (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						children: [
							"读取历史运行失败：",
							matchingHistory.error,
							" ",
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: () => setHistoryRetry((x) => x + 1),
								children: "重试读取此运行"
							})
						]
					}) : (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: "正在读取历史运行…"
					})),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					notice && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: notice
					}),
					run && run.executionPolicy !== "per-node-v1" && mode === "sequence" && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: historical ? "历史运行使用当时的" + (run.automatic ? "全局自动接力" : "手动主持") + "规则；当时没有此逐环节开关，未勾选不代表改写旧记录。" : "旧运行仍按当时的规则执行；结束后在下一轮配置勾选自动环节。"
					}),
					workflow && !workflowSchemaSupported(workflow.schemaVersion) && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: "此会议流程来自更高版本，当前只读，请升级插件。"
					}),
					(0, react_jsx_runtime.jsx)(WorkflowToolbar, {
						view: mode,
						onViewChange: setMode,
						historyValue: historyId,
						historyOptions,
						onHistoryChange: changeHistory,
						historical,
						readOnly,
						viewingNote: historical && run ? `第${(workflow?.runs.findIndex((r) => r.id === run.id) ?? 0) + 1}次运行 · ${run.status === "completed" ? "已完成" : run.status === "active" ? "进行中" : "已停止"}` : meeting.archivedAt ? "会议已归档" : workflow && !workflowSchemaSupported(workflow.schemaVersion) ? "需要兼容版本才能查看" : void 0,
						configurationStatus: dirty ? "有未保存修改" : workflow?.draft ? `已保存 · v${workflow.draft.revision}` : "尚未保存",
						configurationTone: dirty ? "dirty" : workflow?.draft ? "saved" : "unavailable",
						configurationActions: !readOnly ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							disabled: busy || !dirty,
							onClick: () => {
								save();
							},
							children: workflow?.draft ? "保存修改" : "保存配置"
						}), (0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							disabled: busy || !dirty,
							onClick: () => {
								setConfirm({
									text: "放弃本地未保存的配置和布局修改，恢复最后保存版本？",
									action: async () => {
										setDraft({
											definition: workflow?.draft ?? blank(),
											baseRevision: workflow?.draft?.revision
										});
										setDirty(false);
										writeLocal(key, void 0);
										setIssues([]);
									}
								});
							},
							children: "放弃修改"
						})] }) : void 0,
						runStatus,
						runNote,
						collaborationControls: !readOnly && !active && !perNode ? (0, react_jsx_runtime.jsxs)("label", { children: ["协作方式 ", (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": "协作方式",
							style: uiInput,
							value: collaboration,
							onChange: (e) => {
								if (!canMutate()) return;
								const next = e.target.value === "automatic" ? "automatic" : "manual";
								setCollaboration(next);
								writeLocal(`workflow-collaboration.${meetingId}`, next);
								setPreview(void 0);
							},
							children: [(0, react_jsx_runtime.jsx)("option", {
								value: "manual",
								children: "手动主持"
							}), (0, react_jsx_runtime.jsx)("option", {
								value: "automatic",
								children: "按规则自动接力"
							})]
						})] }) : void 0,
						primaryAction,
						runOperations: !readOnly && run ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							!run.paused && (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => {
									if (run.paused && run.automatic) setConfirm({
										text: `${run.automatic.pauseReason ?? "流程已暂停"}。确认已检查输入、结果与原窗口，继续按本次冻结配置自动接力？不会重发已建档的执行。`,
										action: () => call("workflow-control", {
											runId: run.id,
											control: "resume",
											confirmed: true
										})
									});
									else action(() => call("workflow-control", {
										runId: run.id,
										control: run.paused ? "resume" : "pause"
									}));
								},
								children: "暂停后续执行"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => setConfirm({
									text: "停止本次流程的等待与未送出任务。普通成员原窗口继续工作。",
									action: () => call("workflow-control", {
										runId: run.id,
										control: "stop",
										confirmed: true
									})
								}),
								children: "停止本轮…"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => setConfirm({
									text: "确认所选路径已提交，结束本次运行并保留历史？仍有待处理任务时服务端会拒绝完成。",
									action: () => call("workflow-control", {
										runId: run.id,
										control: "complete"
									})
								}),
								children: "完成本轮…"
							})
						] }) : void 0,
						readOnlyReturn: historical ? (0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							onClick: () => changeHistory(""),
							children: "返回当前配置"
						}) : void 0,
						runtimeDetails: run ? (0, react_jsx_runtime.jsxs)("details", {
							"data-workflow-runtime-records": "",
							children: [(0, react_jsx_runtime.jsx)("summary", { children: "执行次数与记录" }), (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 6,
									paddingTop: 6
								},
								children: [
									(0, react_jsx_runtime.jsxs)("p", {
										style: { margin: 0 },
										children: [
											"普通投递 ",
											run.workReserved,
											"/",
											budget.workAttempts,
											" · 秘书 ",
											run.minutesStarted,
											"/",
											budget.minutesStarts
										]
									}),
									(0, react_jsx_runtime.jsx)("p", {
										style: { margin: 0 },
										children: "限制会议触发次数；原窗口执行可能包含多次模型和工具调用。"
									}),
									run.definition.loops.map((l) => (0, react_jsx_runtime.jsxs)("p", {
										style: { margin: "6px 0 0" },
										children: [
											"返工：",
											d.nodes.find((n) => n.id === l.gateId)?.title,
											" · 第",
											run.rounds[l.id] ?? 1,
											"轮 · ",
											run.automatic ? `自动最多${run.automatic.roundCaps[l.id]}轮` : "每轮由你开始，无轮次上限",
											run.automatic && !readOnly && (0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												disabled: busy,
												onClick: () => setConfirm({
													text: `将自动轮次上限由${run.automatic.roundCaps[l.id]}轮追加为${run.automatic.roundCaps[l.id] + 1}轮？追加不启动；仍需检查并继续。`,
													action: () => call("workflow-auto-rounds", {
														runId: run.id,
														loopId: l.id,
														expected: run.automatic.roundCaps[l.id],
														maxRounds: run.automatic.roundCaps[l.id] + 1,
														confirmed: true
													})
												}),
												children: "追加一轮…"
											})
										]
									}, l.id)),
									!readOnly && (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", {
										title: "额度用完后不会自动增加。你可以追加次数；追加后仍需预览并开始环节。",
										children: "手动追加执行额度"
									}), (0, react_jsx_runtime.jsxs)("div", {
										className: "rt-workflow-tools",
										style: { marginTop: 8 },
										children: [
											(0, react_jsx_runtime.jsxs)("label", { children: ["普通投递", (0, react_jsx_runtime.jsx)("input", {
												"aria-label": "追加普通投递",
												type: "number",
												min: 0,
												max: 1e3,
												value: extraWork,
												disabled: !!budgetRequest,
												style: {
													...uiInput,
													width: 100
												},
												onChange: (e) => setExtraWork(Number(e.target.value))
											})] }),
											(0, react_jsx_runtime.jsxs)("label", { children: ["秘书生成", (0, react_jsx_runtime.jsx)("input", {
												"aria-label": "追加秘书生成",
												type: "number",
												min: 0,
												max: 100,
												value: extraMinutes,
												disabled: !!budgetRequest,
												style: {
													...uiInput,
													width: 100
												},
												onChange: (e) => setExtraMinutes(Number(e.target.value))
											})] }),
											(0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												disabled: busy || !!budgetRequest || !Number.isInteger(extraWork) || !Number.isInteger(extraMinutes) || extraWork < 0 || extraWork > 1e3 || extraMinutes < 0 || extraMinutes > 100 || extraWork + extraMinutes === 0,
												onClick: () => {
													const request = {
														runId: run.id,
														requestId: id(),
														work: extraWork,
														minutes: extraMinutes,
														expected: budget,
														confirmed: true
													};
													setConfirm({
														text: `追加普通投递${extraWork}次、秘书${extraMinutes}次？只增加本次流程额度，不开始任何环节，也不代表Token预算。`,
														action: async () => {
															setBudgetRequest(request);
															writeLocal(`workflow-budget-request.${meetingId}`, request);
															await call("workflow-budget", request);
															setBudgetRequest(void 0);
															writeLocal(`workflow-budget-request.${meetingId}`, void 0);
															setPreview(void 0);
														}
													});
												},
												children: "确认追加额度…"
											}),
											budgetRequest && (0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												disabled: busy,
												onClick: () => {
													action(async () => {
														await call("workflow-budget", budgetRequest);
														setBudgetRequest(void 0);
														writeLocal(`workflow-budget-request.${meetingId}`, void 0);
														setPreview(void 0);
													});
												},
												children: "重试同一次额度追加"
											}),
											budgetRequest && (0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												disabled: busy,
												onClick: () => setConfirm({
													text: "请先核对当前累计额度。清除本地请求不会撤销可能已生效的额度，也不会再次追加。",
													action: async () => {
														setBudgetRequest(void 0);
														writeLocal(`workflow-budget-request.${meetingId}`, void 0);
													}
												}),
												children: "核对后清除待确认请求…"
											})
										]
									})] }),
									(0, react_jsx_runtime.jsxs)("details", { children: [
										(0, react_jsx_runtime.jsxs)("summary", { children: [
											"轮次与操作记录（",
											run.events.length,
											"）"
										] }),
										[...run.events].reverse().map((e) => (0, react_jsx_runtime.jsxs)("p", { children: [
											new Date(e.time).toLocaleString(),
											" · ",
											e.action === "stage-materials" ? (() => {
												try {
													return JSON.parse(e.details).summary;
												} catch {
													return "环节资料已暂存";
												}
											})() : e.details
										] }, e.id)),
										run.activations.map((a) => (0, react_jsx_runtime.jsxs)("details", { children: [
											(0, react_jsx_runtime.jsxs)("summary", { children: [
												a.node.title,
												" · 第",
												a.round || 1,
												"轮／尝试",
												a.attempt,
												a.skipped ? " · 已跳过" : ""
											] }),
											(0, react_jsx_runtime.jsxs)("p", { children: [
												"定义v",
												a.definitionRevision,
												" · ",
												a.id
											] }),
											(0, react_jsx_runtime.jsxs)("p", { children: [
												"输入消息 ",
												a.messageIds.join("、") || "无",
												"；来源执行 ",
												a.sourceActivationIds.join("、") || "无"
											] })
										] }, a.id))
									] })
								]
							})]
						}) : void 0
					}),
					!readOnly && confirm && (0, react_jsx_runtime.jsxs)("section", {
						role: "alertdialog",
						"aria-label": "确认流程操作",
						style: {
							border: "2px solid #a55d00",
							padding: 12,
							borderRadius: 10
						},
						children: [(0, react_jsx_runtime.jsx)("p", { children: confirm.text }), (0, react_jsx_runtime.jsxs)("div", {
							className: "rt-workflow-tools",
							children: [(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => {
									action(async () => {
										await confirm.action();
										setConfirm(void 0);
									});
								},
								children: "确认"
							}), (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => setConfirm(void 0),
								children: "取消"
							})]
						})]
					}),
					!readOnly && edgeDraft && (0, react_jsx_runtime.jsxs)("section", {
						ref: edgeSettingsRef,
						role: "region",
						"aria-label": "连线设置",
						style: {
							border: "2px solid #2470b5",
							borderRadius: 10,
							padding: 12,
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						children: [
							(0, react_jsx_runtime.jsxs)("strong", { children: [
								edgeDraft.existing ? "编辑连线" : "建立连线",
								"：",
								d.nodes.find((n) => n.id === edgeDraft.from)?.title,
								" → ",
								d.nodes.find((n) => n.id === edgeDraft.to)?.title
							] }),
							edgeLocked && (0, react_jsx_runtime.jsx)("p", { children: "此连线已冻结或当前只读。" }),
							(0, react_jsx_runtime.jsxs)("label", { children: ["连接方式", (0, react_jsx_runtime.jsxs)("select", {
								"aria-label": "选中连线类型",
								style: uiInput,
								disabled: edgeLocked,
								value: edgeDraft.kind,
								onChange: (e) => setEdgeDraft({
									...edgeDraft,
									kind: e.target.value
								}),
								children: [
									(0, react_jsx_runtime.jsx)("option", {
										value: "flow",
										children: "接着进行（顺序／并行）"
									}),
									(0, react_jsx_runtime.jsx)("option", {
										value: "choice",
										children: "由我选择（人工分支）"
									}),
									(0, react_jsx_runtime.jsx)("option", {
										value: "loop",
										children: "修改后再评审（返回）"
									})
								]
							})] }),
							edgeDraft.kind === "choice" && (0, react_jsx_runtime.jsxs)("label", { children: ["选择名称", (0, react_jsx_runtime.jsx)("input", {
								"aria-label": "选中连线名称",
								placeholder: "例如：通过、需要修改",
								style: uiInput,
								disabled: edgeLocked,
								value: edgeDraft.label ?? "",
								onChange: (e) => setEdgeDraft({
									...edgeDraft,
									label: e.target.value
								})
							})] }),
							edgeDraft.kind === "loop" && (0, react_jsx_runtime.jsxs)("label", { children: ["返工范围", (0, react_jsx_runtime.jsxs)("select", {
								"aria-label": "选中连线回路",
								style: uiInput,
								disabled: edgeLocked,
								value: edgeDraft.loopId ?? "",
								onChange: (e) => setEdgeDraft({
									...edgeDraft,
									loopId: e.target.value
								}),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: "请先在下方配置返工范围"
								}), d.loops.map((l) => (0, react_jsx_runtime.jsx)("option", {
									value: l.id,
									children: d.nodes.find((n) => n.id === l.gateId)?.title ?? l.id
								}, l.id))]
							})] }),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-tools",
								children: [
									(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: edgeLocked,
										onClick: () => applyEdge(edgeDraft, edgeDraft.existing ? edgeDraft.id : void 0),
										children: edgeDraft.existing ? "应用连线修改" : "确认连线"
									}),
									edgeDraft.existing && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: edgeLocked,
										onClick: () => setConfirm({
											text: "删除所选连线？只改变编辑草稿，不会停止原窗口。",
											action: async () => deleteEdge(edgeDraft.id)
										}),
										children: "删除所选连线…"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										onClick: () => setEdgeDraft(void 0),
										children: "关闭连线设置"
									})
								]
							})
						]
					}),
					!readOnly && bypass && run && (0, react_jsx_runtime.jsxs)("section", {
						role: "alertdialog",
						"aria-label": "确认跳过处理",
						style: {
							padding: 12,
							border: "2px solid #a55d00",
							borderRadius: 10
						},
						children: [
							(0, react_jsx_runtime.jsxs)("p", { children: [
								"跳过「",
								d.nodes.find((n) => n.id === bypass.nodeId)?.title,
								"」的处理，后续仅沿用它已有的输入，并明确标注本环节已跳过。不会取消普通成员原窗口，下一环节仍需手动开始。"
							] }),
							(0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": "跳过原因",
								style: uiInput,
								rows: 2,
								value: bypass.reason,
								onChange: (e) => setBypass({
									...bypass,
									reason: e.target.value
								})
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-tools",
								children: [(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: busy || !bypass.reason.trim(),
									onClick: () => {
										action(async () => {
											await call("workflow-bypass", {
												runId: run.id,
												nodeId: bypass.nodeId,
												activationId: bypass.activationId,
												reason: bypass.reason,
												confirmed: true
											});
											setBypass(void 0);
										});
									},
									children: "确认跳过并沿用输入"
								}), (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: busy,
									onClick: () => setBypass(void 0),
									children: "取消"
								})]
							})
						]
					}),
					!readOnly && revisionTask && (0, react_jsx_runtime.jsx)(RevisionPanel, {
						meetingId,
						task: revisionTask,
						memberName: name(revisionTask.toSessionId),
						onChanged,
						onClose: () => setRevisionTarget(void 0)
					}, revisionTask.taskId),
					!readOnly && preview && (0, react_jsx_runtime.jsxs)("section", {
						ref: previewRef,
						role: "region",
						"aria-label": "流程执行预览",
						style: {
							padding: 12,
							border: "2px solid #2470b5",
							borderRadius: 12
						},
						children: [
							(0, react_jsx_runtime.jsx)("b", { children: "确认本次输入与执行" }),
							Object.entries(preview.plan.memberAvailability ?? {}).map(([id, status]) => !status.connected ? (0, react_jsx_runtime.jsxs)("p", {
								role: "status",
								children: [name(id), "：原窗口尚未加载。确认执行后插件核对并恢复同一原会话；归档、删除或状态无法确认时停止投递，可在成员边栏处理，不会创建替代会话。"]
							}, id) : status.busy ? (0, react_jsx_runtime.jsxs)("p", {
								role: "status",
								children: [name(id), "：原窗口忙碌，本任务将等待，不能打断当前工作。"]
							}, id) : null),
							preview.initial && preview.collaboration === "automatic" && (0, react_jsx_runtime.jsxs)("details", {
								open: true,
								children: [
									(0, react_jsx_runtime.jsx)("summary", { children: preview.perNode ? "本次逐环节运行的完整配置" : "本次自动协作的完整配置" }),
									(0, react_jsx_runtime.jsx)("p", { children: automaticSummary }),
									(0, react_jsx_runtime.jsx)("p", { children: "仅正式结构化结果推进；普通讨论和未批准任务卡不会推进。你随时可暂停或停止。" })
								]
							}),
							(0, react_jsx_runtime.jsx)("strong", { children: "确认本次输入与执行" }),
							preview.plan.items.map((item) => (0, react_jsx_runtime.jsxs)("div", { children: [
								(0, react_jsx_runtime.jsxs)("p", { children: [
									(0, react_jsx_runtime.jsx)("b", { children: item.node.title }),
									" → ",
									item.node.kind === "minutes" ? "会议秘书" : item.node.memberIds.map(name).join("、"),
									" · 第",
									item.view.round || 1,
									"轮 · 约",
									item.characters,
									"字符"
								] }),
								(0, react_jsx_runtime.jsx)("p", {
									style: { whiteSpace: "pre-wrap" },
									children: item.node.instruction
								}),
								item.messageIds.map((messageId) => (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsxs)("summary", { children: ["引用：", messages.find((m) => m.id === messageId)?.text.slice(0, 70) ?? messageId] }), (0, react_jsx_runtime.jsx)("p", {
									style: {
										whiteSpace: "pre-wrap",
										overflowWrap: "anywhere"
									},
									children: messages.find((m) => m.id === messageId)?.text
								})] }, messageId)),
								item.assetIds.map((assetId) => (0, react_jsx_runtime.jsxs)("p", { children: [
									"附件：",
									assets.find((a) => a.id === assetId)?.name,
									" · v",
									assets.find((a) => a.id === assetId)?.version
								] }, assetId))
							] }, item.node.id)),
							preview.plan.warnings?.map((w) => (0, react_jsx_runtime.jsx)("p", {
								role: "alert",
								children: w
							}, w)),
							!preview.plan.ready && (0, react_jsx_runtime.jsx)("ul", { children: preview.plan.missing.map((x) => (0, react_jsx_runtime.jsx)("li", { children: x }, x)) }),
							(0, react_jsx_runtime.jsx)("p", { children: preview.perNode ? "只有已勾选环节可自动接收并运行，未勾选环节手动开始；保存不执行，验收、选路、异常与额度上限仍停下；重启需你确认继续。" : preview.initial && preview.collaboration === "automatic" ? `确认后按整个保存模式自动接力：普通投递最多${d.limits.workAttempts}次，秘书最多${d.limits.minutesStarts}次；验收、选路和标为需确认的环节暂停，返工按设定上限停止；重启需你确认继续。` : "确认后仅开始上述环节。取消不会投递。" }),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-workflow-tools",
								children: [(0, react_jsx_runtime.jsxs)("button", {
									style: uiButton,
									disabled: busy || dirty || !preview.plan.ready || !!(preview.initial && preview.collaboration === "automatic" && (freeSteps && preview.perNode && preview.plan.automaticWarnings !== void 0 ? preview.plan.automaticWarnings.length : (!preview.perNode || (freeSteps ? preview.plan.items.some((item) => item.node.autoReceiveAndRun === true) : d.nodes.find((n) => n.id === d.entryId)?.autoReceiveAndRun === true)) && preview.plan.warnings?.length)),
									onClick: () => {
										start();
									},
									children: ["确认开始", preview.plan.items.length > 1 ? ` ${preview.plan.items.length} 个环节` : ""]
								}), (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: busy,
									onClick: () => setPreview(void 0),
									children: "取消预览"
								})]
							})
						]
					}),
					!readOnly && issues.length > 0 && (0, react_jsx_runtime.jsxs)("div", {
						role: "alert",
						children: [(0, react_jsx_runtime.jsxs)("b", { children: [
							"流程还有 ",
							issues.length,
							" 个问题"
						] }), (0, react_jsx_runtime.jsx)("ul", { children: issues.map((e, i) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsx)("button", {
							style: {
								...uiButton,
								textAlign: "left"
							},
							onClick: () => {
								if (e.nodeId) setSelected(e.nodeId);
								else if (e.edgeId) {
									const edge = d.edges.find((x) => x.id === e.edgeId);
									if (edge) setSelected(edge.from);
								}
							},
							children: e.message
						}) }, i)) })]
					}),
					!readOnly && run && ready.length > 0 && (0, react_jsx_runtime.jsxs)("section", {
						ref: readySectionRef,
						children: [(0, react_jsx_runtime.jsx)("b", { children: "下一步可开始" }), (0, react_jsx_runtime.jsxs)("div", {
							className: "rt-workflow-tools",
							style: { marginTop: 6 },
							children: [ready.map((v) => (0, react_jsx_runtime.jsxs)("button", {
								style: uiButton,
								disabled: busy || dirty || admissionBlocked || meeting.releasePaused,
								onClick: () => {
									setSelected(v.nodeId);
									inspect([v.nodeId]);
								},
								children: ["预览：", d.nodes.find((n) => n.id === v.nodeId)?.title]
							}, v.nodeId)), d.parallelGroups.filter((g) => g.branchIds.every((nodeId) => ready.some((v) => v.nodeId === nodeId))).map((g) => (0, react_jsx_runtime.jsxs)("button", {
								style: uiButton,
								disabled: busy || dirty || admissionBlocked || meeting.releasePaused,
								onClick: () => {
									inspect(g.branchIds);
								},
								children: [
									"一起开始 ",
									g.branchIds.length,
									" 个并行环节…"
								]
							}, g.id))]
						})]
					}),
					missingHistory || workflow && !workflowSchemaSupported(workflow.schemaVersion) ? (0, react_jsx_runtime.jsx)("section", {
						"aria-label": "流程内容不可用",
						role: "status",
						children: missingHistory ? "所选历史运行已不存在，当前配置不会冒充历史记录。请返回当前配置后查看。" : "此流程版本当前无法解释，请升级到兼容版本后查看。"
					}) : (0, react_jsx_runtime.jsxs)("div", {
						className: sequenceMode ? "rt-workflow-layout rt-workflow-list-layout" : "rt-workflow-layout",
						ref: contentRef,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							style: {
								minWidth: 0,
								display: "flex",
								flexDirection: "column",
								gap: 10
							},
							children: [
								!sequenceMode && (0, react_jsx_runtime.jsxs)("div", {
									className: "rt-workflow-content-heading",
									children: [(0, react_jsx_runtime.jsx)("h4", {
										style: {
											margin: 0,
											fontSize: 14
										},
										children: "会议环节"
									}), !readOnly && !freeSteps && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										onClick: () => {
											if (!canMutate()) return;
											let number = d.nodes.length + 1;
											while (d.nodes.some((n) => n.title === "环节 " + number)) number++;
											const nodeId = id(), next = {
												id: nodeId,
												title: `环节 ${number}`,
												kind: "work",
												memberIds: [],
												instruction: "",
												inputs: [],
												includeIncoming: true
											};
											edit({
												...d,
												entryId: d.entryId || nodeId,
												nodes: [...d.nodes, next],
												positions: {
													...d.positions,
													[nodeId]: {
														x: 30 + d.nodes.length % 3 * 270,
														y: 30 + Math.floor(d.nodes.length / 3) * 180
													}
												}
											});
											setSelected(nodeId);
										},
										children: "＋ 添加环节"
									})]
								}),
								mode === "graph" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: "rt-workflow-tools",
										children: [
											!readOnly && !freeSteps && (0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												disabled: !d.nodes.length,
												onClick: () => {
													const errors = validateWorkflowGraph(d);
													setIssues(errors);
													if (!errors.length) edit(layoutWorkflow(d), true);
												},
												children: "整理图形"
											}),
											(0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												onClick: () => {
													setManualZoomRequest((n) => n + 1);
													setZoom((z) => clampWorkflowZoom(z - .15));
												},
												children: "缩小"
											}),
											(0, react_jsx_runtime.jsxs)("span", {
												"aria-live": "polite",
												style: { alignSelf: "center" },
												children: [Math.round(zoom * 100), "%"]
											}),
											(0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												onClick: () => {
													setManualZoomRequest((n) => n + 1);
													setZoom((z) => clampWorkflowZoom(z + .15));
												},
												children: "放大"
											}),
											(0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												onClick: () => setFitRequest((n) => n + 1),
												children: "适配画布"
											}),
											(0, react_jsx_runtime.jsx)("small", {
												style: { alignSelf: "center" },
												children: "Ctrl＋滚轮缩放"
											})
										]
									}),
									(0, react_jsx_runtime.jsx)(WorkflowCanvas, {
										definition: freeSteps ? layoutWorkflow(d) : d,
										views,
										run,
										selected,
										onSelect: setSelected,
										zoom,
										onZoomChange: setZoom,
										fitRequest,
										manualZoomRequest,
										members,
										readOnly: readOnly || freeSteps,
										selectedEdge: edgeDraft?.existing ? edgeDraft.id : void 0,
										onSelectEdge: freeSteps ? void 0 : selectEdge,
										onConnect: freeSteps ? void 0 : connect,
										onMove: (nodeId, x, y) => {
											if (!readOnly && !freeSteps) edit({
												...d,
												positions: {
													...d.positions,
													[nodeId]: {
														x,
														y
													}
												}
											}, true);
										}
									}),
									(0, react_jsx_runtime.jsx)("small", { children: freeSteps ? "此图仅查看步骤的依赖关系，请在步骤列表编辑。" : (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: "拖动右侧圆点到下一环节左侧圆点连线；也可依次点击两点。点击连线可改类型或删除。拖节点调整位置，Alt＋方向键也可移动；编辑不执行任务。" }) })
								] }) : (0, react_jsx_runtime.jsx)(WorkflowSteps, {
									definition: d,
									members,
									run,
									views,
									selected,
									busy,
									readOnly,
									messages,
									assets,
									onSelect: setSelected,
									onEdit: editSteps,
									onPrepareEmpty: prepareEmpty,
									onShowGraph: () => setMode("graph"),
									onOpenMembers: () => onNavigate?.("members"),
									renderExecution: (nodeId) => nodeId === node?.id ? execution : void 0
								}),
								!sequenceMode && execution
							]
						}), !sequenceMode && !freeSteps && node && (0, react_jsx_runtime.jsx)(WorkflowInspector, {
							definition: d,
							node,
							view: mode,
							members,
							messages,
							assets,
							run: active,
							readOnly: readOnly || freeSteps,
							onChange: (next) => {
								if (!validInspector() || freeSteps || next.id !== node.id) return;
								previewEpoch.current.version++;
								setConfirmRaw(void 0);
								setDraft((current) => current.definition.id === d.id && current.definition.nodes.some((n) => n.id === next.id) ? {
									...current,
									definition: {
										...current.definition,
										nodes: current.definition.nodes.map((n) => n.id === next.id ? next : n)
									}
								} : current);
								setDirty(true);
								setIssues([]);
								setPreview(void 0);
							},
							onRemove: () => {
								if (!validInspector() || freeSteps) return;
								setConfirm({
									text: `删除“${node.title}”及相连路线？相关并行组和回路配置需要重新检查。`,
									action: async () => {
										if (!validInspector()) throw new Error("当前环节已切换，请重新选择后删除");
										edit(removeWorkflowNode(d, node.id, active));
										setSelected("");
										setEdgeDraft(void 0);
									}
								});
							}
						}, `${meetingId}:${d.id}:${node.id}:${historyId}`)]
					}),
					!readOnly && !sequenceMode && !freeSteps && (0, react_jsx_runtime.jsxs)("details", { children: [
						(0, react_jsx_runtime.jsx)("summary", {
							title: "顺序是接着处理；并行是多人同时处理后汇合；返工是你选择修改后重新评审。",
							children: "更多流程设置：连线、同时处理与返工"
						}),
						!frozen && (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "高级起点：分支与返工" }), (0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							disabled: busy,
							onClick: () => setConfirm({
								text: "将编辑区替换为三人评审示例。你可以调整成员和要求；载入不会执行。",
								action: async () => {
									edit(template(members));
									setSelected("proposal");
									setMode("graph");
								}
							}),
							children: "载入分支返工示例"
						})] }),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "rt-workflow-field",
							style: { marginTop: 10 },
							children: [
								(0, react_jsx_runtime.jsxs)("label", { children: ["流程名称", (0, react_jsx_runtime.jsx)("input", {
									"aria-label": "流程名称",
									style: uiInput,
									value: d.title,
									onChange: (e) => edit({
										...d,
										title: e.target.value
									})
								})] }),
								(0, react_jsx_runtime.jsxs)("label", { children: ["起始环节", nodeOptions(d.entryId, (v) => edit({
									...d,
									entryId: v
								}), "起始环节")] }),
								(0, react_jsx_runtime.jsxs)("fieldset", {
									style: { minWidth: 0 },
									children: [(0, react_jsx_runtime.jsx)("legend", { children: "添加连线" }), (0, react_jsx_runtime.jsxs)("div", {
										className: "rt-workflow-field",
										children: [
											nodeOptions(from, setFrom, "连线起点"),
											nodeOptions(to, setTo, "连线终点"),
											(0, react_jsx_runtime.jsxs)("select", {
												"aria-label": "连线类型",
												style: uiInput,
												value: edgeKind,
												onChange: (e) => setEdgeKind(e.target.value),
												children: [
													(0, react_jsx_runtime.jsx)("option", {
														value: "flow",
														children: "顺序／并行分支"
													}),
													(0, react_jsx_runtime.jsx)("option", {
														value: "choice",
														children: "人工选择出口"
													}),
													(0, react_jsx_runtime.jsx)("option", {
														value: "loop",
														children: "返回下一轮"
													})
												]
											}),
											edgeKind === "choice" && (0, react_jsx_runtime.jsx)("input", {
												"aria-label": "出口名称",
												placeholder: "例如：通过、需要修改",
												style: uiInput,
												value: edgeLabel,
												onChange: (e) => setEdgeLabel(e.target.value)
											}),
											" ",
											edgeKind === "loop" && (0, react_jsx_runtime.jsxs)("select", {
												"aria-label": "所属回路",
												style: uiInput,
												value: edgeLoop,
												onChange: (e) => setEdgeLoop(e.target.value),
												children: [(0, react_jsx_runtime.jsx)("option", {
													value: "",
													children: "选择回路"
												}), d.loops.map((l) => (0, react_jsx_runtime.jsx)("option", {
													value: l.id,
													children: d.nodes.find((n) => n.id === l.gateId)?.title ?? l.id
												}, l.id))]
											}),
											(0, react_jsx_runtime.jsx)("button", {
												style: uiButton,
												disabled: !from || !to || from === to,
												onClick: () => applyEdge({
													id: id(),
													from,
													to,
													kind: edgeKind,
													...edgeKind === "choice" ? { label: edgeLabel } : {},
													...edgeKind === "loop" ? { loopId: edgeLoop } : {}
												}),
												children: "连接这两个环节"
											})
										]
									})]
								}),
								d.edges.map((e) => (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 6,
										flexWrap: "wrap"
									},
									children: [(0, react_jsx_runtime.jsxs)("span", { children: [
										d.nodes.find((n) => n.id === e.from)?.title,
										" → ",
										d.nodes.find((n) => n.id === e.to)?.title,
										" · ",
										e.label ?? (e.kind === "loop" ? "返回下一轮" : "顺序")
									] }), (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										"aria-label": `删除连线 ${e.id}`,
										onClick: () => deleteEdge(e.id),
										children: "移除"
									})]
								}, e.id)),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: frozen,
									onClick: () => edit({
										...d,
										parallelGroups: [...d.parallelGroups, {
											id: id(),
											sourceId: "",
											branchIds: [],
											joinId: ""
										}]
									}),
									children: "＋ 添加并行组"
								}),
								d.parallelGroups.map((g, i) => (0, react_jsx_runtime.jsxs)("fieldset", {
									disabled: frozen,
									style: { minWidth: 0 },
									children: [
										(0, react_jsx_runtime.jsxs)("legend", {
											title: "从同一环节分给多人，等所需结果都返回再继续。",
											children: ["同时处理组 ", i + 1]
										}),
										(0, react_jsx_runtime.jsxs)("label", { children: ["分支来源", nodeOptions(g.sourceId, (v) => edit({
											...d,
											parallelGroups: d.parallelGroups.map((x) => x.id === g.id ? {
												...x,
												sourceId: v
											} : x)
										}), "并行来源")] }),
										(0, react_jsx_runtime.jsxs)("label", { children: ["汇合到", nodeOptions(g.joinId, (v) => edit({
											...d,
											parallelGroups: d.parallelGroups.map((x) => x.id === g.id ? {
												...x,
												joinId: v
											} : x)
										}), "并行汇合")] }),
										(0, react_jsx_runtime.jsx)("p", { children: "选中此组实际并行的入口，并连接来源和汇合节点。" }),
										d.nodes.map((n) => (0, react_jsx_runtime.jsxs)("label", {
											style: { display: "block" },
											children: [(0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: g.branchIds.includes(n.id),
												onChange: () => edit({
													...d,
													parallelGroups: d.parallelGroups.map((x) => x.id === g.id ? {
														...x,
														branchIds: x.branchIds.includes(n.id) ? x.branchIds.filter((k) => k !== n.id) : [...x.branchIds, n.id]
													} : x)
												})
											}), n.title]
										}, n.id)),
										(0, react_jsx_runtime.jsx)("button", {
											style: uiButton,
											onClick: () => edit({
												...d,
												parallelGroups: d.parallelGroups.filter((x) => x.id !== g.id)
											}),
											children: "移除并行组配置"
										})
									]
								}, g.id)),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: frozen,
									onClick: () => edit({
										...d,
										loops: [...d.loops, {
											id: id(),
											nodeIds: [],
											entryIds: [],
											gateId: "",
											advanceId: "",
											maxRounds: 3
										}]
									}),
									children: "＋ 添加受控回路"
								}),
								(0, react_jsx_runtime.jsx)("p", { children: "第一版支持独立回路，不支持嵌套／交叉回路。每个回路必须有人工出口和返回连线。" }),
								d.loops.map((l, i) => (0, react_jsx_runtime.jsxs)("fieldset", {
									disabled: frozen,
									style: { minWidth: 0 },
									children: [
										(0, react_jsx_runtime.jsxs)("legend", {
											title: "评审后由你选择通过或修改；修改完成后回到指定评审入口。",
											children: ["返工范围 ", i + 1]
										}),
										(0, react_jsx_runtime.jsxs)("label", { children: ["决定通过或修改", nodeOptions(l.gateId, (v) => edit({
											...d,
											loops: d.loops.map((x) => x.id === l.id ? {
												...x,
												gateId: v
											} : x)
										}), "回路决策门")] }),
										(0, react_jsx_runtime.jsxs)("label", { children: ["修改环节", nodeOptions(l.advanceId, (v) => edit({
											...d,
											loops: d.loops.map((x) => x.id === l.id ? {
												...x,
												advanceId: v
											} : x)
										}), "回路修改环节")] }),
										(0, react_jsx_runtime.jsx)("p", { children: "手动返工每轮由你预览并开始，不限制轮数；自动接力到达下列上限时暂停，须明确追加才能继续。" }),
										(0, react_jsx_runtime.jsxs)("label", { children: ["自动轮次上限", (0, react_jsx_runtime.jsx)("input", {
											"aria-label": `自动轮次上限 ${i + 1}`,
											type: "number",
											min: 1,
											style: uiInput,
											value: l.maxRounds,
											onChange: (e) => edit({
												...d,
												loops: d.loops.map((x) => x.id === l.id ? {
													...x,
													maxRounds: Number(e.target.value)
												} : x)
											})
										})] }),
										(0, react_jsx_runtime.jsx)("p", { children: "回路范围包含评审、汇合和修改；返回入口是修改后重新评审的位置。" }),
										d.nodes.map((n) => (0, react_jsx_runtime.jsxs)("div", { children: [
											(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: l.nodeIds.includes(n.id),
												onChange: () => edit({
													...d,
													loops: d.loops.map((x) => x.id === l.id ? {
														...x,
														nodeIds: x.nodeIds.includes(n.id) ? x.nodeIds.filter((k) => k !== n.id) : [...x.nodeIds, n.id]
													} : x)
												})
											}), n.title] }),
											" ",
											(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: l.entryIds.includes(n.id),
												onChange: () => edit({
													...d,
													loops: d.loops.map((x) => x.id === l.id ? {
														...x,
														entryIds: x.entryIds.includes(n.id) ? x.entryIds.filter((k) => k !== n.id) : [...x.entryIds, n.id]
													} : x)
												})
											}), "返回入口"] })
										] }, n.id)),
										(0, react_jsx_runtime.jsx)("button", {
											style: uiButton,
											onClick: () => edit({
												...d,
												loops: d.loops.filter((x) => x.id !== l.id),
												edges: d.edges.filter((e) => e.loopId !== l.id)
											}),
											children: "移除此回路和返回边"
										})
									]
								}, l.id)),
								(0, react_jsx_runtime.jsxs)("fieldset", {
									disabled: !!active,
									style: { minWidth: 0 },
									children: [(0, react_jsx_runtime.jsx)("legend", { children: "本次运行额度" }), [
										["nodeAttempts", "每节点每轮尝试"],
										["workAttempts", "普通成员投递总数"],
										["minutesStarts", "秘书生成发起数"]
									].map(([key, label]) => (0, react_jsx_runtime.jsxs)("label", {
										style: { display: "block" },
										children: [label, (0, react_jsx_runtime.jsx)("input", {
											"aria-label": label,
											type: "number",
											min: 1,
											style: uiInput,
											value: d.limits[key],
											onChange: (e) => edit({
												...d,
												limits: {
													...d.limits,
													[key]: Number(e.target.value)
												}
											})
										})]
									}, key))]
								})
							]
						})
					] })
				]
			});
		}
		//#endregion
		//#region lib/client/member-creation.js
		var MemberCreationStopped = class extends Error {
			constructor() {
				super("DSH 实例已变化，旧创建进度已停止；请重新打开原实例继续");
			}
		};
		const memberCreationStageText = (step) => step.stage === "done" ? "已加入会议" : step.stage === "create" ? "等待创建／核实窗口" : step.stage === "rename" ? "窗口已创建，等待设置名称" : step.stage === "verify" ? "名称已设置，等待核验工作区" : "工作区已核验，等待加入会议";
		function memberCreationBatch(existing, knights, workspaceIds) {
			return {
				id: crypto.randomUUID(),
				members: [...existing.map((x) => ({
					instanceId: `existing-${x.sessionId}`,
					sessionId: x.sessionId,
					title: x.title,
					stage: "join"
				})), ...knights.map((x, i) => ({
					instanceId: x.instanceId,
					sessionId: `session-round-table-${crypto.randomUUID()}`,
					title: x.title,
					presetId: x.presetId,
					workspaceId: workspaceIds[i],
					role: x.role,
					stage: "create"
				}))]
			};
		}
		/** Persist identity before the first remote call. Official session.create adopts that same ID after response loss. */
		async function runMemberCreation(batch, connection, join, save, isCurrent = () => true) {
			const next = structuredClone(batch);
			const checkpoint = () => {
				if (!isCurrent()) throw new MemberCreationStopped();
				save(structuredClone(next));
			};
			checkpoint();
			for (const step of next.members) {
				if (step.stage === "done") continue;
				delete step.error;
				checkpoint();
				try {
					if (step.stage === "create") {
						const result = await connection.api.sessions.create({
							sessionId: step.sessionId,
							agentPreset: step.presetId,
							workspaceId: step.workspaceId
						});
						if (!result.result.ok) throw Error(`创建失败：${result.result.error.message}`);
						if (result.result.value.sessionId !== step.sessionId) throw Error("宿主返回的窗口身份与本次创建记录不一致；请核实，不会加入会议");
						step.stage = "rename";
						checkpoint();
					}
					if (step.stage === "rename") {
						const result = await connection.api.sessions.rename({
							sessionId: step.sessionId,
							title: step.title
						});
						if (!result.result.ok) throw Error(`标题设置失败：${result.result.error.message}`);
						step.stage = "verify";
						checkpoint();
					}
					if (step.presetId && (step.stage === "verify" || step.stage === "join")) {
						const result = await connection.api.workspace.list({});
						if (!result.result.ok || !result.result.value.items.some((x) => x.workspaceId === step.workspaceId && x.sessionIds?.includes(step.sessionId))) throw Error("无法确认窗口归属原定工作区；未入会／未简报");
						step.stage = "join";
						checkpoint();
					}
					if (step.stage === "join") {
						await join(step);
						step.stage = "done";
						checkpoint();
					}
				} catch (error) {
					if (error instanceof MemberCreationStopped || !isCurrent()) throw new MemberCreationStopped();
					step.error = error instanceof Error ? error.message : String(error);
					checkpoint();
				}
			}
			return next;
		}
		//#endregion
		//#region lib/client/MinutesPanel.js
		const button$2 = {
			font: "inherit",
			padding: "5px 9px",
			borderRadius: 7,
			border: "1px solid var(--dsw-alias-border-l1)",
			background: "var(--dsw-alias-bg-base)",
			color: "inherit",
			cursor: "pointer"
		};
		const statusName = (s) => ({
			completed: "已提交",
			accepted: "已验收",
			changes_requested: "要求修改",
			not_reviewed: "未验收",
			queued: "等待投递",
			offline: "原窗口未连接",
			in_progress: "处理中",
			failed: "失败",
			cancelled: "已结束"
		})[s] ?? s;
		const scopeText = (m) => m.integrity?.facts.taskScope?.mode === "since_last" ? `本次增量涉及 ${m.integrity.facts.taskScope.changedTaskIds.length} 项任务${m.integrity.facts.taskScope.addedTaskIds ? "，其中新增 " + m.integrity.facts.taskScope.addedTaskIds.length + " 项" : ""}；下方总数为全会快照。` : "";
		const factsMarkdown = (m) => m.integrity ? "\n\n## 系统事实与核对\n" + m.integrity.facts.scopeLabel + "；任务" + m.integrity.facts.counts.total + "项，已验收" + m.integrity.facts.counts.accepted + "项。\n" + m.integrity.warnings.join("\n") + "\n" + m.integrity.coverage + "\n" + scopeText(m) : "";
		const minutesMarkdown = (m) => `# 会议纪要\n\n${m.summary}\n\n` + [
			["关键决策", m.keyDecisions],
			["任务进展", m.taskProgress],
			["未决事项", m.openItems]
		].map(([title, items]) => `## ${title}\n\n${items.map((x) => `- ${x}`).join("\n") || "无"}`).join("\n\n") + factsMarkdown(m);
		function MinutesPanel({ meetingId, ready, minutes = [], job, onChanged, formalOnly = false, publishedIds = [], members = [] }) {
			const { meetingCall, isCurrent } = useScopedOperations();
			const [share, setShare] = (0, react.useState)();
			const [shareError, setShareError] = (0, react.useState)("");
			const guard = (0, react.useRef)(false), dialog = (0, react.useRef)(null), returnFocus = (0, react.useRef)();
			const closeShare = () => {
				if (guard.current) return;
				setShare(void 0);
				setShareError("");
				returnFocus.current?.focus();
			};
			const openShare = (value, trigger) => {
				returnFocus.current = trigger;
				setShareError("");
				setShare(value);
			};
			(0, react.useEffect)(() => {
				if (share) dialog.current?.focus();
			}, [share?.id, share?.mode]);
			(0, react.useEffect)(() => () => {
				returnFocus.current?.focus();
			}, []);
			const [scope, setScope] = (0, react.useState)("full");
			const [busy, setBusy] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [inputPreview, setInputPreview] = (0, react.useState)();
			const action = async (name, body = {}, contextual = false) => {
				if (guard.current) return false;
				if (!isCurrent()) {
					const message = "DSH 实例已变化，请重新打开圆桌并核对纪要";
					if (contextual) setShareError(message);
					else setError(message);
					return false;
				}
				guard.current = true;
				setBusy(name);
				setError(void 0);
				if (contextual) setShareError("");
				try {
					await meetingCall(meetingId, name, body);
					if (!isCurrent()) return true;
					try {
						await onChanged();
					} catch (e) {
						setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`);
					}
					return true;
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					if (contextual) setShareError(message);
					else setError(message);
					return false;
				} finally {
					setBusy(void 0);
					guard.current = false;
				}
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				"data-round-table-minutes": "",
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					fontSize: 12,
					padding: 10,
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 10
				},
				children: [
					(0, react_jsx_runtime.jsx)("strong", { children: "会议纪要 · 草稿 → 核对 → 分享" }),
					(0, react_jsx_runtime.jsxs)("label", { children: ["整理范围 ", (0, react_jsx_runtime.jsxs)("select", {
						"aria-label": "纪要范围",
						value: scope,
						onChange: (e) => setScope(e.target.value),
						disabled: !!busy || job?.status === "running",
						style: button$2,
						children: [(0, react_jsx_runtime.jsx)("option", {
							value: "full",
							children: "全量"
						}), (0, react_jsx_runtime.jsx)("option", {
							value: "since_last",
							children: "自上次以来"
						})]
					})] }),
					(0, react_jsx_runtime.jsxs)("p", {
						style: {
							margin: 0,
							opacity: .7
						},
						children: [
							formalOnly ? "只整理正式会议消息、任务状态与人工发布内容，不读取未发布的原窗口私聊。" : "读取参会范围内的原会话发言。",
							"纪要先保存预览，不自动发送。",
							scope === "since_last" && !minutes.some((m) => m.cursors && (!formalOnly || m.source === "formal")) ? " 尚无同来源生成基线，将按全量整理。" : ""
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6
						},
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								style: button$2,
								disabled: !!busy || job?.status === "running",
								onClick: () => {
									setBusy("preview");
									meetingCall(meetingId, "minutes-data", { scope }).then((v) => {
										if (isCurrent()) setInputPreview(v.data);
									}).catch((e) => {
										if (isCurrent()) setError(String(e));
									}).finally(() => {
										if (isCurrent()) setBusy(void 0);
									});
								},
								children: "预览读取范围"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: button$2,
								disabled: !ready || !!busy || job?.status === "running",
								onClick: () => {
									action("minutes", { scope });
								},
								children: "生成纪要"
							}),
							job?.status === "running" && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: button$2,
								disabled: !!busy,
								onClick: () => {
									action("cancel-minutes");
								},
								children: "取消生成"
							})
						]
					}),
					inputPreview && (0, react_jsx_runtime.jsxs)("div", {
						role: "region",
						"aria-label": "纪要输入预览",
						children: [
							(0, react_jsx_runtime.jsx)("b", { children: inputPreview.source === "formal" ? "正式会议资料" : "包括参会期原会话回复" }),
							(0, react_jsx_runtime.jsxs)("p", { children: [
								inputPreview.events.length,
								" 条会议记录；",
								inputPreview.members.reduce((n, m) => n + m.messages.length, 0),
								" 条原会话回复。生成时会重新读取最新数据。"
							] }),
							(0, react_jsx_runtime.jsx)("button", {
								style: button$2,
								onClick: () => downloadText("minutes-input.json", JSON.stringify(inputPreview, null, 2), "application/json"),
								children: "导出完整输入核对"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: button$2,
								onClick: () => setInputPreview(void 0),
								children: "关闭预览"
							})
						]
					}),
					!ready && job?.status !== "running" && (0, react_jsx_runtime.jsx)("p", {
						style: { margin: 0 },
						children: "请先配置会议秘书。"
					}),
					!minutes.length && job?.status !== "running" && ready && (0, react_jsx_runtime.jsx)("p", {
						style: { margin: 0 },
						children: "还没有纪要。先在讨论中记录内容，再选择整理范围并生成；生成后可以保留不发送。"
					}),
					job?.status === "running" && (0, react_jsx_runtime.jsxs)("p", {
						role: "status",
						style: { margin: 0 },
						children: [
							"正在整理…已启动 ",
							job.modelCalls,
							" 次生成"
						]
					}),
					(job?.status === "failed" || job?.status === "cancelled") && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						style: {
							margin: 0,
							color: "var(--dsw-alias-state-error-primary)"
						},
						children: [job.error ?? "生成已取消", "（未推进读取范围）"]
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: {
							margin: 0,
							color: "var(--dsw-alias-state-error-primary)"
						},
						children: error
					}),
					[...minutes].reverse().map((m, index) => (0, react_jsx_runtime.jsxs)("details", {
						open: index === 0,
						"data-minutes-id": m.id,
						style: {
							borderTop: "1px solid var(--dsw-alias-border-l2)",
							paddingTop: 8
						},
						children: [
							(0, react_jsx_runtime.jsxs)("summary", {
								style: { cursor: "pointer" },
								children: [
									new Date(m.generatedAt).toLocaleString(),
									" · ",
									m.scope === "full" ? "全量" : "增量",
									" · ",
									m.sent ? "已发送" : m.deliveries?.some((d) => d.status === "delivered") ? "部分发送" : "未发送"
								]
							}),
							(0, react_jsx_runtime.jsx)("strong", { children: "摘要" }),
							(0, react_jsx_runtime.jsx)("p", {
								style: {
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere"
								},
								children: m.summary
							}),
							[
								["关键决策", m.keyDecisions],
								["任务进展与责任", m.taskProgress],
								["未决事项与下一步", m.openItems]
							].map(([label, items]) => (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("strong", { children: label }), items.length ? (0, react_jsx_runtime.jsx)("ul", {
								style: {
									paddingLeft: 18,
									overflowWrap: "anywhere"
								},
								children: items.map((text, i) => (0, react_jsx_runtime.jsx)("li", { children: text }, i))
							}) : (0, react_jsx_runtime.jsx)("p", { children: "无" })] }, label)),
							m.integrity && (0, react_jsx_runtime.jsxs)("p", {
								role: m.integrity.warnings.length ? "alert" : "status",
								children: [m.integrity.warnings.length ? "发现内容冲突，请展开证据逐项核对。" : m.integrity.reviewedAt ? "主持人已核对；这不是自动认证。" : "待人工核对。", !m.integrity.reviewedAt && (0, react_jsx_runtime.jsx)("button", {
									style: button$2,
									disabled: !!busy,
									onClick: (e) => openShare({
										id: m.id,
										mode: "review"
									}, e.currentTarget),
									children: "核对后确认"
								})]
							}),
							(0, react_jsx_runtime.jsxs)("details", { children: [
								(0, react_jsx_runtime.jsx)("summary", { children: "生成信息与原始证据" }),
								(0, react_jsx_runtime.jsxs)("p", {
									style: { opacity: .7 },
									children: [
										m.source === "formal" ? "正式资料（含簿记与任务状态）" : "原会话发言",
										" ",
										m.sourceCount ?? "未知",
										" 条 · 子代理 ",
										m.modelCalls,
										" 次 · 模型步骤 ",
										m.requestCount ?? "未提供计数",
										" 次（不含传输重试）"
									]
								}),
								m.cutoff && (0, react_jsx_runtime.jsxs)("p", {
									style: { opacity: .7 },
									children: ["整理截止：", new Date(m.cutoff).toLocaleString()]
								}),
								(m.missing?.length ?? m.missingSessionIds?.length ?? 0) > 0 && (0, react_jsx_runtime.jsxs)("p", {
									role: "alert",
									style: { color: "var(--dsw-alias-state-error-primary)" },
									children: [
										"部分数据缺失：",
										m.missing?.map((s) => `${s.sessionId}（${s.error}）`).join("；") ?? m.missingSessionIds?.join("、"),
										"。下次增量将重试缺失范围。"
									]
								}),
								m.integrity && (0, react_jsx_runtime.jsxs)("section", {
									"aria-label": "纪要事实核对",
									style: {
										border: "1px solid var(--dsw-alias-border-l2)",
										padding: 10,
										borderRadius: 8,
										marginBottom: 8
									},
									children: [
										(0, react_jsx_runtime.jsx)("b", { children: m.integrity.warnings.length ? "发现内容冲突 · 需人工核对" : m.integrity.reviewedAt ? "主持人已核对 · 非自动认证" : "待人工核对的纪要草稿" }),
										(0, react_jsx_runtime.jsxs)("p", { children: [
											m.integrity.facts.scopeLabel,
											"：任务",
											m.integrity.facts.counts.total,
											"项，已提交",
											m.integrity.facts.counts.submitted,
											"项，已验收",
											m.integrity.facts.counts.accepted,
											"项，待验收",
											m.integrity.facts.counts.awaitingReview,
											"项，要求修改",
											m.integrity.facts.counts.changesRequested,
											"项。"
										] }),
										scopeText(m) && (0, react_jsx_runtime.jsx)("p", { children: scopeText(m) }),
										m.integrity.warnings.map((w) => (0, react_jsx_runtime.jsx)("p", {
											role: "alert",
											children: w
										}, w)),
										(0, react_jsx_runtime.jsx)("p", { children: m.integrity.coverage }),
										(0, react_jsx_runtime.jsxs)("details", { children: [
											(0, react_jsx_runtime.jsx)("summary", { children: "核对任务与成员依据" }),
											(0, react_jsx_runtime.jsxs)("p", { children: ["成员：", m.integrity.facts.members.join("、") || "无"] }),
											m.integrity.facts.tasks.map((t) => (0, react_jsx_runtime.jsxs)("div", {
												style: {
													padding: 6,
													borderBottom: "1px solid var(--dsw-alias-border-l2)"
												},
												children: [
													(0, react_jsx_runtime.jsxs)("b", { children: [
														t.member,
														" · ",
														t.title || "任务"
													] }),
													(0, react_jsx_runtime.jsxs)("p", { children: [
														t.kind,
														" · ",
														statusName(t.status),
														" · ",
														statusName(t.review)
													] }),
													t.result && (0, react_jsx_runtime.jsx)("p", {
														style: { whiteSpace: "pre-wrap" },
														children: t.result
													}),
													(0, react_jsx_runtime.jsxs)("small", { children: [
														t.id,
														" · 来源 ",
														t.source
													] })
												]
											}, t.id))
										] })
									]
								}),
								!m.integrity && (0, react_jsx_runtime.jsx)("p", { children: "历史纪要未记录系统核对快照；请对照原始任务核对，不自动标为已验收。" })
							] }),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: button$2,
								disabled: !!busy || publishedIds.includes(m.id) || !!m.integrity && !m.integrity.reviewedAt,
								onClick: (e) => openShare({
									id: m.id,
									mode: "publish"
								}, e.currentTarget),
								children: publishedIds.includes(m.id) ? "已公开到会议" : "公开到会议（不唤醒成员）"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: button$2,
								disabled: !!busy || m.sending || m.sent || !!m.integrity && !m.integrity.reviewedAt,
								onClick: (e) => openShare({
									id: m.id,
									mode: "send"
								}, e.currentTarget),
								children: m.sending ? "发送中…" : m.sent ? "已发送" : m.deliveries?.some((d) => d.status === "undelivered") ? "重试未送达成员" : "发送通知给成员"
							}),
							!m.sent && (0, react_jsx_runtime.jsx)("span", {
								style: {
									marginLeft: 8,
									opacity: .7
								},
								children: "也可以保留不发送"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: button$2,
								onClick: () => downloadText(`纪要-${m.id}.md`, minutesMarkdown(m)),
								children: "导出此纪要"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: button$2,
								onClick: () => {
									navigator.clipboard.writeText(minutesMarkdown(m)).catch((e) => setError(`复制失败，请使用导出：${String(e)}`));
								},
								children: "复制纪要"
							}),
							m.deliveries?.map((d) => (0, react_jsx_runtime.jsxs)("p", {
								style: {
									fontSize: 11,
									overflowWrap: "anywhere"
								},
								children: [
									d.status === "delivered" ? "✓ 已入队" : "✗ 未送达",
									" ",
									members.find((x) => x.id === d.sessionId)?.name ?? d.sessionId,
									d.error ? `：${d.error}` : ""
								]
							}, d.sessionId))
						]
					}, m.id)),
					share && (0, react_jsx_runtime.jsx)("div", {
						style: {
							position: "fixed",
							inset: 0,
							zIndex: 100,
							background: "rgba(0,0,0,.25)",
							display: "grid",
							placeItems: "center",
							padding: 24
						},
						children: (0, react_jsx_runtime.jsxs)("div", {
							ref: dialog,
							role: "alertdialog",
							"aria-modal": true,
							"aria-label": "确认纪要操作",
							tabIndex: -1,
							onKeyDown: (event) => {
								if (event.key === "Escape") {
									event.preventDefault();
									closeShare();
								} else if (event.key === "Tab") {
									const controls = dialog.current?.querySelectorAll("button:not(:disabled), [tabindex=\"0\"]");
									if (controls?.length) {
										const first = controls[0], last = controls[controls.length - 1];
										if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
											event.preventDefault();
											last.focus();
										} else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
											event.preventDefault();
											first.focus();
										}
									} else {
										event.preventDefault();
										dialog.current?.focus();
									}
								}
							},
							style: {
								padding: 20,
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: 12,
								background: "var(--dsw-alias-bg-base)",
								maxWidth: 560,
								width: "100%",
								maxHeight: "80vh",
								overflow: "auto",
								boxSizing: "border-box"
							},
							children: [
								(0, react_jsx_runtime.jsx)("b", { children: share.mode === "review" ? "确认已逐项核对" : share.mode === "publish" ? "公开到会议" : "发送通知给成员" }),
								(0, react_jsx_runtime.jsxs)("p", { children: [
									new Date(minutes.find((n) => n.id === share.id)?.generatedAt ?? 0).toLocaleString(),
									" · ",
									minutes.find((n) => n.id === share.id)?.scope === "full" ? "全量" : "增量",
									" · ",
									share.id.slice(-8)
								] }),
								(0, react_jsx_runtime.jsx)("blockquote", {
									style: {
										margin: "8px 0",
										whiteSpace: "pre-wrap",
										overflowWrap: "anywhere"
									},
									children: minutes.find((n) => n.id === share.id)?.summary.slice(0, 300)
								}),
								(0, react_jsx_runtime.jsx)("p", { children: share.mode === "review" ? "请逐项核对系统数量、任务原结果、成员和正文。确认只记录你的核对动作，不会把模型内容自动认证为正确。" : share.mode === "publish" ? "把这份纪要作为会议资料公开，不唤醒任何成员。" : "将发送给：" + (members.map((x) => x.name).join("、") || "本会普通成员") + "。成员可能开始回应并消耗模型额度，秘书不接收通知。" }),
								minutes.find((n) => n.id === share.id)?.integrity?.warnings.length ? (0, react_jsx_runtime.jsx)("p", {
									role: "alert",
									children: "已有冲突仍保留，分享与导出附上冲突说明；若不接受，请取消并重新整理。"
								}) : null,
								shareError && (0, react_jsx_runtime.jsxs)("p", {
									role: "alert",
									children: [shareError, "。可重试同一份纪要，跳过已记录送达的成员；若上次投递结果不确定，请先核对原窗口。"]
								}),
								busy && (0, react_jsx_runtime.jsx)("p", {
									role: "status",
									children: "正在提交，请等待结果…"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									style: button$2,
									disabled: !!busy,
									onClick: () => {
										const current = share;
										action(current.mode === "review" ? "review-minutes" : current.mode === "publish" ? "publish-minutes" : "send-minutes", {
											minutesId: current.id,
											confirmed: true,
											acknowledgeConflicts: true
										}, true).then((ok) => {
											if (ok) closeShare();
										});
									},
									children: shareError ? "重试此操作" : "确认"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									style: button$2,
									disabled: !!busy,
									onClick: closeShare,
									children: "取消"
								})
							]
						})
					})
				]
			});
		}
		//#endregion
		//#region lib/client/MeetingManagement.js
		const button$1 = {
			font: "inherit",
			padding: "5px 8px",
			border: "1px solid var(--dsw-alias-border-l1)",
			borderRadius: 6,
			background: "var(--dsw-alias-bg-base)",
			color: "inherit",
			cursor: "pointer"
		};
		function MeetingManagement({ meeting, onChanged, onDeleted }) {
			const { meetingCall, isCurrent } = useScopedOperations();
			const [edit, setEdit] = (0, react.useState)(false), [title, setTitle] = (0, react.useState)(meeting.title), [description, setDescription] = (0, react.useState)(meeting.description ?? "");
			const [confirm, setConfirm] = (0, react.useState)(false), [notify, setNotify] = (0, react.useState)(true), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)();
			const [archiveConfirm, setArchiveConfirm] = (0, react.useState)(false), [sourceConfirm, setSourceConfirm] = (0, react.useState)(false);
			const refreshAccepted = async () => {
				if (!isCurrent()) return;
				try {
					await onChanged();
				} catch (e) {
					if (isCurrent()) setError(`操作已接受，列表刷新失败，请刷新查看，无需重复执行：${String(e)}`);
				}
			};
			const manage = async (action, body) => {
				if (busy || !isCurrent()) return;
				setBusy(true);
				setError(void 0);
				try {
					await meetingCall(meeting.meetingId, action, body);
					await refreshAccepted();
				} catch (e) {
					if (isCurrent()) setError(String(e instanceof Error ? e.message : e));
				} finally {
					if (isCurrent()) setBusy(false);
				}
			};
			const act = async (action, body) => {
				if (busy || !isCurrent()) return;
				setBusy(true);
				setError(void 0);
				try {
					const result = await meetingCall(meeting.meetingId, action, body);
					if (!isCurrent()) return;
					if (action === "delete") {
						const failed = result.deliveries?.filter((d) => d.status !== "delivered") ?? [];
						onDeleted(`会议已删除，普通成员会话保留。${failed.length ? `未送达通知：${failed.map((d) => `${d.sessionId}（${d.error}）`).join("；")}` : ""}`);
					} else {
						setEdit(false);
						await refreshAccepted();
					}
				} catch (e) {
					if (isCurrent()) {
						setError(e instanceof Error ? e.message : String(e));
						try {
							await onChanged();
						} catch {}
					}
				} finally {
					if (isCurrent()) setBusy(false);
				}
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				"data-meeting-management": "",
				style: {
					fontSize: 12,
					display: "flex",
					flexDirection: "column",
					gap: 6,
					flex: "none"
				},
				children: [
					(0, react_jsx_runtime.jsx)("b", { children: "纪要读取范围" }),
					(0, react_jsx_runtime.jsxs)("p", { children: [
						"当前：",
						meeting.minutesSource === "session" ? "参会期间原会话回复（可能含私聊）" : "仅正式会议资料",
						"。生成前可在纪要页预览输入。已生成的历史纪要不自动改写。"
					] }),
					(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("button", {
						style: button$1,
						disabled: busy || meeting.minutesSource !== "session",
						onClick: () => {
							manage("minutes-source", { source: "formal" });
						},
						children: "只读正式资料"
					}), (0, react_jsx_runtime.jsx)("button", {
						style: button$1,
						disabled: busy || meeting.minutesSource === "session",
						onClick: () => setSourceConfirm(true),
						children: "包括原会话回复…"
					})] }),
					sourceConfirm && (0, react_jsx_runtime.jsxs)("div", {
						role: "alertdialog",
						"aria-label": "确认纪要范围",
						children: [
							(0, react_jsx_runtime.jsx)("p", { children: "这会读取成员参会期间的原会话回复，可能包含未发布的私聊。是否允许？" }),
							(0, react_jsx_runtime.jsx)("button", {
								style: button$1,
								onClick: () => {
									manage("minutes-source", {
										source: "session",
										confirmed: true
									});
									setSourceConfirm(false);
								},
								children: "确认允许读取"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: button$1,
								onClick: () => setSourceConfirm(false),
								children: "取消"
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("b", { children: "保存与整理" }),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6,
							flexWrap: "wrap"
						},
						children: [(0, react_jsx_runtime.jsx)("button", {
							style: button$1,
							disabled: busy,
							onClick: () => {
								if (!isCurrent()) return;
								setBusy(true);
								meetingCall(meeting.meetingId, "export").then((v) => {
									if (isCurrent()) downloadText(`${meeting.title.replace(/[\\/:*?"<>|]/g, "_")}.md`, v.markdown);
								}).catch((e) => {
									if (isCurrent()) setError(String(e));
								}).finally(() => {
									if (isCurrent()) setBusy(false);
								});
							},
							children: "导出会议与验收记录"
						}), (0, react_jsx_runtime.jsx)("button", {
							style: button$1,
							disabled: busy,
							onClick: () => meeting.archivedAt ? void manage("archive", { archived: false }) : setArchiveConfirm(true),
							children: meeting.archivedAt ? "恢复归档会议" : "结束并归档…"
						})]
					}),
					archiveConfirm && (0, react_jsx_runtime.jsxs)("div", {
						role: "alertdialog",
						"aria-label": "确认归档",
						children: [
							(0, react_jsx_runtime.jsx)("p", { children: "保留全部资料，结束未完成的会议等待，不停止或删除原窗口。归档后可恢复。" }),
							(0, react_jsx_runtime.jsx)("button", {
								style: button$1,
								onClick: () => {
									manage("archive", {
										archived: true,
										confirmed: true
									});
									setArchiveConfirm(false);
								},
								children: "确认归档"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: button$1,
								onClick: () => setArchiveConfirm(false),
								children: "取消"
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 6
						},
						children: [(0, react_jsx_runtime.jsx)("button", {
							style: button$1,
							type: "button",
							disabled: busy || !!meeting.deletion,
							onClick: () => {
								setTitle(meeting.title);
								setDescription(meeting.description ?? "");
								setEdit(true);
								setConfirm(false);
							},
							children: "编辑会议信息"
						}), (0, react_jsx_runtime.jsx)("button", {
							style: {
								...button$1,
								color: "var(--dsw-alias-state-error-primary)"
							},
							type: "button",
							disabled: busy,
							onClick: () => {
								setConfirm(true);
								setEdit(false);
							},
							children: "删除会议"
						})]
					}),
					edit && (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 6
						},
						children: [
							(0, react_jsx_runtime.jsxs)("label", { children: ["会议标题", (0, react_jsx_runtime.jsx)("input", {
								"aria-label": "编辑会议标题",
								value: title,
								onChange: (e) => setTitle(e.target.value),
								disabled: busy
							})] }),
							(0, react_jsx_runtime.jsxs)("label", { children: ["会议说明", (0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": "编辑会议说明",
								value: description,
								onChange: (e) => setDescription(e.target.value),
								disabled: busy
							})] }),
							(0, react_jsx_runtime.jsxs)("div", { children: [
								(0, react_jsx_runtime.jsx)("button", {
									style: button$1,
									disabled: busy || !title.trim(),
									onClick: () => {
										act("edit", {
											title,
											description
										});
									},
									children: "保存修改"
								}),
								" ",
								(0, react_jsx_runtime.jsx)("button", {
									style: button$1,
									disabled: busy,
									onClick: () => setEdit(false),
									children: "取消编辑"
								})
							] })
						]
					}),
					meeting.secretaryTitleError && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						children: [
							"会议已改名，秘书名称同步失败：",
							meeting.secretaryTitleError,
							" ",
							(0, react_jsx_runtime.jsx)("button", {
								style: button$1,
								disabled: busy || !!meeting.deletion,
								onClick: () => {
									act("edit", {
										title: meeting.title,
										description: meeting.description ?? ""
									});
								},
								children: "重试同步名称"
							})
						]
					}),
					meeting.deletion && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						children: ["会议正在删除或删除未完成，仅可重试删除。", meeting.deletion.error]
					}),
					confirm && (0, react_jsx_runtime.jsxs)("div", {
						role: "alertdialog",
						"aria-label": "确认永久删除会议",
						style: {
							border: "1px solid var(--dsw-alias-state-error-primary)",
							padding: 8,
							borderRadius: 8
						},
						children: [
							(0, react_jsx_runtime.jsxs)("p", { children: [
								"永久删除会议「",
								meeting.title,
								"」、全部会议记录及其专属秘书会话，无法恢复。普通成员会话不受影响。"
							] }),
							(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: meeting.deletion?.notify ?? notify,
								onChange: (e) => setNotify(e.target.checked),
								disabled: busy || !!meeting.deletion
							}), "通知普通参会成员会议已解散"] }),
							(0, react_jsx_runtime.jsxs)("div", {
								style: { marginTop: 8 },
								children: [
									(0, react_jsx_runtime.jsx)("button", {
										style: button$1,
										disabled: busy,
										onClick: () => setConfirm(false),
										children: "取消"
									}),
									" ",
									(0, react_jsx_runtime.jsx)("button", {
										style: {
											...button$1,
											color: "var(--dsw-alias-state-error-primary)"
										},
										disabled: busy,
										onClick: () => {
											act("delete", {
												confirmed: true,
												notify
											});
										},
										children: busy ? "删除中…" : "永久删除"
									})
								]
							})
						]
					}),
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: { overflowWrap: "anywhere" },
						children: error
					})
				]
			});
		}
		//#endregion
		//#region lib/client/meeting-list-state.js
		function sortedMeetings(meetings, query, archived) {
			const q = query.trim().toLowerCase();
			return meetings.filter((m) => !!m.archivedAt === archived && `${m.title} ${m.description ?? ""}`.toLowerCase().includes(q)).sort((a, b) => Number(!!b.pinnedAt) - Number(!!a.pinnedAt) || (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || (b.lastActivity ?? b.createdAt) - (a.lastActivity ?? a.createdAt) || a.meetingId.localeCompare(b.meetingId));
		}
		function meetingListStatus(m) {
			if (m.deletion) return {
				label: "删除未完成",
				tone: "warning"
			};
			if (m.archivedAt) return {
				label: "已归档",
				tone: "neutral"
			};
			if (m.listReadOnly) return {
				label: "需升级后管理",
				tone: "warning"
			};
			if (m.releasePaused || m.workflowStatus === "paused") return {
				label: "已暂停",
				tone: "neutral"
			};
			if ((m.counts?.faults ?? 0) > 0) return {
				label: "需核实／故障",
				tone: "warning"
			};
			if ((m.counts?.awaitingReview ?? 0) > 0) return {
				label: "待验收",
				tone: "review"
			};
			if (m.counts?.awaitingReview === void 0 && (m.counts?.attention ?? 0) > 0) return {
				label: "待处理／验收",
				tone: "neutral"
			};
			if ((m.counts?.pending ?? 0) > 0 || m.workflowStatus === "active") return {
				label: "进行中",
				tone: "active"
			};
			if (m.workflowStatus === "completed") return {
				label: "流程已完成",
				tone: "done"
			};
			if (m.workflowStatus === "stopped") return {
				label: "流程已停止",
				tone: "neutral"
			};
			return {
				label: "可讨论",
				tone: "neutral"
			};
		}
		function matchesMeetingState(m, type) {
			if (type === "review") return (m.counts?.awaitingReview ?? 0) > 0;
			if (type === "fault") return (m.counts?.faults ?? 0) > 0 || !!m.deletion || !!m.listReadOnly || m.secretary?.status === "failed";
			if (type === "running") return (m.counts?.running ?? 0) > 0 || m.workflowStatus === "active" || m.secretary?.status === "initializing";
			return true;
		}
		//#endregion
		//#region lib/client/MeetingList.js
		function MeetingList({ meetings, onCreate, onOpen, onChanged }) {
			const { meetingCall, isCurrent } = useScopedOperations();
			const now = useRelativeNow();
			const [query, setQuery] = (0, react.useState)(""), [archived, setArchived] = (0, react.useState)(false), [managing, setManaging] = (0, react.useState)(false);
			const [stateType, setStateType] = (0, react.useState)("all");
			const [selected, setSelected] = (0, react.useState)([]), [confirmation, setConfirmation] = (0, react.useState)(), [outcomes, setOutcomes] = (0, react.useState)([]);
			const [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(""), [notice, setNotice] = (0, react.useState)(""), [progress, setProgress] = (0, react.useState)(0);
			const guard = (0, react.useRef)(false);
			const listed = sortedMeetings(meetings ?? [], query, archived).filter((m) => matchesMeetingState(m, stateType)), eligible = listed.filter((m) => !m.deletion && !m.listReadOnly && !m.archivedAt);
			const eligibleIds = eligible.map((m) => m.meetingId), selectedVisible = selected.filter((id) => eligibleIds.includes(id)), all = eligible.length > 0 && selectedVisible.length === eligible.length;
			(0, react.useEffect)(() => {
				setSelected((old) => old.filter((id) => eligibleIds.includes(id)));
			}, [eligibleIds.slice().sort().join("|")]);
			const resetSelection = () => {
				setSelected([]);
				setConfirmation(void 0);
				setOutcomes([]);
				setNotice("");
				setError("");
			};
			const pin = async (m) => {
				if (guard.current || !isCurrent()) return;
				guard.current = true;
				setBusy(true);
				setError("");
				setNotice("");
				setProgress(0);
				try {
					await meetingCall(m.meetingId, "pin", { pinned: !m.pinnedAt });
					if (!isCurrent()) return;
					await onChanged();
					if (isCurrent()) setNotice(m.pinnedAt ? "已取消置顶。" : "会议已置顶。");
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					guard.current = false;
					setBusy(false);
				}
			};
			const archive = async () => {
				if (guard.current || !confirmation?.length || !isCurrent()) return;
				guard.current = true;
				setBusy(true);
				setError("");
				setNotice("");
				setProgress(0);
				setOutcomes([]);
				const snapshot = confirmation, results = [];
				setConfirmation(void 0);
				try {
					for (const item of snapshot) {
						if (!isCurrent()) return;
						try {
							await meetingCall(item.meetingId, "archive", {
								archived: true,
								confirmed: true
							});
							results.push({
								...item,
								ok: true
							});
						} catch (e) {
							results.push({
								...item,
								ok: false,
								error: e instanceof Error ? e.message : String(e)
							});
						}
						if (!isCurrent()) return;
						setProgress(results.length);
						setOutcomes([...results]);
					}
					setSelected(results.filter((r) => !r.ok).map((r) => r.meetingId));
					const succeeded = results.filter((r) => r.ok).length;
					setNotice(`已归档 ${succeeded} 个会议${results.length > succeeded ? `，${results.length - succeeded} 个未确认成功；请查看下方原因。` : "。"}`);
					await onChanged();
				} catch (e) {
					setError(`列表刷新失败，请刷新核对：${String(e)}`);
				} finally {
					guard.current = false;
					setBusy(false);
				}
			};
			const badgeColor = (tone) => tone === "warning" ? "var(--dsw-alias-state-error-primary,#9a5600)" : tone === "active" ? "var(--dsw-alias-state-business-primary,#2470b5)" : tone === "review" ? "var(--dsw-alias-label-primary)" : tone === "done" ? "#16794c" : "var(--dsw-alias-label-secondary)";
			return (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": "会议列表",
				style: {
					display: "flex",
					flexDirection: "column",
					flex: 1,
					minHeight: 0,
					minWidth: 0,
					fontSize: 12
				},
				children: [(0, react_jsx_runtime.jsxs)("div", {
					style: {
						flex: "none",
						marginBottom: 8,
						display: "flex",
						flexDirection: "column",
						gap: 8
					},
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 6,
								flexWrap: "wrap"
							},
							children: [(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: onCreate,
								children: "新建会议"
							}), (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy || archived || meetings === void 0,
								"aria-pressed": managing,
								onClick: () => {
									setManaging(!managing);
									resetSelection();
								},
								children: managing ? "退出管理" : "管理会议"
							})]
						}),
						(0, react_jsx_runtime.jsx)("input", {
							"aria-label": "搜索会议",
							placeholder: "搜索会议名称或说明",
							style: uiInput,
							value: query,
							disabled: busy,
							onChange: (e) => {
								setQuery(e.target.value);
								resetSelection();
							}
						}),
						(0, react_jsx_runtime.jsxs)("label", { children: ["状态 ", (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": "按会议状态筛选",
							value: stateType,
							disabled: busy,
							style: uiButton,
							onChange: (e) => {
								setStateType(e.target.value);
								resetSelection();
							},
							children: [
								(0, react_jsx_runtime.jsx)("option", {
									value: "all",
									children: "全部状态"
								}),
								(0, react_jsx_runtime.jsx)("option", {
									value: "review",
									children: "待验收"
								}),
								(0, react_jsx_runtime.jsx)("option", {
									value: "fault",
									children: "需核实／故障"
								}),
								(0, react_jsx_runtime.jsx)("option", {
									value: "running",
									children: "执行中"
								})
							]
						})] }),
						(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: archived,
							disabled: busy,
							onChange: (e) => {
								setArchived(e.target.checked);
								setManaging(false);
								resetSelection();
							}
						}), "查看已归档会议"] }),
						managing && (0, react_jsx_runtime.jsxs)("div", {
							style: {
								padding: 8,
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: 8,
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: [
								(0, react_jsx_runtime.jsxs)("label", { children: [(0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									"aria-label": "全选当前筛选结果",
									checked: all,
									disabled: busy || !eligible.length,
									onChange: () => {
										setSelected(all ? [] : eligibleIds);
										setConfirmation(void 0);
									}
								}), "全选当前筛选结果"] }),
								(0, react_jsx_runtime.jsxs)("span", { children: [
									"已选 ",
									selectedVisible.length,
									" 个会议"
								] }),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									disabled: busy || !selectedVisible.length,
									onClick: () => setConfirmation(eligible.filter((m) => selectedVisible.includes(m.meetingId)).map((m) => ({
										meetingId: m.meetingId,
										title: m.title
									}))),
									children: "归档所选会议…"
								}),
								(0, react_jsx_runtime.jsx)("small", { children: "更改搜索或归档视图会清空选择。" })
							]
						}),
						busy && progress > 0 && (0, react_jsx_runtime.jsxs)("p", {
							role: "status",
							style: { margin: 0 },
							children: [
								"已处理 ",
								progress,
								" 个会议…"
							]
						}),
						notice && (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							style: {
								margin: 0,
								overflowWrap: "anywhere"
							},
							children: notice
						}),
						error && (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							style: {
								margin: 0,
								color: "var(--dsw-alias-state-error-primary)",
								overflowWrap: "anywhere"
							},
							children: error
						})
					]
				}), (0, react_jsx_runtime.jsxs)("div", {
					style: {
						flex: 1,
						minHeight: 0,
						minWidth: 0,
						overflowY: "auto",
						overflowX: "hidden"
					},
					children: [
						confirmation && (0, react_jsx_runtime.jsxs)("section", {
							role: "alertdialog",
							"aria-label": "确认批量归档",
							style: {
								border: "1px solid var(--dsw-alias-border-l2)",
								padding: 10,
								borderRadius: 8,
								marginBottom: 10,
								overflowWrap: "anywhere"
							},
							children: [
								(0, react_jsx_runtime.jsxs)("b", { children: [
									"归档以下 ",
									confirmation.length,
									" 个会议？"
								] }),
								(0, react_jsx_runtime.jsx)("p", { children: "保留会议资料和成员会话；结束这些会议的未完成等待与流程，取消正在生成的纪要。原成员窗口中的工作不会被停止。恢复会议后，已结束的等待不会自动重开。" }),
								(0, react_jsx_runtime.jsx)("ul", {
									style: {
										paddingLeft: 20,
										maxHeight: 160,
										overflowY: "auto"
									},
									children: confirmation.map((m) => (0, react_jsx_runtime.jsxs)("li", { children: [
										m.title,
										" ",
										(0, react_jsx_runtime.jsxs)("small", { children: ["· ", m.meetingId.slice(-6)] })
									] }, m.meetingId))
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										flexWrap: "wrap",
										gap: 6
									},
									children: [(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy,
										onClick: () => {
											archive();
										},
										children: "确认归档所选会议"
									}), (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy,
										onClick: () => setConfirmation(void 0),
										children: "取消归档"
									})]
								})
							]
						}),
						outcomes.length > 0 && (0, react_jsx_runtime.jsxs)("details", {
							open: outcomes.some((r) => !r.ok),
							style: {
								marginBottom: 10,
								overflowWrap: "anywhere"
							},
							children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
								"本次归档结果（",
								outcomes.length,
								"）"
							] }), (0, react_jsx_runtime.jsx)("ul", {
								style: { paddingLeft: 20 },
								children: outcomes.map((r) => (0, react_jsx_runtime.jsxs)("li", { children: [
									r.title,
									"：",
									r.ok ? "已归档" : `未确认成功：${r.error}。可刷新核对后重试。`
								] }, r.meetingId))
							})]
						}),
						meetings === void 0 ? (0, react_jsx_runtime.jsx)("p", { children: "加载中…" }) : !listed.length ? (0, react_jsx_runtime.jsxs)("div", {
							style: {
								padding: 10,
								lineHeight: 1.7
							},
							children: [
								(0, react_jsx_runtime.jsx)("p", { children: query ? "没有匹配当前搜索与状态的会议。" : stateType !== "all" ? `当前筛选下没有${stateType === "review" ? "待验收" : stateType === "fault" ? "需核实／故障" : "执行中"}的会议。` : archived ? "暂无已归档会议。讨论结束后，可在管理模式中归档整理。" : "暂无会议。点击“新建会议”，填写目标并邀请成员开始讨论。" }),
								query && (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									onClick: () => {
										setQuery("");
										resetSelection();
									},
									children: "清除搜索"
								}),
								stateType !== "all" && (0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									onClick: () => {
										setStateType("all");
										resetSelection();
									},
									children: "查看全部状态"
								})
							]
						}) : null,
						(0, react_jsx_runtime.jsx)("ul", {
							style: {
								listStyle: "none",
								margin: 0,
								padding: 0,
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: listed.map((m) => {
								const status = meetingListStatus(m);
								return (0, react_jsx_runtime.jsxs)("li", {
									"data-meeting-list-row": m.meetingId,
									style: {
										border: "1px solid var(--dsw-alias-border-l2)",
										borderRadius: 9,
										minWidth: 0,
										padding: 8,
										display: "flex",
										flexDirection: "column",
										gap: 6
									},
									children: [(0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: 6,
											flexWrap: "wrap",
											minWidth: 0
										},
										children: [
											managing && (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												"data-meeting-select": m.meetingId,
												"aria-label": `选择会议「${m.title}」`,
												checked: selectedVisible.includes(m.meetingId),
												disabled: busy || !eligibleIds.includes(m.meetingId),
												onChange: () => {
													setSelected((old) => old.includes(m.meetingId) ? old.filter((id) => id !== m.meetingId) : [...old, m.meetingId]);
													setConfirmation(void 0);
												}
											}),
											(0, react_jsx_runtime.jsx)("span", {
												"data-meeting-state": m.meetingId,
												style: {
													fontSize: 11,
													color: badgeColor(status.tone)
												},
												children: status.label
											}),
											(0, react_jsx_runtime.jsx)("button", {
												"data-meeting-pin": m.meetingId,
												style: {
													...uiButton,
													padding: "2px 6px",
													marginLeft: "auto",
													fontSize: 11,
													whiteSpace: "nowrap"
												},
												"aria-label": `${m.pinnedAt ? "取消置顶" : "置顶"}「${m.title}」`,
												"aria-pressed": !!m.pinnedAt,
												disabled: busy || !!m.deletion || m.listReadOnly,
												onClick: () => {
													pin(m);
												},
												children: m.pinnedAt ? "★ 已置顶" : "☆ 置顶"
											})
										]
									}), (0, react_jsx_runtime.jsxs)("button", {
										"data-round-table-meeting": m.meetingId,
										type: "button",
										disabled: busy,
										onClick: () => onOpen(m.meetingId),
										style: {
											...uiButton,
											padding: 0,
											border: 0,
											display: "flex",
											flexDirection: "column",
											alignItems: "flex-start",
											gap: 4,
											width: "100%",
											minWidth: 0,
											textAlign: "left",
											overflowWrap: "anywhere"
										},
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												title: m.title,
												style: {
													fontSize: 13,
													fontWeight: 500,
													maxWidth: "100%",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap"
												},
												children: m.title
											}),
											(0, react_jsx_runtime.jsxs)("span", {
												style: {
													fontSize: 11,
													color: "var(--dsw-alias-label-tertiary)"
												},
												children: [
													m.memberSessionIds.length,
													" 位成员 · 最近活动 ",
													(0, react_jsx_runtime.jsx)(RelativeTime, {
														timestamp: m.lastActivity ?? m.createdAt,
														now
													})
												]
											}),
											(0, react_jsx_runtime.jsx)("span", {
												style: { fontSize: 12 },
												children: m.counts?.awaitingReview !== void 0 ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
													m.counts.awaitingReview,
													" 项待验收 · ",
													m.counts.faults ?? 0,
													" 项需核实／故障 · ",
													m.counts.running ?? 0,
													" 项执行中"
												] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
													m.counts?.pending ?? 0,
													" 项未结束 · ",
													m.counts?.attention ?? 0,
													" 项待处理／验收"
												] })
											}),
											!m.deletion && m.secretary?.status !== "ready" && (0, react_jsx_runtime.jsx)("span", {
												style: {
													fontSize: 11,
													color: "var(--dsw-alias-state-error-primary)"
												},
												children: m.secretary?.status === "initializing" ? "秘书初始化中" : m.secretary ? "秘书需要重试" : "未配置会议秘书 · 进入会议补建"
											})
										]
									})]
								}, m.meetingId);
							})
						})
					]
				})]
			});
		}
		//#endregion
		//#region lib/task-card-projection.js
		const member = (m, id) => id ? m.memberNames?.[id] ?? "原会议成员" : "待确认";
		const generated = (c) => c.versions.find((v) => v.source === "generator") ?? c.versions[0];
		function taskCardGenerationRequestText(m, g) {
			const names = g.recipientIds.map((id) => member(m, id)).join("、"), target = g.cardId ? m.taskCards?.find((c) => c.id === g.cardId) : void 0;
			return g.kind === "adjust" ? `请原生成成员${names}调整「${target?.title ?? "指定任务卡"}」的 v${g.baseVersion}。\n调整意见：${g.adjustmentNote ?? "以这次明确调整请求为准"}\n返回内容仅为建议，不覆盖当前编辑，不立即执行。` : `请${names}依据各自实际收到的会议上下文提出后续任务卡。${g.userInstruction ? `\n额外说明：${g.userInstruction}` : "\n主持人没有额外正文。"}\n每项待办一张卡；生成属于准备工作，待逐项修改和确认发布后才通知执行。`;
		}
		function taskCardResponseText(m, g, sid) {
			const response = g.responses.find((r) => r.sessionId === sid);
			if (!response) return "原成员已回传本次生成内容，卡片入库尚待核实；不会自动执行。";
			if (response.emptyReason) return `${member(m, sid)}没有提出新的待办：${response.emptyReason}\n这不是已完成工作成果。`;
			if (g.kind === "adjust") {
				const p = (m.taskCards?.find((c) => c.id === g.cardId))?.proposals.find((p) => p.generationId === g.id);
				return p ? `${member(m, sid)}返回「${p.title}」的调整建议，基于 v${p.baseVersion}。尚未采纳，不覆盖现有正文。\n\n${p.body}` : "调整内容已回传，建议版本入库待核实。";
			}
			return `${member(m, sid)}提出 ${response.cardIds.length} 项后续工作，尚未批准执行。\n\n${response.cardIds.map((id) => {
				const c = m.taskCards?.find((c) => c.id === id);
				if (!c) return "卡片记录缺失，请核对";
				const v = generated(c);
				return `## ${v.title}\n生成：${member(m, c.generatorSessionId)} · 建议执行：${member(m, v.assigneeSessionId)} · 原稿 v${v.version}\n\n${v.body}`;
			}).join("\n\n")}`;
		}
		function projectTaskCardMessage(m, message) {
			const publication = m.cardPublications?.find((p) => p.status === "published" && p.cards.some((c) => c.releaseId && `sent-${c.releaseId}` === (message.id ?? message.messageId)));
			if (publication) {
				const c = publication.cards.find((c) => c.releaseId && `sent-${c.releaseId}` === (message.id ?? message.messageId));
				return `已批准发布「${c.title}」 · v${c.version}\n生成：${member(m, c.generatorSessionId)} · 执行：${member(m, c.assigneeSessionId)}\n本会文件：${c.relativePath ?? "文件位置待核实"}\n已加入执行通知队列；通知与接收不代表完成。\n\n${c.body}`;
			}
			const mid = message.id ?? message.messageId, d = m.discussions?.find((d) => d.id === message.discussionId || d.messageId === mid || d.replies.some((r) => r.messageId === mid)), g = m.taskCardGenerations?.find((g) => g.discussionId === d?.id || g.discussionId === message.discussionId);
			if (!g) return void 0;
			if (d?.messageId === mid || message.sender === "user" || message.by === "user") return taskCardGenerationRequestText(m, g);
			const sid = (d?.replies.find((r) => r.messageId === mid))?.sessionId ?? message.sender ?? message.by;
			if (!sid || !g.recipientIds.includes(sid)) return "任务卡生成回应待核实。";
			return taskCardResponseText(m, g, sid);
		}
		function taskCardFacts(m) {
			const facts = [];
			for (const g of m.taskCardGenerations ?? []) {
				facts.push({
					id: g.id,
					time: g.createdAt,
					kind: "generation",
					generationId: g.id,
					title: g.kind === "adjust" ? "指定任务卡调整请求" : "已@原成员生成任务卡",
					text: taskCardGenerationRequestText(m, g)
				});
				for (const r of g.responses) facts.push({
					id: `response-${g.id}-${r.sessionId}`,
					time: r.createdAt,
					kind: "proposal",
					generationId: g.id,
					memberId: r.sessionId,
					cardId: g.cardId,
					title: g.kind === "adjust" ? "原生成成员调整建议" : "原成员提出后续工作",
					text: taskCardResponseText(m, g, r.sessionId)
				});
			}
			for (const c of m.taskCards ?? []) for (const v of c.versions.filter((v) => v.source !== "generator")) facts.push({
				id: `card-version-${c.id}-${v.version}`,
				time: v.createdAt,
				kind: "edit",
				cardId: c.id,
				memberId: c.generatorSessionId,
				title: `${v.source === "user" ? "用户修改" : "用户采纳调整"}「${v.title}」 · v${v.version}`,
				text: `${v.source === "user" ? "主持人直接编辑" : "主持人明确采纳原生成者的调整"}，这是卡片版本修改，不等于执行完成。\n执行：${member(m, v.assigneeSessionId)}\n\n${v.body}`
			});
			for (const p of m.cardPublications ?? []) facts.push({
				id: p.id,
				time: p.publishedAt ?? p.createdAt,
				kind: "publication",
				title: p.status === "published" ? "选定任务卡已批准发布" : "任务卡批准写入待核实",
				text: `${p.status === "published" ? p.execute ? "文件已写入，已按批准版本加入通知执行队列；接收与完成仍以执行记录为准。" : "历史批准记录仅保存文件，未通知执行。" : "已保留批准快照；文件写入或回执尚待核实，没有据此宣称执行。"}\n\n${p.cards.map((c) => `## ${c.title} · v${c.version}\n生成：${member(m, c.generatorSessionId)} · 执行：${member(m, c.assigneeSessionId)}${c.relativePath ? `\n本会文件：${c.relativePath}` : ""}\n\n${c.body}`).join("\n\n")}`
			});
			return facts.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
		}
		//#endregion
		//#region lib/client/member-work-log.js
		const taskState = (status) => ({
			queued: "等待投递",
			offline: "未连接，等待恢复",
			delivering: "投递中",
			uncertain: "投递待核实",
			delivered: "已投递，等待正式结果",
			in_progress: "处理中",
			completed: "已提交正式结果",
			failed: "任务失败",
			cancelled: "已结束等待"
		})[status] ?? status;
		const deliveryState = (status) => ({
			queued: "等待接收",
			offline: "未连接",
			delivering: "投递中",
			delivered: "已送入原窗口",
			uncertain: "送达待核实",
			failed: "投递失败",
			cancelled: "已结束"
		})[status] ?? status;
		const sourceLabel = (source, fallback) => source?.kind === "manual" ? `主持人主动选入的原回复${source.seq !== void 0 ? ` #${source.seq}` : ""}${source.excerpt ? " · 节选" : ""}${source.digest ? ` · 来源摘要 ${source.digest}` : ""}` : fallback;
		/** Only this meeting's persisted records are inputs; no raw Session history or model summary. */
		function memberWorkLog(meeting, memberId) {
			const messages = (meeting.messages ?? []).filter((m) => !m.previewOnly), assets = meeting.assets ?? [], items = [], knownMessages = /* @__PURE__ */ new Set();
			const discussions = (meeting.discussions ?? []).filter((d) => d.recipientIds.includes(memberId) || d.replies.some((r) => r.sessionId === memberId));
			const discussionMessages = new Set(discussions.flatMap((d) => [d.messageId, ...d.replies.filter((r) => r.sessionId === memberId).map((r) => r.messageId)]));
			const materials = (messageIds, assetIds, inputs) => [...messageIds.flatMap((id) => {
				const m = (inputs ?? messages).find((m) => m.id === id && !m.previewOnly);
				return m ? [{
					id: m.id,
					name: sourceLabel(m.source, "选定会议消息"),
					text: m.text
				}] : [];
			}), ...assetIds.map((id) => {
				const a = assets.find((x) => x.id === id);
				return {
					id,
					name: a ? `${a.name} · v${a.version}` : "选定附件（内容不可用）",
					...a?.text !== void 0 ? { text: a.text } : {}
				};
			})];
			for (const release of meeting.releases ?? []) for (const task of release.tasks.filter((t) => t.toSessionId === memberId)) {
				const entries = [{
					id: `request-${task.taskId}`,
					kind: "request",
					time: release.releasedAt ?? release.createdAt,
					title: release.parentTaskId ? "修改要求" : "工作要求",
					text: projectTaskCardMessage(meeting, {
						id: `sent-${release.id}`,
						sender: "user",
						text: release.instruction
					}) ?? release.instruction,
					taskId: task.taskId
				}];
				if (release.parentTaskId) entries.push({
					id: `revision-${task.taskId}`,
					kind: "revision",
					time: release.createdAt,
					title: "关联修改任务",
					text: release.revisionNote ?? release.instruction,
					taskId: release.parentTaskId
				});
				knownMessages.add(`sent-${release.id}`);
				if (task.resultMessageId) knownMessages.add(task.resultMessageId);
				if (task.deliveredAt !== void 0) entries.push({
					id: `delivery-${task.taskId}`,
					kind: "delivery",
					time: task.deliveredAt,
					title: "投递到成员原窗口",
					text: "本会已记录原窗口接收这项工作要求；接收不代表完成。",
					taskId: task.taskId
				});
				if (task.restoration) entries.push({
					id: `restoration-${task.taskId}`,
					kind: "delivery",
					time: task.restoration.updatedAt,
					title: task.restoration.state === "restored" ? "原窗口恢复完成" : task.restoration.state === "restoring" ? "正在恢复原窗口" : "原窗口恢复未成功",
					text: task.restoration.reason ?? "恢复状态来自本任务已保存的宿主核对记录。",
					taskId: task.taskId
				});
				if (task.claimedAt !== void 0) entries.push({
					id: `claim-${task.taskId}`,
					kind: "delivery",
					time: task.claimedAt,
					title: "成员认领工作要求",
					text: "成员已明确认领；认领不代表提交成果。",
					taskId: task.taskId
				});
				entries.push({
					id: `state-${task.taskId}`,
					kind: "delivery",
					time: task.closedAt ?? task.updatedAt,
					title: taskState(task.status),
					text: task.status === "cancelled" ? task.closedReason ?? task.error ?? "已结束本会等待；历史内容保留，不代表原窗口停止或任务完成。" : task.error ?? (task.status === "completed" ? "正式结果已记录；验收以主持人意见为准。" : task.deliveredAt ? "已记录投递，当前进展以本会任务状态为准。" : "未记录送达，不代表已执行。"),
					taskId: task.taskId
				});
				if (task.result !== void 0) entries.push({
					id: `result-${task.taskId}`,
					kind: "result",
					time: task.completedAt ?? task.updatedAt,
					title: "正式提交的成果",
					text: task.result,
					taskId: task.taskId,
					messageId: task.resultMessageId,
					source: sourceLabel(task.resultSource, "成员明确提交到本会")
				});
				if (task.reviewHistory?.length) for (const review of task.reviewHistory) entries.push({
					id: `review-${review.id}`,
					kind: "review",
					time: review.time,
					title: review.review === "accepted" ? "主持人验收通过" : "主持人要求修改",
					text: review.note || "已记录主持人的验收动作。",
					taskId: task.taskId
				});
				else if (task.review || task.reviewNote) entries.push({
					id: `review-${task.taskId}`,
					kind: "review",
					time: task.updatedAt,
					title: task.review === "accepted" ? "主持人验收通过" : task.review === "changes_requested" ? "主持人要求修改" : "主持人意见",
					text: task.reviewNote || "已记录主持人的验收动作。",
					taskId: task.taskId
				});
				for (const message of messages.filter((m) => (m.taskId === task.taskId || m.contextTaskId === task.taskId) && !discussionMessages.has(m.id))) {
					knownMessages.add(message.id);
					if (message.id === task.resultMessageId) continue;
					entries.push({
						id: message.id,
						kind: message.sender === memberId ? "reply" : "request",
						time: message.time,
						title: message.sender === memberId ? "本会补充回应（非工作成果）" : "关联会议消息",
						text: message.text,
						taskId: task.taskId,
						messageId: message.id,
						source: sourceLabel(message.source, "本会已公开消息")
					});
				}
				items.push({
					id: task.taskId,
					kind: "task",
					title: release.title ?? release.instruction.slice(0, 60),
					taskId: task.taskId,
					parentTaskId: release.parentTaskId,
					status: taskState(task.status),
					entries,
					materials: materials(release.messageIds, release.assetIds ?? [], release.inputs)
				});
			}
			for (const discussion of discussions) {
				const delivery = discussion.deliveries.find((x) => x.toSessionId === memberId), replies = discussion.replies.filter((x) => x.sessionId === memberId);
				if (!discussion.recipientIds.includes(memberId) && !replies.length) continue;
				knownMessages.add(discussion.messageId);
				replies.forEach((r) => knownMessages.add(r.messageId));
				const entries = [{
					id: `request-${discussion.id}`,
					kind: "request",
					time: discussion.createdAt,
					title: discussion.contextTaskId ? "任务澄清／补充消息" : "普通讨论消息",
					text: projectTaskCardMessage(meeting, {
						id: discussion.messageId,
						discussionId: discussion.id,
						sender: "user"
					}) ?? discussion.instruction,
					messageId: discussion.messageId,
					taskId: discussion.contextTaskId
				}];
				if (delivery) entries.push({
					id: `delivery-${discussion.id}`,
					kind: "delivery",
					time: delivery.deliveredAt ?? delivery.updatedAt,
					title: deliveryState(delivery.status),
					text: delivery.error ?? "仅记录普通消息送达；不建立或完成工作任务。",
					taskId: discussion.contextTaskId
				});
				for (const reply of replies) entries.push({
					id: reply.messageId,
					kind: "reply",
					time: reply.time,
					title: meeting.taskCardGenerations?.some((g) => g.discussionId === discussion.id) ? "原成员准备卡片（非工作成果）" : "普通回应（非工作成果）",
					text: projectTaskCardMessage(meeting, {
						id: reply.messageId,
						discussionId: discussion.id,
						sender: reply.sessionId
					}) ?? reply.text,
					messageId: reply.messageId,
					taskId: discussion.contextTaskId,
					source: "成员明确回传到本会"
				});
				const existing = discussion.contextTaskId ? items.find((x) => x.taskId === discussion.contextTaskId) : void 0;
				if (existing) {
					existing.entries.push(...entries);
					existing.materials.push(...materials(discussion.messageIds, discussion.assetIds, discussion.inputs));
				} else items.push({
					id: discussion.id,
					kind: "discussion",
					title: meeting.taskCardGenerations?.some((g) => g.discussionId === discussion.id) ? meeting.taskCardGenerations.find((g) => g.discussionId === discussion.id)?.kind === "adjust" ? "指定任务卡调整" : "任务卡生成准备" : discussion.contextTaskId ? "关联任务的讨论" : discussion.instruction.slice(0, 60) || "普通讨论",
					taskId: discussion.contextTaskId,
					status: replies.length ? "已有普通回应" : delivery ? deliveryState(delivery.status) : "未记录送达",
					entries,
					materials: materials(discussion.messageIds, discussion.assetIds, discussion.inputs)
				});
			}
			for (const message of messages.filter((m) => !knownMessages.has(m.id) && (m.sender === memberId || m.recipientIds?.includes(memberId)))) items.push({
				id: message.id,
				kind: "discussion",
				title: message.sender === memberId ? "本会发言" : "发送给成员的会议消息",
				status: "已记录会议内容",
				entries: [{
					id: message.id,
					kind: message.sender === memberId ? "reply" : "request",
					time: message.time,
					title: message.sender === memberId ? "本会普通发言（非工作成果）" : "会议消息",
					text: message.text,
					messageId: message.id,
					source: sourceLabel(message.source, "本会公开消息")
				}],
				materials: materials([], message.assetIds ?? [])
			});
			const ownCards = new Set((meeting.taskCards ?? []).filter((c) => c.generatorSessionId === memberId || c.assigneeSessionId === memberId).map((c) => c.id));
			const cardFacts = taskCardFacts({
				...meeting,
				cardPublications: (meeting.cardPublications ?? []).map((p) => ({
					...p,
					cards: p.cards.filter((c) => c.generatorSessionId === memberId || c.assigneeSessionId === memberId)
				})).filter((p) => p.cards.length)
			}).filter((f) => f.kind === "edit" && f.cardId && ownCards.has(f.cardId) || f.kind === "publication");
			for (const fact of cardFacts) items.push({
				id: fact.id,
				kind: "discussion",
				title: fact.title,
				status: fact.kind === "publication" ? "批准发布记录（完成以执行状态为准）" : "卡片版本修改（未执行）",
				entries: [{
					id: fact.id,
					kind: fact.kind === "publication" ? "request" : "revision",
					time: fact.time,
					title: fact.title,
					text: fact.text
				}],
				materials: []
			});
			const participation = (meeting.events ?? []).filter((e) => ["join", "leave"].includes(e.kind) && e.sessionId === memberId).map((e) => ({
				id: e.id,
				kind: "membership",
				time: e.time,
				title: e.kind === "join" ? "加入本会" : "移出本会",
				text: e.kind === "join" ? "成员加入本场会议。" : "历史内容保留，移除不代表原任务完成。"
			}));
			if (participation.length) items.push({
				id: "participation",
				kind: "participation",
				title: "参会记录",
				status: "本会成员变更",
				entries: participation,
				materials: []
			});
			for (const item of items) {
				item.entries.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
				item.materials = item.materials.filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
			}
			return items.sort((a, b) => Math.max(...b.entries.map((e) => e.time)) - Math.max(...a.entries.map((e) => e.time)));
		}
		//#endregion
		//#region lib/client/MemberSidebar.js
		/** Local side-panel navigation does not navigate or replace the mounted discussion. */
		function MemberSidebar({ open, meeting, members, selectedMemberId, onSelectMember, onClose, onNavigateTask, focusTaskId, renderManagement, renderMemberDetails, renderTaskActions }) {
			const [selection, setSelection] = (0, react.useState)(null), [page, setPage] = (0, react.useState)("details"), panel = (0, react.useRef)(null), returnFocus = (0, react.useRef)();
			const selected = selectedMemberId === void 0 ? selection : selectedMemberId, member = members.find((m) => m.id === selected), logs = member ? memberWorkLog(meeting, member.id) : [];
			const choose = (id) => {
				setSelection(id);
				setPage("details");
				onSelectMember?.(id);
			};
			const close = () => {
				onClose();
				returnFocus.current?.focus();
			};
			(0, react.useEffect)(() => {
				if (!open) return;
				if (typeof document !== "undefined") returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : void 0;
				panel.current?.focus();
				return () => returnFocus.current?.focus();
			}, [open]);
			(0, react.useEffect)(() => {
				if (focusTaskId) setPage("log");
			}, [focusTaskId, selected]);
			if (!open) return null;
			return (0, react_jsx_runtime.jsxs)("aside", {
				ref: panel,
				className: "rt-member-sidebar",
				"aria-label": "会议成员边栏",
				tabIndex: -1,
				onKeyDown: (e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						close();
					}
				},
				children: [(0, react_jsx_runtime.jsxs)("header", {
					className: "rt-member-sidebar-header",
					children: [(0, react_jsx_runtime.jsx)("strong", { children: member ? member.name : "会议成员" }), (0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						onClick: close,
						children: "收起成员边栏"
					})]
				}), (0, react_jsx_runtime.jsx)("div", {
					className: "rt-member-sidebar-scroll",
					children: !member ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("p", {
							className: "rt-member-note",
							children: "查看成员详情与本会工作日志；讨论与未发送输入保持原位。"
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: "rt-member-roster",
							children: members.map((m) => (0, react_jsx_runtime.jsxs)("article", { children: [(0, react_jsx_runtime.jsx)("button", {
								style: {
									...uiButton,
									width: "100%",
									textAlign: "left"
								},
								onClick: () => choose(m.id),
								children: m.name
							}), (0, react_jsx_runtime.jsxs)("small", { children: [m.statusLabel ?? (m.running ? "原窗口忙碌" : m.connected ? "可接收" : m.historical ? "历史成员" : "状态待核对"), m.workspaceLabel ? ` · ${m.workspaceLabel}` : ""] })] }, m.id))
						}),
						!members.length && (0, react_jsx_runtime.jsx)("p", { children: "本会尚无成员，可在下方添加原窗口。" }),
						renderManagement?.()
					] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							onClick: () => choose(null),
							children: "返回成员列表"
						}),
						(0, react_jsx_runtime.jsxs)("p", {
							className: "rt-member-note",
							children: [member.statusLabel ?? "原窗口状态以宿主核对为准", member.workspaceLabel ? ` · ${member.workspaceLabel}` : ""]
						}),
						(0, react_jsx_runtime.jsxs)("nav", {
							"aria-label": "成员详情导航",
							className: "rt-member-tabs",
							children: [(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								"aria-pressed": page === "details",
								onClick: () => setPage("details"),
								children: "成员详情"
							}), (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								"aria-pressed": page === "log",
								onClick: () => setPage("log"),
								children: "会议工作日志"
							})]
						}),
						page === "details" ? renderMemberDetails?.(member.id) ?? (0, react_jsx_runtime.jsx)("p", { children: "请选择工作日志查看这位成员在本会的公开记录。" }) : (0, react_jsx_runtime.jsxs)("section", {
							"aria-label": `${member.name}的会议工作日志`,
							children: [
								(0, react_jsx_runtime.jsx)("p", {
									className: "rt-member-note",
									children: "仅整理本会已有要求、资料、投递、回应、修改和验收事实。普通回应不等同工作成果；不自动读取原窗口其他私聊。"
								}),
								!logs.length && (0, react_jsx_runtime.jsx)("p", { children: "这位成员尚无本会工作记录。" }),
								logs.map((item) => (0, react_jsx_runtime.jsxs)("details", {
									open: !!focusTaskId && item.taskId === focusTaskId,
									"data-member-log": item.id,
									children: [
										(0, react_jsx_runtime.jsxs)("summary", { children: [
											item.kind === "task" ? "工作任务" : item.kind === "discussion" ? "普通讨论" : "参会",
											" · ",
											item.title
										] }),
										(0, react_jsx_runtime.jsx)("p", { children: item.status }),
										item.parentTaskId && (0, react_jsx_runtime.jsx)("p", { children: "这是原工作要求的关联修改，原结果仍保留。" }),
										item.taskId && onNavigateTask && (0, react_jsx_runtime.jsx)("button", {
											style: uiButton,
											onClick: () => onNavigateTask(item.taskId),
											children: "查看这项工作"
										}),
										item.materials.length > 0 && (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
											"选定资料（",
											item.materials.length,
											"）"
										] }), item.materials.map((m) => (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("b", { children: m.name }), m.text && (0, react_jsx_runtime.jsx)("p", {
											className: "rt-member-log-text",
											children: m.text
										})] }, m.id))] }),
										item.entries.map((entry) => (0, react_jsx_runtime.jsxs)("article", {
											className: "rt-member-log-entry",
											children: [
												(0, react_jsx_runtime.jsx)("small", { children: new Date(entry.time).toLocaleString() }),
												(0, react_jsx_runtime.jsx)("b", { children: entry.title }),
												(0, react_jsx_runtime.jsx)("p", {
													className: "rt-member-log-text",
													children: entry.text
												}),
												entry.source && (0, react_jsx_runtime.jsx)("small", { children: entry.source })
											]
										}, entry.id))
									]
								}, item.id)),
								renderTaskActions?.(member.id)
							]
						})
					] })
				})]
			});
		}
		//#endregion
		//#region lib/client/meeting-shell-style.js
		/** Parent pane is the sizing authority; discussions remain mounted when the sidebar opens. */
		const meetingShellStyles = `
.rt-meeting-shell{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;position:relative;container:meeting-shell/inline-size;overflow:hidden;gap:0}
.rt-meeting-header{flex:none;display:flex;flex-direction:column;gap:6px;padding:6px 0 8px;border-bottom:1px solid var(--dsw-alias-border-l2);max-height:110px;overflow:auto}
.rt-meeting-header-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.rt-meeting-header h3,.rt-meeting-header p{margin:0}.rt-meeting-header h3{font-size:15px;line-height:22px;overflow-wrap:anywhere}.rt-meeting-header small{font-size:11px;color:var(--dsw-alias-label-secondary)}
.rt-meeting-title-row,.rt-meeting-summary-row{display:flex;align-items:center;gap:6px;min-width:0}.rt-meeting-title-row>b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rt-meeting-title-row>span{font-size:11px;white-space:nowrap}.rt-meeting-summary-row{font-size:11px;overflow-x:auto}.rt-meeting-summary-row>span{white-space:nowrap}.rt-meeting-summary-row>button:last-child{min-width:0;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:auto}.rt-meeting-overview{max-height:160px;overflow:auto;padding:8px;border-top:1px solid var(--dsw-alias-border-l2)}.rt-meeting-overview p{font-size:12px}.rt-meeting-overview button{display:block;max-width:100%;text-align:left;overflow-wrap:anywhere;margin-top:5px}
.rt-meeting-nav{flex:none;display:flex;gap:3px;overflow-x:auto;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:6px}.rt-meeting-nav button{white-space:nowrap}.rt-meeting-nav [aria-selected=true],.rt-meeting-nav [aria-current=page]{border-bottom:2px solid var(--dsw-alias-state-business-primary,#2470b5);font-weight:650}
.rt-meeting-body{display:flex;flex:1;min-height:0;min-width:0;position:relative;overflow:hidden;gap:12px}.rt-meeting-content{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;overflow:hidden}.rt-meeting-scroll-page{flex:1;min-height:0;overflow:auto}
.rt-member-sidebar{position:absolute;inset:0 0 0 auto;width:min(320px,100%);z-index:12;display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:-8px 0 28px #16345922;font-size:12px;outline:none}
.rt-member-sidebar-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}.rt-member-sidebar-scroll{min-height:0;overflow:auto;flex:1;padding:10px;overscroll-behavior:contain}.rt-member-roster{display:flex;flex-direction:column;gap:9px}.rt-member-roster article small{display:block;margin:4px}.rt-member-note{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary);margin:0 0 10px}.rt-member-tabs{display:flex;gap:6px;margin:8px 0 12px}.rt-member-tabs [aria-pressed=true]{font-weight:650;border-color:var(--dsw-alias-state-business-primary,#2470b5)}.rt-member-sidebar details{margin:8px 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px}.rt-member-sidebar summary{cursor:pointer;overflow-wrap:anywhere;line-height:1.5}.rt-member-log-entry{display:flex;flex-direction:column;gap:3px;border-top:1px solid var(--dsw-alias-border-l2);padding:8px 0}.rt-member-log-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;margin:3px 0}.rt-member-sidebar button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#2470b5);outline-offset:2px}
@container meeting-shell (min-width:760px){.rt-member-sidebar{position:relative;inset:auto;width:320px;flex:0 0 320px;z-index:auto;box-shadow:none}.rt-meeting-content{min-width:320px}}
@media(max-height:650px){.rt-meeting-header{max-height:80px;padding:3px 0 5px}.rt-meeting-nav{padding:3px 0;margin-bottom:3px}.rt-member-sidebar-header{padding:7px}}
`;
		//#endregion
		//#region lib/client/MemberTaskActions.js
		/** Execution controls belong to the selected member's meeting work log. */
		function MemberTaskActions({ meetingId, memberId, memberName, releases, discussions = [], onChanged, focusTaskId }) {
			const { meetingCall, isCurrent } = useScopedOperations(), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(""), [revision, setRevision] = (0, react.useState)(), [supplement, setSupplement] = (0, react.useState)(), [confirm, setConfirm] = (0, react.useState)();
			const owner = JSON.stringify([meetingId, memberId]), ownerRef = (0, react.useRef)(owner), pending = (0, react.useRef)(void 0);
			ownerRef.current = owner;
			(0, react.useEffect)(() => {
				setBusy(false);
				setError("");
				setRevision(void 0);
				setSupplement(void 0);
				setConfirm(void 0);
			}, [owner]);
			const current = () => isCurrent() && ownerRef.current === owner;
			const tasks = releases.flatMap((r) => r.tasks.filter((t) => t.toSessionId === memberId).map((t) => ({
				r,
				t
			}))), ordinary = discussions.flatMap((d) => d.deliveries.filter((delivery) => delivery.toSessionId === memberId).map((delivery) => ({
				d,
				delivery
			})));
			const changed = async () => {
				if (!current()) return;
				try {
					await onChanged();
				} catch {
					if (current()) setError("操作已接受，日志刷新失败，请刷新查看，不要重复执行。");
				}
			};
			const action = async (name, body) => {
				if (pending.current?.owner === owner || !current()) return false;
				const operation = { owner };
				pending.current = operation;
				setBusy(true);
				setError("");
				try {
					await meetingCall(meetingId, name, body);
					await changed();
					return true;
				} catch (e) {
					if (current()) setError(e instanceof Error ? e.message : String(e));
					return false;
				} finally {
					if (pending.current === operation) pending.current = void 0;
					if (current()) setBusy(false);
				}
			};
			const confirmAction = async () => {
				const selected = confirm;
				if (!selected || selected.owner !== owner || !current()) return;
				if (await action(selected.action, selected.body) && current()) setConfirm(void 0);
			};
			const target = tasks.find((x) => x.t.taskId === revision)?.t;
			return (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": "成员任务操作",
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					fontSize: 12
				},
				children: [
					error && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					!!ordinary.length && (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": "普通讨论投递操作",
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 8
						},
						children: [(0, react_jsx_runtime.jsx)("p", { children: "普通讨论只记录本会投递与回复，不创建工作任务，也不需要成果验收。" }), ordinary.slice().reverse().map(({ d, delivery }) => (0, react_jsx_runtime.jsxs)("details", {
							"data-member-discussion": d.id,
							style: {
								border: "1px solid var(--dsw-alias-border-l2)",
								borderRadius: 8,
								padding: 8
							},
							children: [
								(0, react_jsx_runtime.jsxs)("summary", { children: [
									d.instruction.slice(0, 35),
									" · ",
									delivery.status === "queued" ? "等待投递" : delivery.status === "offline" ? "原成员需恢复" : delivery.status === "delivering" ? "正在投递" : delivery.status === "delivered" ? "已送达" : delivery.status === "uncertain" ? "送达待核实" : delivery.status === "failed" ? "投递失败" : "本会等待已结束"
								] }),
								(0, react_jsx_runtime.jsx)("p", {
									style: { whiteSpace: "pre-wrap" },
									children: d.instruction
								}),
								d.contextTaskId && (0, react_jsx_runtime.jsx)("p", { children: "关联工作任务的澄清或补充；不会创建新任务或提交正式成果。" }),
								(0, react_jsx_runtime.jsxs)("p", { children: [
									"本会已收到 ",
									d.replies.filter((reply) => reply.sessionId === memberId).length,
									" 条普通回复。"
								] }),
								delivery.error && (0, react_jsx_runtime.jsx)("p", {
									role: "alert",
									children: delivery.error
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										gap: 6,
										flexWrap: "wrap"
									},
									children: [[
										"offline",
										"failed",
										"uncertain"
									].includes(delivery.status) && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy,
										onClick: () => delivery.status === "uncertain" ? setConfirm({
											id: d.id,
											owner,
											kind: "discussion",
											action: "discussion-retry",
											body: {
												discussionId: d.id,
												sessionId: memberId
											},
											description: "送达结果尚不明确，请先核对原窗口。重复发送可能产生重复回复；本操作只核实原消息的送达证据，无法核实时保留待核实状态，不盲目重投。"
										}) : void action("discussion-retry", {
											discussionId: d.id,
											sessionId: memberId
										}),
										children: delivery.status === "uncertain" ? "核实原讨论投递" : "在会议内重试讨论投递"
									}), delivery.status !== "cancelled" && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy,
										onClick: () => setConfirm({
											id: d.id,
											owner,
											kind: "discussion",
											action: "discussion-close",
											body: {
												discussionId: d.id,
												sessionId: memberId,
												confirmed: true
											},
											description: "仅结束这条普通讨论在本会对该成员的等待，保留已有消息与回复，不取消或停止原窗口工作。其他成员的投递继续，不会把工作任务或环节标为已完成。"
										}),
										children: "结束这条讨论等待"
									})]
								})
							]
						}, d.id))]
					}),
					!tasks.length && (0, react_jsx_runtime.jsx)("p", { children: "这位成员尚无工作任务。普通讨论回复会出现在上方发言记录，不需要任务验收。" }),
					tasks.slice().reverse().map(({ r, t }) => (0, react_jsx_runtime.jsxs)("details", {
						open: t.taskId === focusTaskId,
						"data-member-task": t.taskId,
						style: {
							border: "1px solid var(--dsw-alias-border-l2)",
							borderRadius: 8,
							padding: 8
						},
						children: [
							(0, react_jsx_runtime.jsxs)("summary", { children: [
								r.title ?? r.instruction.slice(0, 35),
								" · ",
								t.status === "completed" ? reviewState({ releases }, t) : t.status === "offline" ? "恢复或投递需处理" : t.status === "queued" ? "等待执行" : t.status === "in_progress" ? "执行中" : t.status === "delivered" ? "等待成果" : t.status === "cancelled" ? "已结束" : t.status === "failed" ? "执行失败" : "投递需核实"
							] }),
							(0, react_jsx_runtime.jsx)("p", {
								style: { whiteSpace: "pre-wrap" },
								children: r.instruction
							}),
							(0, react_jsx_runtime.jsxs)("p", { children: [
								"引用 ",
								r.messageIds.length,
								" 条会议消息，",
								r.assetIds?.length ?? 0,
								" 份附件；投递 ",
								t.attempts,
								" 次。"
							] }),
							t.result && (0, react_jsx_runtime.jsxs)("p", {
								style: { whiteSpace: "pre-wrap" },
								children: ["正式成果：", t.result]
							}),
							t.error && (0, react_jsx_runtime.jsx)("p", {
								role: "alert",
								children: t.error
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									gap: 6,
									flexWrap: "wrap"
								},
								children: [
									t.status === "completed" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy || t.review === "accepted" || !!revisionChild({ releases }, t),
										onClick: () => {
											action("review-task", {
												taskId: t.taskId,
												review: "accepted"
											});
										},
										children: "验收通过"
									}), (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy || !!revisionChild({ releases }, t),
										onClick: () => setRevision(t.taskId),
										children: "要求修改"
									})] }),
									[
										"delivered",
										"in_progress",
										"uncertain",
										"failed"
									].includes(t.status) && t.attempts > 0 && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy,
										onClick: () => setSupplement(t.taskId),
										children: "从原窗口补交成果"
									}),
									["offline", "uncertain"].includes(t.status) && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy,
										onClick: () => t.status === "uncertain" ? setConfirm({
											id: t.taskId,
											owner,
											kind: "task",
											action: "retry-release",
											body: {
												taskId: t.taskId,
												allowDuplicate: true
											},
											description: "这次送达结果尚不明确。请先核对原窗口，确认重试可能重复执行。"
										}) : void action("retry-release", { taskId: t.taskId }),
										children: "在会议内重试恢复与投递"
									}),
									!["completed", "cancelled"].includes(t.status) && (0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: busy,
										onClick: () => setConfirm({
											id: t.taskId,
											owner,
											kind: "task",
											action: "close-task",
											body: {
												taskId: t.taskId,
												confirmed: true
											},
											description: "仅结束本会等待，保留原工作及历史结果；不会把环节标为已完成。"
										}),
										children: "结束本会等待"
									})
								]
							})
						]
					}, t.taskId)),
					target && (0, react_jsx_runtime.jsx)(RevisionPanel, {
						meetingId,
						task: target,
						memberName,
						onChanged: changed,
						onClose: () => setRevision(void 0)
					}, target.taskId),
					supplement && (0, react_jsx_runtime.jsx)(PublishPanel, {
						open: true,
						onClose: () => setSupplement(void 0),
						meetingId,
						members: [{
							id: memberId,
							name: memberName
						}],
						releases,
						initialTarget: {
							taskId: supplement,
							sessionId: memberId
						},
						onChanged: async () => {
							await changed();
							setSupplement(void 0);
						}
					}),
					confirm?.owner === owner && (0, react_jsx_runtime.jsxs)("div", {
						role: "alertdialog",
						"aria-label": confirm.kind === "discussion" ? "确认普通讨论操作" : "确认成员任务操作",
						children: [
							(0, react_jsx_runtime.jsx)("p", { children: confirm.description }),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => {
									confirmAction();
								},
								children: "确认"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								disabled: busy,
								onClick: () => setConfirm(void 0),
								children: "取消"
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/legacy-draft-model.js
		const record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
		const strings = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
		const text = (v) => typeof v === "string" ? v : "";
		function recoveryContent(value) {
			if (typeof value === "string") return value.trim();
			const v = record(value), definition = record(v.definition);
			if (Array.isArray(definition.nodes) && definition.nodes.length) {
				const nodes = definition.nodes.map(record).filter((n) => text(n.id) || text(n.title) || text(n.instruction));
				return [text(definition.title), ...nodes.map((node) => [text(node.title), text(node.instruction)].filter(Boolean).join("："))].filter(Boolean).join("\n") || (nodes.length ? "包含未完成的进程节点" : "");
			}
			return [
				text(v.title),
				text(definition.title),
				text(v.description),
				text(v.instruction),
				text(v.note),
				text(v.id) || text(v.parentTaskId) || text(v.contextTaskId) ? "包含原任务关联" : "",
				strings(v.recipientIds).length ? "包含接收成员选择" : "",
				strings(v.messageIds).length ? "包含所选会议资料" : "",
				strings(v.assetIds).length ? "包含附件选择" : ""
			].filter(Boolean).join("\n").trim();
		}
		function collectLegacyDrafts(storage, meetings) {
			const values = /* @__PURE__ */ new Map();
			for (let i = 0; i < storage.length; i++) {
				const rawKey = storage.key(i);
				if (!rawKey?.startsWith("round-table.")) continue;
				const key = rawKey.slice(12);
				if (!/^(?:create-draft$|editor(?:-backup|-save)?\.|hosting\.|workflow-editor\.|revision\.|message-draft\.)/.test(key)) continue;
				try {
					const raw = storage.getItem(rawKey);
					if (raw && raw !== "undefined") values.set(key, JSON.parse(raw));
				} catch {}
			}
			const entries = [], consumed = /* @__PURE__ */ new Set(), locate = (tail) => meetings.filter((m) => tail === m.meetingId || tail.startsWith(m.meetingId + ".")).sort((a, b) => b.meetingId.length - a.meetingId.length)[0];
			for (const [key, value] of values) {
				const base = key.replace(/\.pending$/, "").replace(/^editor-save\./, "editor.");
				if (consumed.has(base)) continue;
				const tail = base.replace(/^[^.]+\./, ""), meeting = locate(tail), meetingId = meeting?.meetingId ?? (base === "create-draft" ? void 0 : tail.split(".")[0]);
				let kind = base === "create-draft" ? "meeting" : base.startsWith("workflow-editor.") ? "workflow" : base.startsWith("revision.") ? "revision" : base.startsWith("editor") ? "task" : "message";
				const pendingKey = base.startsWith("editor.") ? "editor-save." + tail : base + ".pending", pending = values.get(pendingKey), pendingValue = record(pending);
				const pendingBody = base.startsWith("revision.") ? pendingValue.note : pendingValue.input ?? pendingValue.editor;
				let body = pending && recoveryContent(pendingBody) ? pendingBody : values.get(base) ?? value;
				if (pending && base.startsWith("hosting.") && Object.keys(record(body)).length) {
					const draft = record(body);
					body = {
						...draft,
						intent: draft.kind === "task" ? "work" : strings(draft.recipientIds).length ? "response" : "record"
					};
				}
				const display = recoveryContent(body) || text(pendingValue.note), isPending = !!pending, outcome = pendingValue.stage === "completed" ? "completed" : pendingValue.stage === "rejected" ? "rejected" : "unknown";
				if (!display && !isPending) continue;
				const grouped = [{
					key: base,
					value: body
				}], recipients = strings(record(body).recipientIds);
				const recoveryBlocked = isPending && (!text(pendingValue.requestId).trim() || !recoveryContent(pendingBody)) ? "原请求记录不完整；请先复制正文并核对原会议，暂不恢复发送身份。" : void 0;
				if (isPending) {
					kind = "pending";
					grouped.push({
						key: key.startsWith("editor-save.") ? key : pendingKey,
						value: pending
					});
					consumed.add(pendingKey);
					consumed.add(key);
				}
				consumed.add(base);
				entries.push({
					id: base,
					kind,
					meetingId,
					meetingTitle: meeting?.title ?? (kind === "meeting" ? "准备创建的新会议" : "所属会议待确认"),
					label: isPending ? outcome === "completed" ? "操作已成功，本地草稿待清理" : outcome === "rejected" ? "操作已拒绝，本地草稿待恢复" : "发送结果待核实" : kind === "meeting" ? "新建会议草稿" : kind === "workflow" ? "未保存的会议进程" : kind === "task" ? "工作任务草稿" : kind === "revision" ? "任务修改意见" : "未发送的讨论文字",
					text: display || "此请求保留了发送记录，请先核对原会议接收状态。",
					recipientNames: recipients.map((id) => meeting?.memberNames?.[id] ?? "原接收成员"),
					values: grouped,
					pending: isPending,
					...isPending ? { outcome } : {},
					knownMeeting: !!meeting || kind === "meeting",
					...recoveryBlocked ? { recoveryBlocked } : {}
				});
			}
			return entries;
		}
		//#endregion
		//#region lib/client/LegacyDrafts.js
		function LegacyDrafts({ onImported, meetings: provided = [], requestOpen = 0 }) {
			const owner = (0, react.useRef)(localScopeId()).current, { readLocal, writeLocal } = scopedLocal(owner);
			const [dismissed, setDismissed] = (0, react.useState)(() => readLocal("legacy-recovery-dismissed", false)), [open, setOpen] = (0, react.useState)(false), [meetings, setMeetings] = (0, react.useState)(provided);
			const [selected, setSelected] = (0, react.useState)(), [ownership, setOwnership] = (0, react.useState)(false), [notice, setNotice] = (0, react.useState)("");
			const [handled, setHandled] = (0, react.useState)(() => readLocal("legacy-recovery-handled", {}));
			const focus = (0, react.useRef)(), dialog = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (provided.length) setMeetings(provided);
			}, [provided]);
			(0, react.useEffect)(() => {
				if (provided.length || !open) return;
				let alive = true;
				fetch("/plugins/round-table/meetings?view=summary").then((r) => {
					if (!r.ok) throw Error("无法读取会议名称");
					return r.json();
				}).then((v) => {
					if (alive && owner === localScopeId()) setMeetings(v.meetings ?? []);
				}).catch(() => {
					if (alive) setNotice("暂时无法确认所属会议，可以先预览或复制正文。");
				});
				return () => {
					alive = false;
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (requestOpen) {
					setOpen(true);
					setNotice("");
				}
			}, [requestOpen]);
			(0, react.useEffect)(() => {
				if (open) dialog.current?.focus();
			}, [open]);
			let entries = [];
			try {
				entries = collectLegacyDrafts(localStorage, meetings);
			} catch {}
			const fingerprint = (entry) => JSON.stringify(entry.values);
			const unhandled = entries.filter((e) => handled?.[e.id] !== fingerprint(e));
			const entry = entries.find((e) => e.id === selected);
			const close = () => {
				setOpen(false);
				setSelected(void 0);
				setOwnership(false);
				focus.current?.focus();
			};
			const restore = () => {
				if (!entry || !owner || owner !== localScopeId() || !ownership || !entry.knownMeeting || entry.recoveryBlocked) return;
				try {
					if (entry.values.some((v) => {
						const raw = localStorage.getItem(`round-table.${owner}.${v.key}`), current = raw === null ? void 0 : JSON.parse(raw);
						return !!recoveryContent(current) || (v.key.endsWith(".pending") || v.key.startsWith("editor-save.")) && !!current;
					})) {
						setNotice("当前已有编辑内容或待核实请求，已保留原稿。请先处理当前草稿，或复制这份旧内容。");
						return;
					}
				} catch {
					setNotice("当前草稿无法读取或格式损坏，暂不覆盖。原记录仍在，可以先复制正文。");
					return;
				}
				const ordered = [...entry.values].sort((a, b) => Number(b.key.endsWith(".pending") || b.key.startsWith("editor-save.")) - Number(a.key.endsWith(".pending") || a.key.startsWith("editor-save.")));
				let restoredRequest = false;
				for (const value of ordered) {
					if (!writeLocal(value.key, value.value)) {
						setNotice("未能完整保存恢复内容。原记录仍在；请保留此窗口并复制正文，勿另起发送。");
						if (restoredRequest) onImported(entry);
						return;
					}
					if (value.key.endsWith(".pending") || value.key.startsWith("editor-save.")) restoredRequest = true;
				}
				if (!entry.pending || entry.outcome === "completed" || entry.outcome === "rejected") {
					const next = {
						...handled,
						[entry.id]: fingerprint(entry)
					};
					setHandled(next);
					writeLocal("legacy-recovery-handled", next);
				}
				setNotice(entry.pending ? entry.outcome === "completed" ? "已恢复成功凭据，原会议只需完成本地草稿清理，不会再次提交。" : entry.outcome === "rejected" ? "已恢复拒绝凭据，原会议只需完成本地草稿恢复，不会再次提交。" : "已恢复原请求，请在原会议核实接收状态；没有自动发送。" : `已恢复到「${entry.meetingTitle}」的${entry.label}，仍未发送。`);
				onImported(entry);
			};
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [!dismissed && unhandled.length > 0 && (0, react_jsx_runtime.jsxs)("div", {
				"data-legacy-recovery-notice": "",
				style: {
					flex: "none",
					fontSize: 12,
					display: "flex",
					gap: 6,
					alignItems: "center",
					marginBottom: 4
				},
				children: [
					(0, react_jsx_runtime.jsx)("span", { children: unhandled.every((e) => e.pending) ? "仍有原发送结果需要核实" : "发现之前写过的内容" }),
					(0, react_jsx_runtime.jsx)("button", {
						style: uiButton,
						onClick: (e) => {
							focus.current = e.currentTarget;
							setOpen(true);
							setNotice("");
						},
						children: "找回旧草稿"
					}),
					(0, react_jsx_runtime.jsx)("button", {
						style: {
							...uiButton,
							border: 0
						},
						onClick: () => {
							writeLocal("legacy-recovery-dismissed", true);
							setDismissed(true);
						},
						children: "稍后提醒"
					})
				]
			}), open && (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "fixed",
					inset: 0,
					zIndex: 90,
					display: "grid",
					placeItems: "center",
					background: "rgba(0,0,0,.25)",
					padding: 16
				},
				children: (0, react_jsx_runtime.jsxs)("section", {
					ref: dialog,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": "找回旧草稿",
					tabIndex: -1,
					onKeyDown: (e) => {
						if (e.key === "Escape") {
							e.preventDefault();
							close();
						}
						if (e.key === "Tab") {
							const list = dialog.current?.querySelectorAll("button:not(:disabled),input:not(:disabled)");
							if (list?.length) {
								const first = list[0], last = list[list.length - 1];
								if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
									e.preventDefault();
									last.focus();
								} else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
									e.preventDefault();
									first.focus();
								}
							}
						}
					},
					style: {
						background: "var(--dsw-alias-bg-base)",
						border: "1px solid var(--dsw-alias-border-l2)",
						borderRadius: 12,
						padding: 16,
						maxWidth: 700,
						width: "100%",
						maxHeight: "82vh",
						overflow: "auto",
						boxSizing: "border-box"
					},
					children: [
						(0, react_jsx_runtime.jsxs)("header", {
							style: {
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center"
							},
							children: [(0, react_jsx_runtime.jsx)("b", { children: "找回之前写的内容" }), (0, react_jsx_runtime.jsx)("button", {
								style: uiButton,
								onClick: close,
								children: "关闭草稿恢复"
							})]
						}),
						(0, react_jsx_runtime.jsx)("p", { children: "这里是旧版本中尚未处理的文字和编辑内容。查看、复制或稍后处理都不会发送给成员；原内容保留。" }),
						!entries.length && (0, react_jsx_runtime.jsx)("p", { children: "没有可恢复的旧草稿。空草稿和页面显示偏好不需要恢复。" }),
						entries.map((e) => (0, react_jsx_runtime.jsxs)("article", {
							"data-recovery-entry": e.kind,
							style: {
								borderTop: "1px solid var(--dsw-alias-border-l2)",
								padding: "10px 0"
							},
							children: [
								(0, react_jsx_runtime.jsxs)("b", { children: [
									e.meetingTitle,
									" · ",
									e.label
								] }),
								(0, react_jsx_runtime.jsxs)("p", {
									style: {
										margin: "5px 0",
										whiteSpace: "pre-wrap",
										overflowWrap: "anywhere"
									},
									children: [e.text.slice(0, 130), e.text.length > 130 ? "…" : ""]
								}),
								e.recipientNames.length > 0 && (0, react_jsx_runtime.jsxs)("small", { children: ["原接收人：", e.recipientNames.join("、")] }),
								e.pending && (0, react_jsx_runtime.jsx)("p", {
									role: "status",
									children: e.outcome === "completed" ? "操作已明确成功，仅本地草稿清理未完成；原成功凭据与正文成组保留。" : e.outcome === "rejected" ? "操作已明确拒绝，仅本地草稿恢复未完成；原拒绝凭据与正文成组保留。" : "曾尝试发送，结果未确认。这不是一份普通的未发送草稿；正文与原请求已关联。"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									onClick: () => {
										setSelected(e.id);
										setOwnership(false);
										setNotice("");
									},
									children: "预览这份内容"
								})
							]
						}, e.id)),
						entry && (0, react_jsx_runtime.jsxs)("section", {
							"aria-label": "旧草稿内容预览",
							style: {
								border: "1px solid var(--dsw-alias-border-l2)",
								padding: 12,
								borderRadius: 8
							},
							children: [
								(0, react_jsx_runtime.jsxs)("b", { children: [
									entry.meetingTitle,
									" · ",
									entry.label
								] }),
								(0, react_jsx_runtime.jsx)("p", {
									style: {
										whiteSpace: "pre-wrap",
										overflowWrap: "anywhere",
										maxHeight: 220,
										overflow: "auto"
									},
									children: entry.text
								}),
								(0, react_jsx_runtime.jsx)("button", {
									style: uiButton,
									onClick: () => {
										(async () => {
											try {
												await navigator.clipboard.writeText(entry.text);
												setNotice("正文已复制，可以自行保留或继续编辑；没有发送。");
											} catch {
												setNotice("复制失败，请选中预览正文手动复制。");
											}
										})();
									},
									children: "复制正文"
								}),
								!entry.knownMeeting ? (0, react_jsx_runtime.jsx)("p", { children: "所属会议尚未确认；现在只提供预览或复制，不会把原请求恢复到其他会议。" }) : entry.recoveryBlocked ? (0, react_jsx_runtime.jsx)("p", { children: entry.recoveryBlocked }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(0, react_jsx_runtime.jsxs)("label", {
										style: {
											display: "block",
											marginTop: 8
										},
										children: [
											(0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: ownership,
												onChange: (e) => setOwnership(e.target.checked)
											}),
											"我确认这份内容属于当前会议库中的「",
											entry.meetingTitle,
											"」"
										]
									}),
									entry.pending && (0, react_jsx_runtime.jsx)("p", { children: entry.outcome === "completed" || entry.outcome === "rejected" ? "恢复保留已明确的结果凭据，仅处理本地草稿，不再次提交。" : "恢复仅保留原发送身份，仍须核实送达；不会新建或自动重发。" }),
									(0, react_jsx_runtime.jsx)("button", {
										style: uiButton,
										disabled: !ownership,
										onClick: restore,
										children: entry.pending ? entry.outcome === "completed" || entry.outcome === "rejected" ? "恢复本地清理记录" : "恢复原请求供核实" : "恢复继续编辑"
									})
								] })
							]
						}),
						notice && (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: notice
						}),
						(0, react_jsx_runtime.jsxs)("footer", { children: [(0, react_jsx_runtime.jsx)("button", {
							style: uiButton,
							onClick: () => {
								writeLocal("legacy-recovery-dismissed", true);
								setDismissed(true);
								close();
							},
							children: "稍后处理"
						}), (0, react_jsx_runtime.jsx)("small", { children: "以后可在会议设置中打开“找回旧草稿”。" })] })
					]
				})
			})] });
		}
		//#endregion
		//#region lib/client/SessionPicker.js
		/**
		* 窗口选择器（P1 整顿，建会表单与后续"添加成员"共用的组件）：
		* - 数据源分层：useSessions 行（running 区分 live/离线）+ useWorkspaces 的
		*   archivedSessionIds（归档会话直接排除）；origin==='subagent' 排除（既有纪律）。
		* - 展示：live（正在工作）置顶带绿点；离线窗口置灰折叠进「离线窗口（N）」分组
		*   （默认收起；离线窗口仍可勾选——广播会拉起它们）；每行标题 + cwd 缩写。
		* - 搜索：按标题/cwd 过滤（不分组限制，命中离线分组时该组自动展开）。
		*/
		/**
		* 分层纯函数（冒烟可测）：排除 subagent/已归档，按 running 分 live/离线两组；
		* query 非空时按标题/cwd 过滤（大小写不敏感）。
		*/
		function partitionSessionRows(rows, archivedSessionIds, query) {
			const q = query.trim().toLowerCase();
			const filtered = rows.filter(({ id, row }) => {
				if (id.startsWith("round-table-secretary-")) return false;
				if (row.origin === "subagent") return false;
				if (archivedSessionIds.includes(id)) return false;
				if (q === "") return true;
				return row.displayTitle.toLowerCase().includes(q) || (row.cwd ?? "").toLowerCase().includes(q);
			});
			return {
				live: filtered.filter(({ row }) => row.connected === true || row.connected === void 0 && row.running),
				offline: filtered.filter(({ row }) => row.connected === false || row.connected === void 0 && !row.running)
			};
		}
		/** cwd 缩写：取末两段（太长的单段截断）。 */
		function shortCwd(cwd) {
			if (cwd === void 0) return void 0;
			const tail = cwd.replace(/\\/g, "/").split("/").filter((part) => part !== "").slice(-2).join("/");
			return tail.length > 28 ? `…${tail.slice(-27)}` : tail;
		}
		const textPrimary$1 = { color: "var(--dsw-alias-label-primary)" };
		const textSecondary$1 = { color: "var(--dsw-alias-label-secondary)" };
		const textTertiary$1 = { color: "var(--dsw-alias-label-tertiary)" };
		function PickerRowItem({ id, row, checked, offline, onToggle }) {
			return (0, react_jsx_runtime.jsxs)("label", {
				"data-round-table-session": id,
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "6px 8px",
					borderRadius: 8,
					cursor: "pointer",
					fontSize: 13,
					opacity: offline ? .85 : 1,
					...textPrimary$1
				},
				children: [
					(0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked,
						onChange: () => {
							onToggle(id);
						}
					}),
					(0, react_jsx_runtime.jsx)("span", {
						title: row.connected === false ? "原窗口未连接" : row.connected === void 0 ? "连接状态待检查" : row.running ? "原窗口忙碌" : "可投递",
						style: {
							flex: "none",
							width: 8,
							height: 8,
							borderRadius: "50%",
							background: offline ? "var(--dsw-alias-label-caption)" : "var(--dsw-alias-state-business-primary)"
						}
					}),
					(0, react_jsx_runtime.jsxs)("span", {
						style: {
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: [row.displayTitle, (0, react_jsx_runtime.jsxs)("span", {
							style: {
								fontSize: 11,
								...textTertiary$1
							},
							children: [
								"（",
								row.connected === false ? "未连接" : row.connected === void 0 ? "待检查" : row.running ? "忙碌" : "空闲",
								"）"
							]
						})]
					}),
					row.cwd !== void 0 && (0, react_jsx_runtime.jsx)("span", {
						style: {
							marginLeft: "auto",
							flex: "none",
							maxWidth: "40%",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							fontSize: 11,
							...textTertiary$1
						},
						children: shortCwd(row.cwd)
					})
				]
			});
		}
		function SessionPicker({ rows, archivedSessionIds, checked, onToggle }) {
			const [query, setQuery] = (0, react.useState)("");
			const [showOffline, setShowOffline] = (0, react.useState)(false);
			const [connections, setConnections] = (0, react.useState)({});
			(0, react.useEffect)(() => {
				let alive = true;
				fetch("/plugins/round-table/meetings", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						action: "availability",
						ids: rows.map((r) => r.id)
					})
				}).then((r) => r.json()).then((v) => {
					if (alive) setConnections(v.connections ?? {});
				}).catch(() => {});
				return () => {
					alive = false;
				};
			}, [rows.map((r) => r.id).join("|")]);
			const { live, offline } = partitionSessionRows(rows.map((r) => ({
				...r,
				row: {
					...r.row,
					connected: connections[r.id] ?? r.row.connected
				}
			})), archivedSessionIds, query);
			const offlineVisible = showOffline || query.trim() !== "";
			return (0, react_jsx_runtime.jsxs)("div", {
				"data-round-table-session-picker": "",
				style: {
					display: "flex",
					flexDirection: "column",
					flex: "none",
					minWidth: 0,
					gap: 4
				},
				children: [
					(0, react_jsx_runtime.jsx)("input", {
						"data-round-table-session-search": "",
						style: {
							flex: "none",
							boxSizing: "border-box",
							width: "100%",
							border: "1px solid var(--dsw-alias-border-l1)",
							borderRadius: 8,
							background: "var(--dsw-alias-bg-base)",
							fontFamily: "inherit",
							fontSize: 12,
							lineHeight: "20px",
							padding: "4px 8px",
							outline: "none",
							...textPrimary$1
						},
						placeholder: "搜索窗口（标题 / 目录）…",
						value: query,
						onChange: (event) => {
							setQuery(event.target.value);
						}
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							flex: "none",
							maxHeight: 220,
							minWidth: 0,
							overflowY: "auto",
							display: "flex",
							flexDirection: "column",
							gap: 2
						},
						children: [
							live.length === 0 && offline.length === 0 && (0, react_jsx_runtime.jsx)("p", {
								style: {
									margin: "4px 0",
									fontSize: 12,
									...textTertiary$1
								},
								children: query.trim() === "" ? "（没有可选的会话窗口）" : `（无匹配「${query.trim()}」的窗口）`
							}),
							live.map(({ id, row }) => (0, react_jsx_runtime.jsx)(PickerRowItem, {
								id,
								row,
								checked: checked.has(id),
								offline: false,
								onToggle
							}, id)),
							offline.length > 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								"data-round-table-offline-group": "",
								"aria-expanded": offlineVisible,
								style: {
									display: "flex",
									alignItems: "center",
									gap: 4,
									padding: "4px 8px",
									border: "none",
									background: "transparent",
									cursor: "pointer",
									fontFamily: "inherit",
									fontSize: 11,
									textAlign: "left",
									...textTertiary$1
								},
								onClick: () => {
									setShowOffline((v) => !v);
								},
								children: [
									offlineVisible ? "▾" : "▸",
									" 未连接或待检查（",
									offline.length,
									"）"
								]
							}), offlineVisible && offline.map(({ id, row }) => (0, react_jsx_runtime.jsx)(PickerRowItem, {
								id,
								row,
								checked: checked.has(id),
								offline: true,
								onToggle
							}, id))] })
						]
					}),
					live.length > 0 && (0, react_jsx_runtime.jsxs)("span", {
						style: {
							flex: "none",
							fontSize: 11,
							...textSecondary$1
						},
						children: [
							live.length,
							" 个可连接 · ",
							offline.length,
							" 个需检查；未运行不等于离线"
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/PresetKnightPicker.js
		/** 官方预设名册的只读选人器。
		* 不读取 .agent-presets，不编辑人格；创建实际走公开 agentPreset.list / session.create wire。
		*/
		const muted = { color: "var(--dsw-alias-label-tertiary)" };
		const button = {
			border: "1px solid var(--dsw-alias-border-l1)",
			borderRadius: 7,
			background: "var(--dsw-alias-bg-base)",
			padding: "3px 8px",
			cursor: "pointer",
			font: "inherit"
		};
		function PresetKnightPicker({ api, workspaces, selected, onChange, followCurrentLabel }) {
			const [presets, setPresets] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [loading, setLoading] = (0, react.useState)(false);
			const load = async () => {
				if (loading) return;
				setLoading(true);
				setError(void 0);
				try {
					const response = await api.agentPresets.list({});
					if (!response.result.ok) throw new Error(response.result.error.message);
					setPresets(response.result.value.presets);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setLoading(false);
				}
			};
			(0, react.useEffect)(() => {
				load();
			}, []);
			const add = (presetId, workspaceId) => {
				const presetName = (presets?.find((item) => item.id === presetId))?.name ?? presetId;
				onChange([...selected, {
					instanceId: crypto.randomUUID(),
					presetId,
					title: presetName,
					presetName,
					role: "参会成员",
					workspaceId
				}]);
			};
			const update = (instanceId, patch) => onChange(selected.map((item) => item.instanceId === instanceId ? {
				...item,
				...patch
			} : item));
			const field = {
				width: "100%",
				minWidth: 0,
				maxWidth: "100%",
				boxSizing: "border-box",
				font: "inherit"
			};
			const labelStyle = {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				marginTop: 8,
				fontSize: 12,
				minWidth: 0
			};
			const card = {
				flex: "none",
				minWidth: 0,
				padding: 10,
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 8,
				boxSizing: "border-box",
				overflowWrap: "anywhere"
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				"data-round-table-preset-picker": "",
				style: {
					display: "flex",
					flexDirection: "column",
					flex: "none",
					minWidth: 0,
					gap: 8
				},
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							alignItems: "center",
							gap: 6
						},
						children: [(0, react_jsx_runtime.jsxs)("span", {
							style: {
								fontSize: 12,
								fontWeight: 500
							},
							children: [
								"按预设创建骑士（",
								selected.length,
								" 已选）"
							]
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: {
								...button,
								flexShrink: 0,
								whiteSpace: "nowrap"
							},
							onClick: () => {
								load();
							},
							disabled: loading,
							children: loading ? "读取中…" : "刷新名册"
						})]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						style: {
							margin: 0,
							fontSize: 11,
							lineHeight: "16px",
							...muted
						},
						children: "骑士来自宿主已声明的预设；圆桌只让他们议事，不修改预设配置。"
					}),
					error !== void 0 && (0, react_jsx_runtime.jsxs)("p", {
						role: "alert",
						style: {
							margin: 0,
							fontSize: 12,
							color: "var(--dsw-alias-state-error-primary)"
						},
						children: ["读取预设失败：", error]
					}),
					presets?.map((preset) => (0, react_jsx_runtime.jsxs)("article", {
						"data-round-table-preset": preset.id,
						style: {
							...card,
							opacity: preset.broken === void 0 ? 1 : .55
						},
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								style: {
									minWidth: 0,
									fontSize: 12,
									lineHeight: "18px"
								},
								children: [
									(0, react_jsx_runtime.jsx)("b", { children: preset.name ?? preset.id }),
									" ",
									(0, react_jsx_runtime.jsxs)("small", {
										style: muted,
										children: [
											"[",
											preset.trust === void 0 ? "已声明" : preset.trust === "system" ? "出厂" : "用户",
											"]"
										]
									})
								]
							}),
							(0, react_jsx_runtime.jsx)("p", {
								style: {
									margin: "4px 0 8px",
									minWidth: 0,
									fontSize: 12,
									lineHeight: "18px",
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
									...muted
								},
								children: preset.description ?? preset.id
							}),
							preset.broken !== void 0 && (0, react_jsx_runtime.jsxs)("p", {
								style: {
									fontSize: 12,
									color: "var(--dsw-alias-state-error-primary)"
								},
								children: ["不可用：", preset.broken]
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-round-table-add-instance": preset.id,
								style: {
									...button,
									display: "inline-flex",
									flexShrink: 0,
									whiteSpace: "nowrap",
									maxWidth: "100%"
								},
								disabled: preset.broken !== void 0,
								onClick: () => add(preset.id),
								children: "添加实例"
							})
						]
					}, preset.id)),
					selected.map((item) => (0, react_jsx_runtime.jsxs)("article", {
						"data-round-table-knight": item.instanceId,
						style: card,
						children: [
							(0, react_jsx_runtime.jsx)("b", {
								style: { fontSize: 12 },
								children: item.presetName
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								style: labelStyle,
								children: ["骑士名", (0, react_jsx_runtime.jsx)("input", {
									style: field,
									"data-round-table-knight-name": item.instanceId,
									value: item.title,
									onChange: (event) => update(item.instanceId, { title: event.target.value })
								})]
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								style: labelStyle,
								children: ["职责", (0, react_jsx_runtime.jsx)("input", {
									style: field,
									"data-round-table-knight-role": item.instanceId,
									value: item.role,
									onChange: (event) => update(item.instanceId, { role: event.target.value })
								})]
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								style: labelStyle,
								children: ["工作区", (0, react_jsx_runtime.jsxs)("select", {
									style: field,
									value: item.workspaceId ?? "",
									onChange: (event) => update(item.instanceId, event.target.value === "" ? { workspaceId: void 0 } : { workspaceId: event.target.value }),
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: followCurrentLabel === void 0 ? "跟随当前（未分区）" : `跟随当前（${followCurrentLabel}）`
									}), workspaces.map((workspace) => (0, react_jsx_runtime.jsx)("option", {
										value: workspace.workspaceId,
										children: workspace.title
									}, workspace.workspaceId))]
								})]
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...button,
									marginTop: 8
								},
								onClick: () => onChange(selected.filter((candidate) => candidate.instanceId !== item.instanceId)),
								children: "移除"
							})
						]
					}, item.instanceId))
				]
			});
		}
		//#endregion
		//#region lib/client/MeetingPanel.js
		const textPrimary = { color: "var(--dsw-alias-label-primary)" };
		const textSecondary = { color: "var(--dsw-alias-label-secondary)" };
		const textTertiary = { color: "var(--dsw-alias-label-tertiary)" };
		const buttonBase = {
			border: "1px solid var(--dsw-alias-border-l1)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base)",
			fontFamily: "inherit",
			fontSize: 12,
			lineHeight: "20px",
			padding: "3px 10px",
			cursor: "pointer",
			...textPrimary
		};
		const primaryButton = {
			...buttonBase,
			border: "none",
			background: "var(--dsw-alias-state-business-primary)",
			color: "var(--dsw-alias-label-inverse, #fff)"
		};
		const inputStyle = {
			boxSizing: "border-box",
			width: "100%",
			border: "1px solid var(--dsw-alias-border-l1)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base)",
			fontFamily: "inherit",
			fontSize: 13,
			lineHeight: "20px",
			padding: "6px 8px",
			outline: "none",
			...textPrimary
		};
		const MEETINGS_URL = "/plugins/round-table/meetings";
		const meetingCache = /* @__PURE__ */ new Map();
		async function fetchMeetings(detail, scope = localScopeId()) {
			if (!scope || scope !== localScopeId()) throw new MemberCreationStopped();
			const url = `${MEETINGS_URL}?view=summary${detail ? `&detail=${encodeURIComponent(detail)}` : ""}`, key = `${scope}:${url}`, cached = meetingCache.get(key);
			const response = await fetch(url, { headers: cached ? { "if-none-match": cached.etag } : {} });
			if (scope !== localScopeId()) throw new MemberCreationStopped();
			if (response.status === 304 && cached) return cached.data;
			if (!response.ok) throw new Error(`读取会议列表失败（HTTP ${response.status}）`);
			const data = await response.json();
			if (scope !== localScopeId()) throw new MemberCreationStopped();
			meetingCache.set(key, {
				etag: response.headers.get("etag") ?? "",
				data
			});
			return data;
		}
		async function postJsonForScope(url, body, scope = localScopeId()) {
			if (!scope || scope !== localScopeId()) throw new MemberCreationStopped();
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-round-table-scope": scope
				},
				body: JSON.stringify(body)
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => void 0);
				throw new Error(payload?.error ?? `请求失败（HTTP ${response.status}）`);
			}
			if (scope !== localScopeId()) throw new MemberCreationStopped();
		}
		/** 会议标签协议：接收窗口凭此知道自己在开会（红线：必须带标签）。 */
		function meetingTag(title, text) {
			return `[圆桌会议「${title}」] from 用户：${text}`;
		}
		/** 解析窗口的投递 face；窗口不在当前会话列表（离线/已移除）时返回 undefined。 */
		function resolveFace(rtCtx, sessionId) {
			const scoped = rtCtx.sessions.scope(sessionId);
			if (scoped === void 0) return void 0;
			return rtCtx.sessions.sessionOf(scoped);
		}
		function resolveKnightWorkspaces(knights, snapshot, currentSessionId) {
			const items = snapshot.items;
			if (snapshot.baselinesReady !== true || snapshot.phase !== "ready" || snapshot.state === "loading" || snapshot.state === "error") return {
				ok: false,
				error: "工作区名册尚未就绪；请稍后重试或重新选择工作区"
			};
			const current = items.find((workspace) => currentSessionId !== void 0 && workspace.sessionIds?.includes(currentSessionId));
			const workspaceIds = [];
			for (const knight of knights) {
				const id = knight.workspaceId ?? current?.workspaceId;
				if (id === void 0 || !items.some((item) => item.workspaceId === id)) return {
					ok: false,
					error: knight.workspaceId === void 0 ? "“跟随当前”未能解析到有效工作区；请为每位骑士选择工作区" : "所选工作区已失效；请重新选择工作区"
				};
				workspaceIds.push(id);
			}
			return {
				ok: true,
				workspaceIds,
				currentLabel: current?.title
			};
		}
		function MeetingPanel({ rtCtx, useSessions, useWorkspaces, connection }) {
			const mountScope = (0, react.useRef)(localScopeId()).current;
			const { readLocal, writeLocal, meetingCall } = scopedLocal(mountScope);
			const [managementNotice, setManagementNotice] = (0, react.useState)();
			const [recoveryOpen, setRecoveryOpen] = (0, react.useState)(0), [draftGeneration, setDraftGeneration] = (0, react.useState)(0);
			const [view, setView] = (0, react.useState)(() => readLocal("last-view", { kind: "list" }));
			const active = (0, react.useRef)();
			active.current = view.kind === "meeting" ? view.meetingId : void 0;
			(0, react.useEffect)(() => {
				writeLocal("last-view", view);
			}, [view]);
			const [meetings, setMeetings] = (0, react.useState)(void 0);
			const [loadError, setLoadError] = (0, react.useState)(void 0);
			const recovered = (entry) => {
				setDraftGeneration((v) => v + 1);
				if (entry?.kind === "meeting") setView({ kind: "create" });
				else if (entry?.meetingId) {
					if (entry.kind === "workflow") writeLocal(`tab.${entry.meetingId}`, "workflow");
					setView({
						kind: "meeting",
						meetingId: entry.meetingId
					});
				}
			};
			(0, react.useEffect)(() => {
				let alive = true;
				let inFlight = false;
				const tick = async () => {
					if (inFlight) return;
					inFlight = true;
					try {
						const data = await fetchMeetings(active.current, mountScope);
						if (!alive) return;
						setMeetings(data.meetings);
						setLoadError(void 0);
					} catch (error) {
						if (alive) setLoadError(String(error instanceof Error ? error.message : error));
					} finally {
						inFlight = false;
					}
				};
				tick();
				const timer = setInterval(() => {
					tick();
				}, 5e3);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, []);
			const refresh = async () => {
				try {
					const data = await fetchMeetings(active.current, mountScope);
					setMeetings(data.meetings);
					setLoadError(void 0);
				} catch (error) {
					setLoadError(String(error instanceof Error ? error.message : error));
				}
			};
			(0, react.useEffect)(() => {
				refresh();
			}, [view.kind, view.kind === "meeting" ? view.meetingId : ""]);
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					flex: 1,
					minHeight: 0,
					minWidth: 0,
					overflow: "hidden"
				},
				children: [
					loadError !== void 0 && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: {
							margin: "4px 0 8px",
							fontSize: 12,
							lineHeight: "18px",
							color: "var(--dsw-alias-state-error-primary)"
						},
						children: loadError
					}),
					(0, react_jsx_runtime.jsx)(LegacyDrafts, {
						home: connection.homePath?.() ?? "",
						profile: "当前会议库",
						requestOpen: recoveryOpen,
						meetings: meetings ?? [],
						onImported: recovered
					}),
					managementNotice && (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						style: {
							fontSize: 12,
							overflowWrap: "anywhere"
						},
						children: managementNotice
					}),
					view.kind === "list" && (0, react_jsx_runtime.jsx)(MeetingList, {
						meetings,
						onChanged: refresh,
						onCreate: () => {
							setView({ kind: "create" });
						},
						onOpen: (meetingId) => {
							setView({
								kind: "meeting",
								meetingId
							});
						}
					}),
					view.kind === "create" && (0, react_jsx_runtime.jsx)(CreateMeeting, {
						useSessions,
						useWorkspaces,
						connection,
						onCancel: () => {
							setView({ kind: "list" });
						},
						onCreated: async (meetingId) => {
							await refresh();
							setView({
								kind: "meeting",
								meetingId
							});
						}
					}),
					view.kind === "meeting" && (0, react_jsx_runtime.jsx)(MeetingView, {
						onRecovery: () => setRecoveryOpen((v) => v + 1),
						onJumpMeeting: (meetingId) => setView({
							kind: "meeting",
							meetingId
						}),
						rtCtx,
						useSessions,
						useWorkspaces,
						connection,
						meeting: meetings?.find((m) => m.meetingId === view.meetingId),
						onBack: () => {
							setView({ kind: "list" });
						},
						onChanged: refresh,
						onDeleted: (message) => {
							setManagementNotice(message);
							setView({ kind: "list" });
							refresh();
						}
					}, `${view.meetingId}:${draftGeneration}:${!!meetings?.find((m) => m.meetingId === view.meetingId)}`)
				]
			});
		}
		/** 窗口行查询（displayTitle/running/在场判断；不在列表返回 undefined）。 */
		function useSessionRows(useSessions) {
			const byId = useSessions((s) => s.byId);
			return (sessionId) => byId[sessionId];
		}
		function memberCreationResults(batch) {
			return (0, react_jsx_runtime.jsx)("ul", {
				style: {
					paddingLeft: 18,
					margin: "4px 0",
					overflowWrap: "anywhere"
				},
				children: batch.members.map((step) => (0, react_jsx_runtime.jsxs)("li", {
					"data-member-creation-id": step.instanceId,
					children: [
						(0, react_jsx_runtime.jsx)("b", { children: step.title }),
						"：",
						memberCreationStageText(step),
						step.error && (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							style: { margin: "3px 0" },
							children: step.error
						}),
						(0, react_jsx_runtime.jsxs)("small", { children: [
							"窗口 ",
							step.sessionId,
							step.workspaceId ? ` · 工作区 ${step.workspaceId}` : ""
						] })
					]
				}, step.instanceId))
			});
		}
		function CreateMeeting({ useSessions, useWorkspaces, connection, onCancel, onCreated }) {
			const mountScope = (0, react.useRef)(localScopeId()).current, mountHome = (0, react.useRef)(connection.homePath?.()).current;
			const { readLocal, writeLocal, meetingCall } = scopedLocal(mountScope);
			const isCurrent = () => mountScope === localScopeId() && (!connection.homePath || mountHome === connection.homePath());
			const postJson = (url, body) => {
				if (!isCurrent()) return Promise.reject(new MemberCreationStopped());
				return postJsonForScope(url, body, mountScope);
			};
			const [initial] = (0, react.useState)(() => readLocal("create-draft", {}));
			const [title, setTitle] = (0, react.useState)(initial.title ?? "");
			const [description, setDescription] = (0, react.useState)(initial.description ?? "");
			const [secretaryWorkspaceChoice, setSecretaryWorkspaceChoice] = (0, react.useState)(initial.workspace);
			const [checked, setChecked] = (0, react.useState)(new Set(initial.checked ?? []));
			const [knights, setKnights] = (0, react.useState)(initial.knights ?? []);
			(0, react.useEffect)(() => {
				writeLocal("create-draft", {
					title,
					description,
					workspace: secretaryWorkspaceChoice,
					checked: [...checked],
					knights
				});
			}, [
				title,
				description,
				secretaryWorkspaceChoice,
				checked,
				knights
			]);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [creation, setCreation] = (0, react.useState)(() => readLocal("create-progress", void 0));
			const creationRef = (0, react.useRef)(creation), createGuard = (0, react.useRef)(false);
			const persistence = useLocalPersistence();
			const [progressSaved, setProgressSaved] = (0, react.useState)(true);
			const saveCreation = (value) => {
				if (!isCurrent()) throw new MemberCreationStopped();
				creationRef.current = value;
				setCreation(value);
				if (!writeLocal("create-progress", value ?? null)) setProgressSaved(false);
			};
			const locked = busy || !!creation;
			const [emptyArmed, setEmptyArmed] = (0, react.useState)(false);
			const rows = useSessions((s) => s.ids.map((id) => ({
				id,
				row: s.byId[id]
			})).filter((item) => item.row !== void 0));
			const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds);
			const workspaceSnapshot = useWorkspaces((s) => s);
			const workspaces = workspaceSnapshot.items;
			const currentSessionId = useSessions((s) => s.current);
			const followCurrentLabel = workspaces.find((workspace) => currentSessionId !== void 0 && workspace.sessionIds?.includes(currentSessionId))?.title;
			const inferredSecretaryWorkspaceId = workspaces.find((workspace) => currentSessionId !== void 0 && workspace.sessionIds?.includes(currentSessionId))?.workspaceId;
			const secretaryWorkspaceId = secretaryWorkspaceChoice ?? inferredSecretaryWorkspaceId;
			const toggle = (id) => {
				if (locked) return;
				setChecked((prev) => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
				setEmptyArmed(false);
			};
			const submit = async () => {
				if (createGuard.current || creationRef.current?.uncertain && !creationRef.current.requestSafe) return;
				if (!isCurrent()) {
					setError(new MemberCreationStopped().message);
					return;
				}
				let journal = creationRef.current;
				if (!journal) {
					if (title.trim() === "") {
						setError("请填写会议标题");
						return;
					}
					if (description.trim() === "") {
						setError("请填写会议说明");
						return;
					}
					if (secretaryWorkspaceId === void 0) {
						setError("请选择有效当前工作区作为会议默认工作区");
						return;
					}
					if (new Set(knights.map((knight) => knight.title.trim())).size !== knights.length || knights.some((knight) => knight.title.trim() === "")) {
						setError("同一会议的骑士名称必须非空且不重复");
						return;
					}
					const resolved = knights.length === 0 ? void 0 : resolveKnightWorkspaces(knights, workspaceSnapshot, currentSessionId);
					if (resolved !== void 0 && !resolved.ok) {
						setError(resolved.error);
						return;
					}
					if (!workspaces.some((w) => w.workspaceId === secretaryWorkspaceId)) {
						setError("会议默认工作区已失效，请重新选择");
						return;
					}
					if (checked.size === 0 && knights.length === 0 && !emptyArmed) {
						setEmptyArmed(true);
						return;
					}
					journal = {
						...memberCreationBatch([...checked].map((sessionId) => ({
							sessionId,
							title: rows.find((x) => x.id === sessionId)?.row.displayTitle ?? sessionId
						})), knights, resolved?.ok ? resolved.workspaceIds : []),
						title: title.trim(),
						description: description.trim(),
						workspaceId: secretaryWorkspaceId,
						requestSafe: true
					};
					saveCreation(journal);
				}
				createGuard.current = true;
				setBusy(true);
				setError(void 0);
				try {
					if (!journal.meetingId) try {
						const scope = mountScope;
						if (!scope || !isCurrent()) throw new MemberCreationStopped();
						const response = await fetch(MEETINGS_URL, {
							method: "POST",
							headers: {
								"content-type": "application/json",
								"x-round-table-scope": scope
							},
							body: JSON.stringify({
								title: journal.title,
								description: journal.description,
								secretaryWorkspaceId: journal.workspaceId,
								memberSessionIds: [],
								...journal.requestSafe ? { requestId: journal.id } : {}
							})
						});
						const payload = await response.json();
						if (!isCurrent()) throw new MemberCreationStopped();
						if (!response.ok) {
							if (payload.requestState === "rejected") saveCreation(void 0);
							throw Error(payload.error ?? `创建失败（HTTP ${response.status}）`);
						}
						if (!payload.meeting) throw Error("创建响应缺少会议身份");
						journal = {
							...journal,
							meetingId: payload.meeting.meetingId,
							uncertain: false
						};
						saveCreation(journal);
					} catch (error) {
						if (isCurrent() && creationRef.current && !creationRef.current.meetingId) saveCreation({
							...journal,
							uncertain: true
						});
						throw error;
					}
					const meetingId = journal.meetingId;
					journal = await runMemberCreation(journal, connection, (step) => postJson(`${MEETINGS_URL}/${encodeURIComponent(meetingId)}/join`, {
						sessionId: step.sessionId,
						origin: step.presetId ? {
							source: "preset",
							presetId: step.presetId,
							workspaceId: step.workspaceId
						} : { source: "existing" },
						...step.role ? { role: step.role } : {}
					}), saveCreation, isCurrent);
					if (journal.members.some((x) => x.stage !== "done")) {
						setError("会议已创建；部分成员未完成，请查看逐项结果并重试。");
						return;
					}
					writeLocal("create-draft", {});
					await onCreated(meetingId);
					saveCreation(void 0);
				} catch (cause) {
					setError(String(cause instanceof Error ? cause.message : cause));
				} finally {
					createGuard.current = false;
					setBusy(false);
				}
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				"data-round-table-create-form": "",
				style: {
					display: "flex",
					flexDirection: "column",
					flex: 1,
					minHeight: 0,
					minWidth: 0,
					overflow: "hidden",
					gap: 8
				},
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							flex: "none",
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonBase,
							onClick: onCancel,
							children: "← 返回"
						}), (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 13,
								fontWeight: 500,
								...textPrimary
							},
							children: "新建会议"
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						"data-round-table-create-scroll": "",
						style: {
							flex: 1,
							minHeight: 0,
							minWidth: 0,
							overflowY: "auto",
							overflowX: "hidden",
							display: "flex",
							flexDirection: "column",
							gap: 10,
							paddingRight: 4
						},
						children: [
							(0, react_jsx_runtime.jsx)("input", {
								"data-round-table-title": "",
								style: {
									...inputStyle,
									flex: "none"
								},
								"aria-label": "会议标题",
								placeholder: "会议名称，例如：秋季活动方案评审",
								value: title,
								disabled: locked,
								onChange: (event) => {
									setTitle(event.target.value);
								}
							}),
							(0, react_jsx_runtime.jsx)("textarea", {
								disabled: locked,
								"data-round-table-description": "",
								style: {
									...inputStyle,
									flex: "none",
									resize: "vertical"
								},
								"aria-label": "会议说明（必填）",
								placeholder: "这场会议要解决什么问题？写清目标、背景与期待产出（必填）",
								value: description,
								onChange: (event) => setDescription(event.target.value)
							}),
							(0, react_jsx_runtime.jsxs)("label", {
								style: {
									flex: "none",
									display: "flex",
									flexDirection: "column",
									gap: 4,
									minWidth: 0,
									fontSize: 12,
									...textSecondary
								},
								children: ["会议默认工作区：", (0, react_jsx_runtime.jsxs)("select", {
									disabled: locked,
									style: {
										width: "100%",
										minWidth: 0,
										boxSizing: "border-box"
									},
									"data-round-table-secretary-workspace": "",
									value: secretaryWorkspaceId ?? "",
									onChange: (event) => setSecretaryWorkspaceChoice(event.target.value === "" ? void 0 : event.target.value),
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "请选择工作区"
									}), workspaces.map((workspace) => (0, react_jsx_runtime.jsx)("option", {
										value: workspace.workspaceId,
										children: workspace.title
									}, workspace.workspaceId))]
								})]
							}),
							(0, react_jsx_runtime.jsx)("p", {
								style: {
									fontSize: 12,
									margin: 0
								},
								children: "默认工作区用于新实例与专属秘书；已有成员保留各自项目权限。"
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								style: {
									flex: "none",
									fontSize: 12,
									...textSecondary
								},
								children: [
									"邀请谁参与：选择已有窗口（",
									checked.size,
									" 已选）"
								]
							}),
							!creation && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(SessionPicker, {
								rows,
								archivedSessionIds,
								checked,
								onToggle: toggle
							}), (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
								"按预设新建骑士、设置职责与独立工作区（",
								knights.length,
								" 已选）"
							] }), (0, react_jsx_runtime.jsx)(PresetKnightPicker, {
								api: connection.api,
								workspaces,
								followCurrentLabel,
								selected: knights,
								onChange: (next) => {
									if (locked) return;
									setKnights(next);
									setEmptyArmed(false);
								}
							})] })] }),
							creation && (0, react_jsx_runtime.jsxs)("section", {
								"aria-label": "会议创建进度",
								children: [
									(0, react_jsx_runtime.jsx)("b", { children: creation.meetingId ? `会议已创建 · ${creation.title}` : "正在创建会议" }),
									memberCreationResults(creation),
									creation.uncertain && (0, react_jsx_runtime.jsx)("p", {
										role: "alert",
										children: creation.requestSafe ? "创建结果待核实，可重试原创建请求；沿用相同请求身份，不会另建会议。" : `旧创建记录没有请求身份，请返回列表确认是否已有「${creation.title}」。为避免重复创建，本次不会再次建会；创建记录已保留。`
									}),
									creation.meetingId && (0, react_jsx_runtime.jsx)("button", {
										style: buttonBase,
										disabled: busy,
										onClick: () => {
											onCreated(creation.meetingId).catch((e) => setError(String(e)));
										},
										children: "进入已创建会议"
									})
								]
							}),
							(!persistence.available || !progressSaved) && (0, react_jsx_runtime.jsx)("p", {
								role: "alert",
								children: "创建进度仅在本窗口内保留，关闭或刷新前请记下会议与窗口身份。"
							}),
							error !== void 0 && (0, react_jsx_runtime.jsx)("p", {
								role: "alert",
								style: {
									flex: "none",
									margin: 0,
									fontSize: 12,
									color: "var(--dsw-alias-state-error-primary)"
								},
								children: error
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						"data-round-table-create-footer": "",
						style: {
							flex: "none",
							paddingTop: 8,
							borderTop: "1px solid var(--dsw-alias-border-l2)"
						},
						children: [
							(0, react_jsx_runtime.jsx)("p", {
								style: {
									fontSize: 12,
									margin: "0 0 8px"
								},
								children: "创建后会给所选成员发送入会简报，成员可能回应；后续任务仍需你明确放行。秘书独立创建，不参与普通讨论。"
							}),
							emptyArmed && checked.size === 0 && knights.length === 0 && (0, react_jsx_runtime.jsx)("p", {
								"data-round-table-empty-warn": "",
								style: {
									margin: "0 0 4px",
									fontSize: 11,
									lineHeight: "16px",
									color: "var(--dsw-alias-state-error-primary)"
								},
								children: "未选择任何窗口——再点一次「确认创建空会议」将创建 0 成员会议。"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-round-table-create-submit": "",
								style: primaryButton,
								disabled: busy || !!creation?.uncertain && !creation.requestSafe,
								onClick: () => {
									submit();
								},
								children: busy ? "处理中…" : creation?.uncertain && creation.requestSafe ? "重试原创建请求" : creation ? "重试未完成步骤" : emptyArmed && checked.size === 0 && knights.length === 0 ? "确认创建空会议" : "创建会议"
							})
						]
					})
				]
			});
		}
		/** Resolve only a member's own workspace; the meeting default does not imply membership. */
		function memberWorkspaceInfo(sessionId, cwd, workspaces = []) {
			const normalize = (path) => {
				const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
				return /^[a-z]:[\\/]|^\\\\|^\/\//i.test(path) ? normalized.toLowerCase() : normalized;
			};
			const actual = cwd?.trim() ? cwd : void 0;
			const workspace = workspaces.find((w) => w.sessionIds?.includes(sessionId) && (!actual || normalize(w.path) === normalize(actual)));
			const path = actual ?? workspace?.path;
			if (!path) return { label: "宿主未提供" };
			const title = workspace?.title.trim();
			const parts = path.split(/[\\/]+/).filter(Boolean);
			const short = /^(?:[a-z]:[\\/]*|\/+)$/i.test(path) ? path : parts.slice(-2).join("/") || path;
			return {
				label: title && normalize(title) !== normalize(path) && !/^[a-z]:[\\/]|^[\\/]/i.test(title) ? title : short,
				path
			};
		}
		/** 原会话状态与主要操作常显；完整路径、权限说明和最近回复收在详情中。 */
		function MemberLive({ nameOf, sessionId, running, present, meetingId, onChanged, onRemove, onOpen, cwd, workspaces = [], releases = [], discussions = [], workflow, availability }) {
			const label = nameOf(sessionId);
			const workspace = memberWorkspaceInfo(sessionId, cwd, workspaces);
			const [reply, setReply] = (0, react.useState)(void 0);
			const [privatePreview, setPrivatePreview] = (0, react.useState)(false), [recoveryError, setRecoveryError] = (0, react.useState)(""), [recovering, setRecovering] = (0, react.useState)(false);
			const { meetingCall } = scopedLocal((0, react.useRef)(localScopeId()).current);
			const affectedTasks = releases.flatMap((r) => r.tasks.filter((t) => t.toSessionId === sessionId && ![
				"completed",
				"failed",
				"cancelled"
			].includes(t.status)).map((t) => r.title ?? r.instruction.slice(0, 60)));
			const affectedDiscussion = discussions.filter((d) => d.deliveries.some((v) => v.toSessionId === sessionId && v.status !== "cancelled")).map((d) => `普通讨论：${d.instruction.slice(0, 60)}`);
			const affectedNodes = [...workflow?.draft?.nodes ?? [], ...workflow?.runs.filter((r) => r.status === "active").flatMap((r) => r.definition.nodes) ?? []].filter((n) => n.memberIds.includes(sessionId)).map((n) => `仍依赖此成员的环节：${n.title}`);
			const affected = [...affectedTasks, ...affectedDiscussion];
			const [removeArmed, setRemoveArmed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!present || !privatePreview) return void 0;
				let alive = true;
				let inFlight = false;
				const tick = async () => {
					if (inFlight) return;
					inFlight = true;
					try {
						const latest = (await meetingCall(meetingId, "member-reply", { sessionId })).text;
						if (alive && latest !== void 0) setReply(latest);
					} catch {} finally {
						inFlight = false;
					}
				};
				tick();
				const timer = setInterval(() => {
					tick();
				}, 5e3);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, [
				sessionId,
				present,
				privatePreview
			]);
			return (0, react_jsx_runtime.jsxs)("section", {
				"data-round-table-member": sessionId,
				style: {
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 10,
					padding: "8px 10px",
					display: "flex",
					flexDirection: "column",
					gap: 6,
					minWidth: 0
				},
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						style: {
							display: "flex",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 6,
							minWidth: 0
						},
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								title: !present ? "原窗口未连接" : running ? "原窗口忙碌" : "可投递",
								style: {
									flex: "none",
									width: 8,
									height: 8,
									borderRadius: "50%",
									background: !present ? "var(--dsw-alias-state-error-primary)" : running ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-caption)"
								}
							}),
							(0, react_jsx_runtime.jsx)("span", {
								title: label,
								style: {
									fontSize: 12,
									fontWeight: 500,
									flex: "1 1 90px",
									minWidth: 0,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									...textPrimary
								},
								children: label
							}),
							(0, react_jsx_runtime.jsx)("span", {
								style: {
									marginLeft: "auto",
									fontSize: 11,
									whiteSpace: "nowrap",
									...textTertiary
								},
								children: availability?.state === "archived" ? "原会话已归档" : availability?.state === "deleted" ? "原会话已删除" : availability?.state === "unknown" ? "原会话状态待确认" : !present ? "确认执行后自动恢复" : running ? "原窗口忙碌" : "已就绪"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-round-table-open-session": sessionId,
								style: {
									...buttonBase,
									flex: "none",
									whiteSpace: "nowrap",
									padding: "0 6px",
									fontSize: 11,
									lineHeight: "16px"
								},
								onClick: () => onOpen(sessionId),
								children: "打开会话"
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"data-round-table-remove-member": sessionId,
								"data-armed": removeArmed || void 0,
								style: {
									...buttonBase,
									flex: "none",
									whiteSpace: "nowrap",
									padding: "0 6px",
									fontSize: 11,
									lineHeight: "16px",
									...removeArmed ? {
										borderColor: "var(--dsw-alias-state-error-primary)",
										color: "var(--dsw-alias-state-error-primary)"
									} : {}
								},
								onClick: () => {
									if (!removeArmed) {
										setRemoveArmed(true);
										return;
									}
									setRemoveArmed(false);
									onRemove(sessionId);
								},
								children: removeArmed ? "确认移除？" : "移除"
							})
						]
					}),
					availability?.reason && (0, react_jsx_runtime.jsx)("p", {
						role: [
							"archived",
							"deleted",
							"unknown",
							"restore_failed"
						].includes(availability.state) ? "alert" : "status",
						children: availability.reason
					}),
					!present && !["archived", "deleted"].includes(availability?.state ?? "") && (0, react_jsx_runtime.jsx)("button", {
						style: buttonBase,
						disabled: recovering,
						onClick: () => {
							setRecovering(true);
							meetingCall(meetingId, "member-retry", {
								sessionId,
								confirmed: true
							}).then(() => onChanged()).catch((e) => setRecoveryError(String(e instanceof Error ? e.message : e))).finally(() => setRecovering(false));
						},
						children: recovering ? "恢复原会话中…" : "在会议内重试恢复"
					}),
					recoveryError && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: recoveryError
					}),
					removeArmed && (0, react_jsx_runtime.jsxs)("div", {
						role: "alertdialog",
						"aria-label": "确认移出会议",
						children: [
							(0, react_jsx_runtime.jsxs)("p", { children: [
								"将「",
								label,
								"」移出本会，结束 ",
								affected.length,
								" 项未完成等待；原会话、历史发言和已提交结果保留。仍依赖此成员的环节需要重新安排，不会视作完成。"
							] }),
							affectedNodes.length > 0 && (0, react_jsx_runtime.jsx)("ul", { children: [...new Set(affectedNodes)].map((title) => (0, react_jsx_runtime.jsx)("li", { children: title }, title)) }),
							affected.length > 0 && (0, react_jsx_runtime.jsx)("ul", { children: affected.map((title, i) => (0, react_jsx_runtime.jsx)("li", { children: title }, i)) }),
							(0, react_jsx_runtime.jsx)("button", {
								style: buttonBase,
								onClick: () => setRemoveArmed(false),
								children: "取消移除"
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "baseline",
							gap: 4,
							minWidth: 0,
							fontSize: 12,
							...textSecondary
						},
						children: [(0, react_jsx_runtime.jsx)("span", {
							style: { flex: "none" },
							children: "原工作区："
						}), (0, react_jsx_runtime.jsx)("span", {
							"data-round-table-workspace-label": sessionId,
							title: workspace.path,
							tabIndex: 0,
							"aria-label": `原工作区：${workspace.label}${workspace.path ? `，完整路径：${workspace.path}` : ""}`,
							style: {
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: workspace.label
						})]
					}),
					(0, react_jsx_runtime.jsxs)("details", {
						"data-round-table-member-details": sessionId,
						onToggle: (e) => setPrivatePreview(e.currentTarget.open),
						style: {
							minWidth: 0,
							fontSize: 12
						},
						children: [(0, react_jsx_runtime.jsx)("summary", {
							style: {
								cursor: "pointer",
								width: "fit-content",
								...textSecondary
							},
							children: "会话详情"
						}), (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6,
								marginTop: 6,
								minWidth: 0
							},
							children: [
								workspace.path && (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("small", {
									style: textTertiary,
									children: "完整工作区路径"
								}), (0, react_jsx_runtime.jsx)("p", {
									"data-round-table-workspace-full": sessionId,
									style: {
										margin: 0,
										overflowWrap: "anywhere",
										whiteSpace: "pre-wrap",
										userSelect: "text"
									},
									children: workspace.path
								})] }),
								(0, react_jsx_runtime.jsx)("p", {
									style: {
										margin: 0,
										...textTertiary
									},
									children: "文件权限沿用原会话设置。"
								}),
								(0, react_jsx_runtime.jsx)("small", { children: "原会话最近回复预览（可能包含其他工作，不自动发布）" }),
								(0, react_jsx_runtime.jsx)("p", {
									style: {
										margin: 0,
										fontSize: 12,
										lineHeight: "18px",
										...textSecondary,
										display: "-webkit-box",
										WebkitBoxOrient: "vertical",
										WebkitLineClamp: 4,
										overflow: "hidden",
										whiteSpace: "pre-wrap",
										wordBreak: "break-word"
									},
									children: !present ? "窗口不在当前会话列表（离线或已移除）" : reply ?? "（暂无发言）"
								})
							]
						})]
					})
				]
			});
		}
		/** 任务状态条的中文标签（与 flat-teams TaskStatus 对齐）。 */
		const TASK_STATUS_LABEL = {
			pending: "待投递",
			delivered: "已派发",
			claimed: "已认领",
			in_progress: "进行中",
			completed: "已完成",
			failed: "失败",
			cancelled: "已取消",
			timeout: "超时"
		};
		function taskStatusColor(status) {
			if (status === "completed") return "var(--dsw-alias-state-business-primary)";
			if (status === "failed" || status === "cancelled" || status === "timeout") return "var(--dsw-alias-state-error-primary)";
			return "var(--dsw-alias-label-tertiary)";
		}
		function MeetingView({ rtCtx, useSessions, useWorkspaces, connection, meeting, onBack, onChanged, onDeleted, onJumpMeeting, onRecovery }) {
			const mountScope = (0, react.useRef)(localScopeId()).current, mountHome = (0, react.useRef)(connection.homePath?.()).current;
			const { readLocal, writeLocal, meetingCall } = scopedLocal(mountScope);
			const isCurrent = () => mountScope === localScopeId() && (!connection.homePath || mountHome === connection.homePath());
			const postJson = (url, body) => {
				if (!isCurrent()) return Promise.reject(new MemberCreationStopped());
				return postJsonForScope(url, body, mountScope);
			};
			const [draft, setDraft] = (0, react.useState)(() => readLocal(`message-draft.${meeting?.meetingId}`, ""));
			const [focusTask, setFocusTask] = (0, react.useState)();
			const [tab, setTab] = (0, react.useState)(() => {
				const saved = readLocal(`tab.${meeting?.meetingId}`, "discussion");
				return ["members", "tasks"].includes(saved) ? "discussion" : saved;
			});
			const [sidebarOpen, setSidebarOpen] = (0, react.useState)(false), [selectedMember, setSelectedMember] = (0, react.useState)(null), [taskModal, setTaskModal] = (0, react.useState)(false), [overview, setOverview] = (0, react.useState)(false);
			const [immediateConfirm, setImmediateConfirm] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (meeting) {
					writeLocal(`message-draft.${meeting.meetingId}`, draft);
					writeLocal(`tab.${meeting.meetingId}`, tab);
				}
			}, [
				draft,
				tab,
				meeting?.meetingId
			]);
			(0, react.useRef)();
			(0, react.useRef)(false);
			const [sending, setSending] = (0, react.useState)(false);
			const [sendError, setSendError] = (0, react.useState)(void 0);
			const [target, setTarget] = (0, react.useState)(void 0);
			const [mention, setMention] = (0, react.useState)(void 0);
			const [addOpen, setAddOpen] = (0, react.useState)(() => !!readLocal(`member-create.${meeting?.meetingId}`, void 0));
			const [addChecked, setAddChecked] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [addTab, setAddTab] = (0, react.useState)("existing");
			const [addKnights, setAddKnights] = (0, react.useState)([]);
			const [addBusy, setAddBusy] = (0, react.useState)(false);
			const [addBatch, setAddBatch] = (0, react.useState)(() => readLocal(`member-create.${meeting?.meetingId}`, void 0));
			const addBatchRef = (0, react.useRef)(addBatch), addGuard = (0, react.useRef)(false);
			const persistence = useLocalPersistence(), [memberProgressSaved, setMemberProgressSaved] = (0, react.useState)(true);
			const saveAddBatch = (value) => {
				if (!isCurrent()) throw new MemberCreationStopped();
				addBatchRef.current = value;
				setAddBatch(value);
				if (!writeLocal(`member-create.${meeting?.meetingId}`, value ?? null)) setMemberProgressSaved(false);
			};
			const [secretaryBusy, setSecretaryBusy] = (0, react.useState)(false);
			const [secretaryWorkspaceChoice, setSecretaryWorkspaceChoice] = (0, react.useState)("");
			const rowOf = useSessionRows(useSessions);
			const allRows = useSessions((s) => s.ids.map((id) => ({
				id,
				row: s.byId[id]
			})).filter((item) => item.row !== void 0));
			const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds);
			const workspaceSnapshot = useWorkspaces((s) => s);
			const workspaces = workspaceSnapshot.items;
			const currentSessionId = useSessions((s) => s.current);
			const followCurrentLabel = workspaces.find((workspace) => currentSessionId !== void 0 && workspace.sessionIds?.includes(currentSessionId))?.title;
			const retrySecretary = async () => {
				if (meeting === void 0) return;
				const id = meeting.secretary?.workspaceId ?? (secretaryWorkspaceChoice || meeting.defaultWorkspaceId || "");
				if (id === "" || secretaryBusy) {
					setSendError("请选择有效秘书工作区");
					return;
				}
				setSecretaryBusy(true);
				try {
					await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/retry-secretary`, { secretaryWorkspaceId: id });
					await onChanged();
				} catch (error) {
					setSendError(String(error));
				} finally {
					setSecretaryBusy(false);
				}
			};
			const nameOf = (sessionId) => rowOf(sessionId)?.displayTitle ?? meeting?.memberNames?.[sessionId] ?? `${sessionId.slice(0, 18)}…`;
			const nameStamp = meeting?.memberSessionIds.map((id) => `${id}:${rowOf(id)?.displayTitle ?? ""}`).join("|");
			(0, react.useEffect)(() => {
				if (!meeting || meeting.archivedAt) return;
				const names = Object.fromEntries(meeting.memberSessionIds.filter((id) => rowOf(id)?.displayTitle && meeting.memberNames?.[id] !== rowOf(id)?.displayTitle).map((id) => [id, rowOf(id).displayTitle]));
				if (Object.keys(names).length) meetingCall(meeting.meetingId, "member-names", { names }).then(onChanged).catch(() => {});
			}, [nameStamp]);
			if (meeting === void 0) return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [(0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: {
						...buttonBase,
						alignSelf: "flex-start"
					},
					onClick: onBack,
					children: "← 返回"
				}), (0, react_jsx_runtime.jsx)("p", {
					style: {
						margin: 0,
						fontSize: 12,
						...textTertiary
					},
					children: "会议不存在或已删除，请返回列表。"
				})]
			});
			/** 添加成员选择器的行：全局会话减去已在会成员（归档/subagent 由 SessionPicker 分层排除）。 */
			const nonMemberRows = allRows.filter(({ id }) => !meeting.memberSessionIds.includes(id));
			/** 移除成员（MemberLive 二次确认后调用）；@候选与广播名单随轮询自动同步。 */
			const removeMember = async (sessionId) => {
				setSendError(void 0);
				try {
					await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/leave`, { sessionId });
					await onChanged();
				} catch (cause) {
					setSendError(String(cause instanceof Error ? cause.message : cause));
				}
			};
			/** 添加成员：逐个走现有 join 端点（幂等）。 */
			const addMembers = async () => {
				if (addGuard.current || !addBatchRef.current && (addTab === "existing" ? addChecked.size === 0 : addKnights.length === 0)) return;
				addGuard.current = true;
				setAddBusy(true);
				setSendError(void 0);
				try {
					if (!isCurrent()) throw new MemberCreationStopped();
					let batch = addBatchRef.current;
					if (!batch) {
						if (addTab === "preset" && (new Set(addKnights.map((knight) => knight.title.trim())).size !== addKnights.length || addKnights.some((knight) => knight.title.trim() === ""))) throw new Error("同一会议的骑士名称必须非空且不重复");
						const resolved = resolveKnightWorkspaces(addTab === "preset" ? addKnights : [], workspaceSnapshot, currentSessionId);
						if (addTab === "preset" && !resolved.ok) throw Error(resolved.error);
						batch = memberCreationBatch(addTab === "existing" ? [...addChecked].map((sessionId) => ({
							sessionId,
							title: nameOf(sessionId)
						})) : [], addTab === "preset" ? addKnights : [], resolved.ok ? resolved.workspaceIds : []);
						saveAddBatch(batch);
					}
					batch = await runMemberCreation(batch, connection, (step) => postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/join`, {
						sessionId: step.sessionId,
						origin: step.presetId ? {
							source: "preset",
							presetId: step.presetId,
							workspaceId: step.workspaceId
						} : { source: "existing" },
						...step.role ? { role: step.role } : {}
					}), saveAddBatch, isCurrent);
					if (batch.members.some((x) => x.stage !== "done")) setSendError("部分成员未完成；已加入的成员不会重复创建或再次简报。请查看逐项结果。");
					else {
						setAddChecked(/* @__PURE__ */ new Set());
						setAddKnights([]);
					}
					await onChanged();
				} catch (cause) {
					setSendError(String(cause instanceof Error ? cause.message : cause));
				} finally {
					addGuard.current = false;
					setAddBusy(false);
				}
			};
			/** 广播核心（输入框与"结论发到会议"共用同一条投递通道——红线：不新造投递路径）。 */
			const broadcastText = async (text) => {
				if (text === "" || sending) return false;
				setSending(true);
				setSendError(void 0);
				const tagged = meetingTag(meeting.title, text);
				const deliveries = [];
				for (const sessionId of meeting.memberSessionIds) {
					const face = resolveFace(rtCtx, sessionId);
					if (face === void 0) {
						deliveries.push({
							sessionId,
							status: "undelivered",
							error: "窗口不在当前会话列表（离线或已移除）"
						});
						continue;
					}
					try {
						const result = await face.prompt([{
							type: "text",
							text: tagged
						}], "queue");
						if (result.ok) deliveries.push({
							sessionId,
							status: "delivered"
						});
						else deliveries.push({
							sessionId,
							status: "undelivered",
							error: result.error.message ?? String(result.error.code ?? "拒绝接收")
						});
					} catch (cause) {
						deliveries.push({
							sessionId,
							status: "undelivered",
							error: String(cause instanceof Error ? cause.message : cause)
						});
					}
				}
				try {
					await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/broadcast`, {
						text,
						deliveries
					});
					await onChanged();
					return true;
				} catch (cause) {
					setSendError(String(cause instanceof Error ? cause.message : cause));
					return false;
				} finally {
					setSending(false);
				}
			};
			const broadcast = async () => {
				const text = draft.trim();
				if (await broadcastText(text)) setDraft("");
			};
			/** @派遣：host 端点内嵌圆桌任务投递。 */
			const dispatch = async () => {
				const text = draft.trim();
				if (text === "" || sending || target === void 0) return;
				setSending(true);
				setSendError(void 0);
				try {
					await postJson(`${MEETINGS_URL}/${encodeURIComponent(meeting.meetingId)}/dispatch`, {
						toSessionId: target.sessionId,
						title: text.length > 24 ? `${text.slice(0, 24)}…` : text,
						text
					});
					setDraft("");
					setTarget(void 0);
					await onChanged();
				} catch (cause) {
					setSendError(String(cause instanceof Error ? cause.message : cause));
				} finally {
					setSending(false);
				}
			};
			mention === void 0 || meeting.memberSessionIds.map((sessionId) => ({
				sessionId,
				label: nameOf(sessionId)
			})).filter((item) => mention.query === "" || item.label.includes(mention.query));
			const history = meeting.events.filter((event) => event.kind !== "create" && (tab !== "tasks" || event.kind === "task"));
			const taskAttention = meeting.releases?.flatMap((r) => r.tasks).filter((t) => taskNeedsAction(meeting, t)) ?? [];
			const faults = meeting.counts?.faults ?? taskAttention.filter((t) => [
				"offline",
				"uncertain",
				"failed"
			].includes(t.status)).length;
			const awaitingReview = meeting.counts?.awaitingReview ?? taskAttention.filter((t) => t.status === "completed" && t.review !== "accepted").length;
			const running = (meeting.counts?.running ?? taskAttention.filter((t) => [
				"delivering",
				"delivered",
				"in_progress"
			].includes(t.status)).length) + taskAttention.filter((t) => t.status === "queued").length;
			const workflowRun = meeting.workflow?.runs.find((r) => r.status === "active") ?? meeting.workflow?.runs.at(-1);
			const latestMinutes = meeting.minutes?.at(-1);
			const nextAction = meeting.archivedAt ? {
				page: "settings",
				label: "查看归档与恢复设置"
			} : faults ? {
				page: "tasks",
				label: `核实 ${faults} 项投递或执行异常`
			} : awaitingReview ? {
				page: "tasks",
				label: `验收 ${awaitingReview} 项已提交结果`
			} : meeting.memberSessionIds.length === 0 ? {
				page: "members",
				label: "添加参会成员，开始这场会议"
			} : meeting.secretary?.status !== "ready" ? {
				page: "settings",
				label: meeting.secretary ? "重试秘书初始化" : "配置秘书，准备整理纪要"
			} : workflowRun?.status === "active" && workflowRun.paused ? {
				page: "workflow",
				label: "查看暂停原因与继续条件"
			} : latestMinutes?.integrity && !latestMinutes.integrity.reviewedAt ? {
				page: "minutes",
				label: "核对最新纪要，再决定是否分享"
			} : workflowRun?.status === "completed" && !latestMinutes ? {
				page: "minutes",
				label: "流程已完成，整理会议纪要"
			} : running ? {
				page: "tasks",
				label: `查看 ${running} 项等待／执行中的任务`
			} : workflowRun?.status === "completed" ? {
				page: "workflow",
				label: "本次运行已结束，查看记录或准备下一轮"
			} : {
				page: "discussion",
				label: "记录会议内容，或 @ 成员提出问题"
			};
			const management = (0, react_jsx_runtime.jsx)(MeetingManagement, {
				meeting,
				onChanged,
				onDeleted: onDeleted ?? (() => onBack())
			});
			const addPanel = addOpen && (0, react_jsx_runtime.jsxs)("section", {
				"data-round-table-add-panel": "",
				style: {
					flex: "none",
					border: "1px solid var(--dsw-alias-border-l1)",
					borderRadius: 10,
					padding: 8,
					display: "flex",
					flexDirection: "column",
					gap: 6,
					maxHeight: 260,
					overflowY: "auto"
				},
				children: [
					!addBatch && (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 5
						},
						children: [(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: addBusy,
							style: buttonBase,
							"aria-pressed": addTab === "existing",
							onClick: () => setAddTab("existing"),
							children: "选择已有窗口"
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: addBusy,
							style: buttonBase,
							"aria-pressed": addTab === "preset",
							onClick: () => setAddTab("preset"),
							children: "按预设新建"
						})]
					}),
					!addBatch && addTab === "existing" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("span", {
						style: {
							fontSize: 12,
							...textSecondary
						},
						children: [
							"勾选窗口加入会议（",
							addChecked.size,
							" 已选）"
						]
					}), (0, react_jsx_runtime.jsx)(SessionPicker, {
						rows: nonMemberRows,
						archivedSessionIds,
						checked: addChecked,
						onToggle: (id) => {
							if (addBusy) return;
							setAddChecked((prev) => {
								const next = new Set(prev);
								if (next.has(id)) next.delete(id);
								else next.add(id);
								return next;
							});
						}
					})] }),
					!addBatch && addTab === "preset" && (0, react_jsx_runtime.jsx)(PresetKnightPicker, {
						api: connection.api,
						workspaces,
						followCurrentLabel,
						selected: addKnights,
						onChange: (next) => {
							if (!addBusy) setAddKnights(next);
						}
					}),
					addBatch && (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": "成员创建进度",
						children: [memberCreationResults(addBatch), addBatch.members.every((x) => x.stage === "done") && (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: "本批成员已全部加入。"
						})]
					}),
					(!persistence.available || !memberProgressSaved) && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: "创建进度仅在本窗口内保留，关闭或刷新前请记下窗口身份。"
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						"data-round-table-add-submit": "",
						style: {
							...primaryButton,
							alignSelf: "flex-start"
						},
						disabled: addBusy || !addBatch && (addTab === "existing" ? addChecked.size === 0 : addKnights.length === 0),
						onClick: () => {
							if (addBatch?.members.every((x) => x.stage === "done")) saveAddBatch(void 0);
							else addMembers();
						},
						children: addBusy ? "加入中…" : addBatch ? addBatch.members.every((x) => x.stage === "done") ? "继续添加成员" : "重试未完成步骤" : addTab === "existing" ? "加入所选" : "创建并加入"
					})
				]
			});
			const openMember = (id, taskId) => {
				setSidebarOpen(true);
				setSelectedMember(id ?? null);
				if (taskId) setFocusTask({
					id: taskId,
					nonce: Date.now()
				});
			};
			const navigate = (page) => {
				if (page === "members") {
					openMember();
					return;
				}
				if (page === "tasks") {
					setTaskModal(true);
					return;
				}
				setTab(page);
			};
			if (meeting.deletion) return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [
					(0, react_jsx_runtime.jsx)("button", {
						style: buttonBase,
						onClick: onBack,
						children: "返回会议列表"
					}),
					management,
					(0, react_jsx_runtime.jsx)("button", {
						style: buttonBase,
						onClick: onRecovery,
						children: "找回旧草稿"
					})
				]
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "rt-meeting-shell",
				style: {
					display: "flex",
					flexDirection: "column",
					flex: 1,
					minHeight: 0,
					gap: 4
				},
				children: [
					(0, react_jsx_runtime.jsx)("style", { children: meetingShellStyles }),
					(0, react_jsx_runtime.jsxs)("header", {
						className: "rt-meeting-header",
						"aria-label": "会议管理",
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-meeting-title-row",
								children: [
									(0, react_jsx_runtime.jsx)("button", {
										style: buttonBase,
										onClick: onBack,
										children: "← 返回"
									}),
									(0, react_jsx_runtime.jsx)("b", {
										title: meeting.title,
										children: meeting.title
									}),
									(0, react_jsx_runtime.jsx)("span", {
										"data-meeting-status": "",
										children: meeting.archivedAt ? "已归档" : meeting.releasePaused ? "暂停投递" : workflowRun?.status === "completed" ? "本次运行已结束" : workflowRun?.paused ? "流程暂停" : "会议讨论"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										style: buttonBase,
										"aria-expanded": overview,
										onClick: () => setOverview((v) => !v),
										children: "会议概况"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										style: buttonBase,
										onClick: () => {
											openMember();
											setAddOpen(true);
										},
										disabled: !!meeting.archivedAt,
										children: "添加成员"
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "rt-meeting-summary-row",
								children: [
									(0, react_jsx_runtime.jsx)("button", {
										style: buttonBase,
										onClick: () => openMember(),
										"aria-expanded": sidebarOpen,
										children: "成员"
									}),
									(0, react_jsx_runtime.jsxs)("span", { children: [
										meeting.memberSessionIds.length,
										"人 · ",
										faults,
										"项异常 · ",
										awaitingReview,
										"项待验收"
									] }),
									(0, react_jsx_runtime.jsxs)("button", {
										"data-meeting-next-action": "",
										style: buttonBase,
										onClick: () => nextAction.page === "tasks" ? openMember(taskAttention[0]?.toSessionId, taskAttention[0]?.taskId) : navigate(nextAction.page),
										children: ["下一步：", nextAction.label]
									})
								]
							}),
							overview && (0, react_jsx_runtime.jsxs)("section", {
								className: "rt-meeting-overview",
								children: [
									(0, react_jsx_runtime.jsx)("p", { children: meeting.description || "尚未填写会议说明" }),
									(0, react_jsx_runtime.jsxs)("p", { children: [
										"秘书：",
										meeting.secretary?.status === "ready" ? "就绪" : "待配置",
										" · ",
										running,
										"项等待／执行中"
									] }),
									taskAttention.map((t) => (0, react_jsx_runtime.jsxs)("button", {
										style: buttonBase,
										onClick: () => openMember(t.toSessionId, t.taskId),
										children: [
											nameOf(t.toSessionId),
											" · ",
											t.status === "completed" ? reviewState(meeting, t) : taskRecoveryText(t)?.title ?? t.status,
											" → 工作日志"
										]
									}, t.taskId))
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("nav", {
						className: "rt-meeting-nav",
						"aria-label": "会议功能",
						children: [[
							["discussion", "讨论"],
							["workflow", "进程"],
							["resources", "资料"],
							["minutes", "纪要"],
							["settings", "设置"]
						].map(([id, label]) => (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: {
								...buttonBase,
								fontWeight: tab === id ? 700 : 400,
								borderBottom: tab === id ? "2px solid var(--dsw-alias-state-business-primary)" : void 0,
								background: tab === id ? "var(--dsw-alias-interactive-bg-hover)" : void 0
							},
							"aria-pressed": tab === id,
							onClick: () => navigate(id),
							children: label
						}, id)), (0, react_jsx_runtime.jsx)("button", {
							style: buttonBase,
							onClick: () => setTaskModal(true),
							children: "任务卡"
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: "rt-meeting-body",
						"data-meeting-body": "",
						style: {
							flex: 1,
							minHeight: 0,
							display: "flex",
							position: "relative"
						},
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: "rt-meeting-content",
							style: {
								flex: 1,
								minWidth: 0,
								minHeight: 0,
								overflowY: tab === "discussion" ? "hidden" : "auto",
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									style: { display: tab === "settings" ? "contents" : "none" },
									children: [management, (0, react_jsx_runtime.jsx)("button", {
										style: buttonBase,
										onClick: onRecovery,
										children: "找回旧草稿"
									})]
								}),
								(0, react_jsx_runtime.jsx)("div", {
									style: { display: tab === "settings" ? "contents" : "none" },
									children: (0, react_jsx_runtime.jsxs)("section", {
										"data-round-table-secretary": "",
										style: {
											flex: "none",
											border: "1px solid var(--dsw-alias-border-l2)",
											borderRadius: 8,
											padding: 7,
											fontSize: 12,
											...textSecondary
										},
										children: [
											"秘书 · ",
											meeting.secretary?.status === "ready" ? "就绪" : meeting.secretary === void 0 ? "尚未配置" : meeting.secretary.status === "initializing" ? "正在初始化…" : "初始化失败",
											meeting.secretary?.error !== void 0 ? `：${meeting.secretary.error}` : "",
											meeting.secretary?.status !== "ready" && meeting.secretary?.status !== "initializing" && (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: meeting.secretary === void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("p", {
												style: { margin: 0 },
												children: "此会议尚未配置秘书。请选择工作区补建；不会重新创建会议或影响普通成员。"
											}), (0, react_jsx_runtime.jsxs)("select", {
												"aria-label": "秘书默认工作区",
												value: secretaryWorkspaceChoice || meeting.defaultWorkspaceId || "",
												onChange: (e) => setSecretaryWorkspaceChoice(e.target.value),
												children: [(0, react_jsx_runtime.jsx)("option", {
													value: "",
													children: "选择默认工作区"
												}), workspaces.map((w) => (0, react_jsx_runtime.jsx)("option", {
													value: w.workspaceId,
													children: w.title
												}, w.workspaceId))]
											})] }) }), (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: secretaryBusy,
												onClick: () => {
													retrySecretary();
												},
												children: secretaryBusy ? "正在配置…" : meeting.secretary ? "重试秘书初始化" : "补建会议秘书"
											})] })
										]
									})
								}),
								(0, react_jsx_runtime.jsx)("div", {
									style: { display: taskModal || ["discussion", "tasks"].includes(tab) ? "contents" : "none" },
									children: (0, react_jsx_runtime.jsx)(ReleasePanel, {
										taskCards: meeting.taskCards,
										taskCardGenerations: meeting.taskCardGenerations,
										cardPublications: meeting.cardPublications,
										focusTask,
										meetingId: meeting.meetingId,
										workflow: meeting.workflow,
										messages: meeting.messages,
										releases: meeting.releases,
										paused: meeting.releasePaused,
										archived: !!meeting.archivedAt,
										assets: meeting.assets,
										memberStatus: meeting.memberStatus,
										view: tab,
										discussions: meeting.discussions,
										onViewChange: navigate,
										taskModal,
										onCloseTask: () => setTaskModal(false),
										onOpenMember: openMember,
										onOpenSession: (id) => rtCtx.uiWorkspace.openSession(id),
										onJumpMeeting,
										names: meeting.memberNames,
										members: meeting.memberSessionIds.map((id) => ({
											id,
											name: nameOf(id)
										})),
										onChanged
									}, meeting.meetingId)
								}),
								tab === "workflow" && (0, react_jsx_runtime.jsx)(WorkflowPanel, {
									onNavigate: navigate,
									meeting,
									members: meeting.memberSessionIds.map((id) => ({
										id,
										name: nameOf(id)
									})),
									onChanged,
									onOpenSession: (id) => rtCtx.uiWorkspace.openSession(id)
								}, meeting.meetingId),
								tab === "resources" && (0, react_jsx_runtime.jsx)(ResourcesPanel, {
									meetingId: meeting.meetingId,
									assets: meeting.assets,
									folder: meeting.meetingFolder,
									folderError: meeting.meetingFolderError,
									archived: !!meeting.archivedAt,
									onChanged
								}, meeting.meetingId),
								tab === "minutes" && (0, react_jsx_runtime.jsx)(MinutesPanel, {
									meetingId: meeting.meetingId,
									members: meeting.memberSessionIds.map((id) => ({
										id,
										name: nameOf(id)
									})),
									ready: meeting.secretary?.status === "ready" && !meeting.archivedAt,
									minutes: meeting.minutes,
									publishedIds: (meeting.messages ?? []).filter((m) => !!m.minutesId && !m.previewOnly).map((m) => m.minutesId),
									job: meeting.minutesJob,
									formalOnly: meeting.minutesSource !== "session",
									onChanged
								}),
								tab === "settings" && history.length > 0 && (0, react_jsx_runtime.jsxs)("details", { children: [(0, react_jsx_runtime.jsx)("summary", { children: "历史广播与旧任务" }), (0, react_jsx_runtime.jsxs)("section", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: 4
									},
									children: [(0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 12,
											fontWeight: 500,
											...textSecondary
										},
										children: "会议记录"
									}), history.map((event) => {
										if (event.kind === "rename") return (0, react_jsx_runtime.jsxs)("p", {
											style: {
												fontSize: 11,
												...textTertiary
											},
											children: [
												"会议改名：",
												event.oldTitle,
												" → ",
												event.title
											]
										}, event.id);
										if (event.kind === "description_update") return (0, react_jsx_runtime.jsx)("p", {
											style: {
												fontSize: 11,
												...textTertiary
											},
											children: "会议说明已更新"
										}, event.id);
										if (event.kind === "join" || event.kind === "leave") return (0, react_jsx_runtime.jsxs)("p", {
											style: {
												margin: 0,
												fontSize: 11,
												...textTertiary
											},
											children: [
												new Date(event.time).toLocaleTimeString(),
												" ",
												nameOf(event.sessionId),
												" ",
												event.kind === "join" ? `加入会议（${event.source === "secretary" ? "会议秘书" : event.source === "preset" ? `预设新建：${event.presetId ?? "未知预设"}${event.workspaceId === void 0 ? "" : `，工作区 ${event.workspaceId}`}` : "已有窗口"}）` : "退出会议"
											]
										}, event.id);
										if (event.kind === "task") return (0, react_jsx_runtime.jsxs)("article", {
											"data-round-table-task": event.taskId,
											"data-round-table-task-status": event.status,
											style: {
												border: "1px solid var(--dsw-alias-border-l2)",
												borderRadius: 10,
												padding: "6px 10px",
												display: "flex",
												flexDirection: "column",
												gap: 4
											},
											children: [
												(0, react_jsx_runtime.jsxs)("p", {
													style: {
														margin: 0,
														fontSize: 12,
														lineHeight: "18px",
														...textPrimary
													},
													children: ["任务：", event.title]
												}),
												(0, react_jsx_runtime.jsxs)("footer", {
													style: {
														display: "flex",
														flexWrap: "wrap",
														alignItems: "center",
														gap: 4,
														fontSize: 11
													},
													children: [(0, react_jsx_runtime.jsx)("span", {
														style: {
															lineHeight: "16px",
															padding: "0 6px",
															borderRadius: 999,
															border: "1px solid var(--dsw-alias-border-l2)",
															color: taskStatusColor(event.status)
														},
														children: TASK_STATUS_LABEL[event.status] ?? event.status
													}), (0, react_jsx_runtime.jsxs)("span", {
														style: textTertiary,
														children: [
															"→ ",
															event.toMember,
															"（",
															event.teamName,
															"）"
														]
													})]
												}),
												event.status === "completed" && event.result !== void 0 && (0, react_jsx_runtime.jsxs)("p", {
													style: {
														margin: 0,
														fontSize: 12,
														lineHeight: "18px",
														whiteSpace: "pre-wrap",
														wordBreak: "break-word",
														...textSecondary
													},
													children: ["结果：", event.result]
												}),
												event.error !== void 0 && (0, react_jsx_runtime.jsx)("p", {
													style: {
														margin: 0,
														fontSize: 12,
														lineHeight: "18px",
														color: "var(--dsw-alias-state-error-primary)"
													},
													children: event.error
												})
											]
										}, event.id);
										if (event.kind === "minutes") return (0, react_jsx_runtime.jsxs)("p", {
											style: {
												fontSize: 11,
												margin: 0,
												...textTertiary
											},
											children: [new Date(event.time).toLocaleTimeString(), " 秘书已生成纪要（在上方预览）"]
										}, event.id);
										if (event.kind !== "broadcast") return null;
										return (0, react_jsx_runtime.jsxs)("article", {
											"data-round-table-broadcast": event.id,
											style: {
												border: "1px solid var(--dsw-alias-border-l2)",
												borderRadius: 10,
												padding: "6px 10px",
												display: "flex",
												flexDirection: "column",
												gap: 4
											},
											children: [(0, react_jsx_runtime.jsx)("p", {
												style: {
													margin: 0,
													fontSize: 12,
													lineHeight: "18px",
													whiteSpace: "pre-wrap",
													wordBreak: "break-word",
													...textPrimary
												},
												children: event.text
											}), (0, react_jsx_runtime.jsx)("footer", {
												style: {
													display: "flex",
													flexWrap: "wrap",
													gap: 4
												},
												children: event.deliveries.map((delivery) => (0, react_jsx_runtime.jsxs)("span", {
													"data-round-table-delivery": delivery.status,
													title: delivery.error ?? delivery.status,
													style: {
														fontSize: 11,
														lineHeight: "16px",
														padding: "0 6px",
														borderRadius: 999,
														border: "1px solid var(--dsw-alias-border-l2)",
														color: delivery.status === "delivered" ? "var(--dsw-alias-label-tertiary)" : "var(--dsw-alias-state-error-primary)"
													},
													children: [
														delivery.status === "delivered" ? "✓" : "✗ 未送达",
														" ",
														nameOf(delivery.sessionId)
													]
												}, delivery.sessionId))
											})]
										}, event.id);
									})]
								})] })
							]
						}), (0, react_jsx_runtime.jsx)(MemberSidebar, {
							open: sidebarOpen,
							meeting,
							members: [.../* @__PURE__ */ new Set([
								...meeting.memberSessionIds,
								...Object.keys(meeting.memberNames ?? {}),
								...(meeting.releases ?? []).flatMap((r) => r.tasks.map((t) => t.toSessionId)),
								...(meeting.discussions ?? []).flatMap((d) => d.recipientIds)
							])].filter((id) => ![
								"user",
								"secretary",
								meeting.secretary?.sessionId
							].includes(id)).map((id) => ({
								id,
								name: nameOf(id),
								historical: !meeting.memberSessionIds.includes(id),
								connected: meeting.memberStatus?.[id]?.connected,
								running: meeting.memberStatus?.[id]?.running,
								statusLabel: !meeting.memberSessionIds.includes(id) ? "已离会 · 历史记录" : meeting.memberStatus?.[id]?.availability?.reason ?? (meeting.memberStatus?.[id]?.connected ? "已就绪" : "尚未加载"),
								workspaceLabel: memberWorkspaceInfo(id, rowOf(id)?.cwd, workspaces).label
							})),
							selectedMemberId: selectedMember,
							onSelectMember: setSelectedMember,
							onClose: () => setSidebarOpen(false),
							focusTaskId: focusTask?.id,
							onNavigateTask: (taskId) => {
								const task = meeting.releases?.flatMap((r) => r.tasks).find((t) => t.taskId === taskId);
								if (task) openMember(task.toSessionId, taskId);
							},
							renderManagement: () => addPanel,
							renderMemberDetails: (id) => !meeting.memberSessionIds.includes(id) ? (0, react_jsx_runtime.jsx)("p", { children: "这位成员已离会，历史发言、任务结果与修改记录仍可在会议工作日志查看。" }) : (0, react_jsx_runtime.jsx)(MemberLive, {
								nameOf,
								sessionId: id,
								running: meeting.memberStatus?.[id]?.running ?? false,
								present: meeting.memberStatus?.[id]?.connected ?? false,
								cwd: rowOf(id)?.cwd,
								workspaces,
								meetingId: meeting.meetingId,
								onChanged,
								onRemove: removeMember,
								onOpen: (sessionId) => rtCtx.uiWorkspace.openSession(sessionId),
								releases: meeting.releases,
								discussions: meeting.discussions,
								workflow: meeting.workflow,
								availability: meeting.memberStatus?.[id]?.availability
							}, id),
							renderTaskActions: (id) => (0, react_jsx_runtime.jsx)(MemberTaskActions, {
								meetingId: meeting.meetingId,
								memberId: id,
								memberName: nameOf(id),
								discussions: meeting.discussions ?? [],
								releases: meeting.releases ?? [],
								onChanged,
								focusTaskId: focusTask?.id
							}, id)
						})]
					}),
					sendError !== void 0 && (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: {
							flex: "none",
							margin: 0,
							fontSize: 12,
							lineHeight: "18px",
							color: "var(--dsw-alias-state-error-primary)"
						},
						children: sendError
					}),
					tab === "settings" && (0, react_jsx_runtime.jsxs)("details", {
						style: {
							flex: "none",
							fontSize: 12
						},
						children: [
							(0, react_jsx_runtime.jsx)("summary", { children: "立即操作（会唤醒成员，不受放行队列暂停约束）" }),
							(0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": "立即发送内容",
								rows: 3,
								style: inputStyle,
								value: draft,
								placeholder: "输入要立即发送的内容",
								onChange: (e) => setDraft(e.target.value)
							}),
							(0, react_jsx_runtime.jsxs)("select", {
								"aria-label": "立即发送对象",
								style: inputStyle,
								value: target?.sessionId ?? "",
								onChange: (e) => setTarget(e.target.value ? {
									sessionId: e.target.value,
									label: nameOf(e.target.value)
								} : void 0),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: "全员广播"
								}), meeting.memberSessionIds.map((id) => (0, react_jsx_runtime.jsx)("option", {
									value: id,
									children: nameOf(id)
								}, id))]
							}),
							(0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								style: buttonBase,
								disabled: sending || !!meeting.archivedAt || !draft.trim() || !meeting.memberSessionIds.length,
								onClick: () => setImmediateConfirm(true),
								children: [target ? `立即派遣给 ${target.label}` : "立即广播全员", "…"]
							}),
							immediateConfirm && (0, react_jsx_runtime.jsxs)("div", {
								role: "alertdialog",
								"aria-label": "确认立即唤醒",
								children: [
									(0, react_jsx_runtime.jsxs)("p", { children: [
										"将立即发送给",
										target?.label ?? `${meeting.memberSessionIds.length} 位成员`,
										"。原窗口可能开始工作并消耗 Token。"
									] }),
									(0, react_jsx_runtime.jsx)("button", {
										style: buttonBase,
										disabled: sending,
										onClick: () => {
											setImmediateConfirm(false);
											if (target) dispatch();
											else broadcast();
										},
										children: "确认立即发送"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										style: buttonBase,
										onClick: () => setImmediateConfirm(false),
										children: "取消"
									})
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/client/index.js
		/** slots 注册按钮；sessions 解析参会窗口的 SessionFace（scope/sessionOf/prompt）。 */
		const inject = [
			"slots",
			"sessions",
			"remote",
			"remote.session",
			"remote.workspace",
			"remote.agentPresets",
			"workspaces",
			"uiWorkspace"
		];
		/** 圆桌图标：圆桌+三椅，inline SVG 避免依赖图标库。 */
		function RoundTableIcon() {
			return (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "8",
						cy: "8",
						r: "3.25",
						stroke: "currentColor",
						strokeWidth: "1.5"
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "8",
						cy: "1.75",
						r: "1",
						fill: "currentColor"
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "2.6",
						cy: "11.4",
						r: "1",
						fill: "currentColor"
					}),
					(0, react_jsx_runtime.jsx)("circle", {
						cx: "13.4",
						cy: "11.4",
						r: "1",
						fill: "currentColor"
					})
				]
			});
		}
		/**
		* 侧边栏底部动作条目（sidebar.footer.action 是 list slot，owner 只给列宽状态；
		* useSessions/useWorkspaces 是框架给全局（root scope）slot 组件的标准 props）。
		* 点击开合右侧抽屉；抽屉是 fixed 元素且不渲染任何遮罩层，
		* 因此面板外区域天然保持可交互（无 pointer-events 陷阱）。
		*/
		function RoundTableEntry({ wide, useSessions, useWorkspaces, rtCtx, connection, profileName }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [expanded, setExpanded] = (0, react.useState)(false), [attention, setAttention] = (0, react.useState)(0);
			const [badge, setBadge] = (0, react.useState)({
				review: 0,
				fault: 0,
				running: 0
			});
			const persistence = useLocalPersistence();
			const [draftGeneration, setDraftGeneration] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				let alive = true;
				const tick = () => {
					fetch("/plugins/round-table/meetings?view=summary").then((r) => r.json()).then((v) => {
						if (alive) {
							const meetings = (v.meetings ?? []).filter((m) => !m.archivedAt);
							setAttention(meetings.reduce((n, m) => n + (m.counts?.attention ?? 0), 0));
							setBadge(meetings.reduce((n, m) => ({
								review: n.review + (m.counts?.awaitingReview ?? 0),
								fault: n.fault + (m.counts?.faults ?? 0),
								running: n.running + (m.counts?.running ?? 0)
							}), {
								review: 0,
								fault: 0,
								running: 0
							}));
						}
					}).catch(() => {});
				};
				tick();
				const timer = setInterval(tick, 15e3);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, []);
			const [panelWidth, setPanelWidth] = (0, react.useState)(380);
			const entry = (0, react.useRef)(null);
			const panel = (0, react.useRef)(null), [fileHint, setFileHint] = (0, react.useState)("");
			const [panelLayer, setPanelLayer] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const node = panel.current;
				if (!open || !node) return;
				const hint = (event) => setFileHint(String(event.detail ?? ""));
				node.addEventListener("round-table-file-hint", hint);
				const dispose = installPanelFileDrop(node);
				return () => {
					dispose();
					node.removeEventListener("round-table-file-hint", hint);
					setFileHint("");
				};
			}, [open, panelLayer]);
			const currentPanelLayer = () => dockColumns(entry.current)?.frame.querySelector(":scope > [data-shell-overlay]") ?? null;
			const mountPanel = (node) => panelLayer ? (0, react_dom.createPortal)(node, panelLayer) : node;
			const [workbenchLeft, setWorkbenchLeft] = (0, react.useState)(0);
			const [dock, setDock] = (0, react.useState)(() => dockGeometry(null, 380, window.innerWidth));
			const measureWorkbench = () => {
				setWorkbenchLeft(expandedPanelLeft(sidebarColumn(entry.current), window.innerWidth));
				const next = dockGeometry(entry.current, panelWidth, window.innerWidth);
				setDock((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
			};
			(0, react.useEffect)(() => {
				if (!open) return;
				const columns = dockColumns(entry.current);
				if (columns?.frame.querySelector) setPanelLayer(currentPanelLayer());
				measureWorkbench();
				const resize = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(() => measureWorkbench());
				if (columns) {
					for (const column of [
						columns.sidebar,
						columns.frame,
						columns.right
					]) if (column) resize?.observe(column);
				}
				window.addEventListener("resize", measureWorkbench);
				return () => {
					resize?.disconnect();
					window.removeEventListener("resize", measureWorkbench);
				};
			}, [
				open,
				wide,
				panelWidth
			]);
			(0, react.useEffect)(() => {
				if (open && !expanded && dock.supported) return reserveHostDock(entry.current, dock.width);
			}, [
				open,
				expanded,
				dock.width,
				dock.supported
			]);
			const drag = (0, react.useRef)();
			const [dragging, setDragging] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				const resize = () => setPanelWidth((width) => clampPanelWidth(width, window.innerWidth));
				window.addEventListener("resize", resize);
				return () => window.removeEventListener("resize", resize);
			}, []);
			const endDrag = () => {
				drag.current = void 0;
				setDragging(false);
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: entry,
				"data-round-table-entry": "",
				style: wide ? {
					display: "flex",
					alignItems: "center",
					alignSelf: "flex-start",
					width: "fit-content",
					height: 49,
					marginTop: 8,
					position: "relative",
					flex: "none"
				} : {
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: 36,
					height: 36,
					position: "relative",
					flex: "none"
				},
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					"aria-label": "圆桌",
					"aria-expanded": open,
					onClick: () => {
						if (open) setOpen(false);
						else {
							if (dockColumns(entry.current)?.frame.querySelector) setPanelLayer(currentPanelLayer());
							setPanelWidth(380);
							setExpanded(false);
							setDock(dockGeometry(entry.current, 380, window.innerWidth));
							setOpen(true);
						}
					},
					style: {
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						gap: wide ? 8 : 0,
						width: wide ? "fit-content" : 36,
						height: wide ? 49 : 36,
						padding: wide ? "0 10px 0 8px" : 0,
						border: "none",
						borderRadius: wide ? 12 : "50%",
						background: open ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
						color: "var(--dsw-alias-label-primary)",
						fontFamily: "inherit",
						fontSize: 14,
						cursor: "pointer",
						overflow: "hidden"
					},
					children: [
						(0, react_jsx_runtime.jsx)(RoundTableIcon, {}),
						attention > 0 && (0, react_jsx_runtime.jsx)("span", {
							"aria-label": `${badge.review}项待验收，${badge.fault}项需核实或故障，${badge.running}项执行中`,
							title: `${badge.review}项待验收 · ${badge.fault}项需核实／故障 · ${badge.running}项执行中`,
							style: {
								fontSize: 11,
								borderRadius: 8,
								padding: "0 4px",
								background: "var(--dsw-alias-interactive-bg-hover)"
							},
							children: wide ? [badge.review ? badge.review + " 待验收" : "", badge.fault ? badge.fault + " 需核实／故障" : ""].filter(Boolean).join(" · ") || attention + " 待处理" : attention
						}),
						wide && (0, react_jsx_runtime.jsx)("span", {
							style: {
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis"
							},
							children: "圆桌"
						})
					]
				}), open && mountPanel((0, react_jsx_runtime.jsxs)("section", {
					ref: panel,
					"data-round-table-panel": "",
					"data-round-table-expanded": expanded ? "true" : "false",
					"aria-label": "圆桌",
					style: {
						position: "fixed",
						top: window.location.protocol === "dsh-app:" ? 40 : 0,
						right: expanded ? 0 : dock.right,
						bottom: 0,
						left: expanded ? workbenchLeft : void 0,
						width: expanded ? `calc(100% - ${workbenchLeft}px)` : dock.width,
						boxSizing: "border-box",
						userSelect: dragging ? "none" : void 0,
						maxWidth: expanded ? void 0 : "calc(100vw - 24px)",
						zIndex: 40,
						display: "flex",
						flexDirection: "column",
						pointerEvents: "auto",
						background: "var(--dsw-alias-bg-base)",
						borderLeft: "1px solid var(--dsw-alias-border-l1)",
						boxShadow: "var(--dsw-shadow-lv2)"
					},
					children: [
						!expanded && (0, react_jsx_runtime.jsx)("div", {
							role: "separator",
							"aria-label": "调整圆桌侧栏宽度",
							"aria-orientation": "vertical",
							tabIndex: 0,
							"aria-valuemin": Math.min(320, dock.available / 2),
							"aria-valuemax": dockWidth(1100, dock.available),
							"aria-valuenow": Math.round(dock.width),
							title: "拖动调整宽度；左右方向键调整；双击恢复默认",
							"data-round-table-resize": "",
							style: {
								position: "absolute",
								left: -4,
								top: 0,
								bottom: 0,
								width: 9,
								cursor: "col-resize",
								touchAction: "none",
								zIndex: 1,
								background: dragging ? "var(--dsw-alias-border-l1)" : "transparent"
							},
							onPointerDown: (event) => {
								if (event.button !== 0) return;
								event.preventDefault();
								drag.current = {
									x: event.clientX,
									width: dock.width,
									pointerId: event.pointerId
								};
								event.currentTarget.setPointerCapture(event.pointerId);
								setDragging(true);
							},
							onPointerMove: (event) => {
								const start = drag.current;
								if (start && start.pointerId === event.pointerId) setPanelWidth(draggedPanelWidth(start.width, start.x, event.clientX, window.innerWidth));
							},
							onPointerUp: (event) => {
								if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
								endDrag();
							},
							onPointerCancel: endDrag,
							onLostPointerCapture: endDrag,
							onDoubleClick: () => setPanelWidth(clampPanelWidth(380, window.innerWidth)),
							onKeyDown: (event) => {
								if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
									event.preventDefault();
									setPanelWidth((width) => clampPanelWidth(width + (event.key === "ArrowLeft" ? 24 : -24), window.innerWidth));
								} else if (event.key === "Home") {
									event.preventDefault();
									setPanelWidth(clampPanelWidth(380, window.innerWidth));
								}
							}
						}),
						(0, react_jsx_runtime.jsxs)("header", {
							style: {
								flex: "none",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								minHeight: 44,
								padding: "10px 12px",
								boxSizing: "border-box",
								borderBottom: "1px solid var(--dsw-alias-border-l2)"
							},
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									style: {
										color: "var(--dsw-alias-label-primary)",
										fontSize: 13,
										fontWeight: 500,
										lineHeight: "20px"
									},
									children: "圆桌会议"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": expanded ? "收回侧栏" : "展开会议工作台",
									onClick: () => {
										measureWorkbench();
										endDrag();
										setExpanded((v) => !v);
									},
									style: {
										font: "inherit",
										background: "transparent",
										border: "none",
										color: "inherit",
										cursor: "pointer"
									},
									children: expanded ? "收回侧栏" : "打开完整工作台"
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": "关闭圆桌面板",
									onClick: () => {
										setOpen(false);
									},
									style: {
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										width: 24,
										height: 24,
										border: "none",
										borderRadius: 6,
										background: "transparent",
										color: "var(--dsw-alias-label-secondary)",
										fontSize: 14,
										lineHeight: 1,
										cursor: "pointer"
									},
									children: "✕"
								})
							]
						}),
						fileHint && (0, react_jsx_runtime.jsx)("div", {
							role: "status",
							"data-file-drop-hint": "",
							style: {
								position: "absolute",
								top: 48,
								left: 12,
								right: 12,
								zIndex: 2300,
								padding: "6px 12px",
								borderRadius: 8,
								fontSize: 12,
								background: "var(--dsw-alias-bg-base)",
								border: "1px dashed #2876dc",
								pointerEvents: "none"
							},
							children: fileHint
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							style: {
								flex: 1,
								minHeight: 0,
								minWidth: 0,
								overflow: "hidden",
								display: "flex",
								flexDirection: "column",
								padding: "12px"
							},
							children: [
								!expanded && !dock.supported && (0, react_jsx_runtime.jsx)("p", {
									role: "alert",
									children: "当前宿主布局尚未就绪，无法分配并排空间。请重新打开圆桌或使用完整工作台。"
								}),
								!persistence.available && (0, react_jsx_runtime.jsxs)("p", {
									role: "alert",
									style: {
										fontSize: 12,
										margin: "0 0 8px"
									},
									children: [persistence.reason, "。草稿和待核实请求仅本次窗口有效，关闭前请复制或导出；不要关闭后重新发送未确认的请求。"]
								}),
								(0, react_jsx_runtime.jsx)(MeetingPanel, {
									rtCtx,
									useSessions,
									useWorkspaces,
									connection
								}, draftGeneration)
							]
						})
					]
				}))]
			});
		}
		/** Mount draft readers only after the authenticated host identifies its profile. */
		function ScopedEntry(props) {
			const [scope, setScope] = (0, react.useState)(), [error, setError] = (0, react.useState)(""), [retry, setRetry] = (0, react.useState)(0), [show, setShow] = (0, react.useState)(false);
			const [profile, setProfile] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				let alive = true, inFlight = false, identified;
				configureLocalScope(void 0);
				setScope(void 0);
				setError("");
				const identify = async () => {
					if (inFlight) return;
					inFlight = true;
					try {
						const r = await fetch("/plugins/round-table/local-scope"), data = await r.json();
						if (!r.ok || typeof data.scope !== "string") throw Error(data.error ?? "无法识别当前 DSH 实例");
						if (alive && identified !== data.scope) {
							identified = data.scope;
							configureLocalScope(data.scope);
							setProfile(data.profileName ?? "");
							setScope(data.scope);
							setError("");
						}
					} catch (e) {
						if (alive && !identified) setError(String(e instanceof Error ? e.message : e));
					} finally {
						inFlight = false;
					}
				};
				identify();
				const timer = setInterval(() => {
					identify();
				}, 5e3);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, [retry, props.rtCtx.remote.$host.home]);
			if (scope) return (0, react_jsx_runtime.jsx)(RoundTableEntry, {
				...props,
				profileName: profile
			}, scope);
			return (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("button", {
				"aria-label": "圆桌",
				onClick: () => setShow((v) => !v),
				style: { font: "inherit" },
				children: "圆桌"
			}), show && (0, react_jsx_runtime.jsxs)("div", {
				role: error ? "alert" : "status",
				style: {
					position: "fixed",
					right: 12,
					bottom: 20,
					padding: 16,
					background: "var(--dsw-alias-bg-base)",
					border: "1px solid var(--dsw-alias-border-l2)",
					maxWidth: 360,
					zIndex: 40
				},
				children: [
					error || "正在识别当前 DSH 实例…",
					error && (0, react_jsx_runtime.jsx)("button", {
						onClick: () => setRetry((v) => v + 1),
						children: "重新连接"
					}),
					(0, react_jsx_runtime.jsx)("p", { children: "识别前不读取或恢复任何草稿。" })
				]
			})] });
		}
		function apply(ctx) {
			const connection = desktopConnection(ctx.remote);
			const Entry = (props) => (0, react_jsx_runtime.jsx)(ScopedEntry, {
				...props,
				useSessions: (selector) => props.useSessions((state) => {
					return selector({
						...state,
						current: Object.entries(state.byId).find(([, row]) => (row?.retainedBy?.mainView ?? 0) > 0)?.[0]
					});
				}),
				useWorkspaces: (selector) => props.useWorkspaces((state) => {
					return selector({
						...state,
						baselinesReady: state.phase === "ready"
					});
				}),
				rtCtx: ctx,
				connection
			});
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "round-table",
				order: 100,
				label: "圆桌"
			}, Entry));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map