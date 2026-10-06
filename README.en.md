# dsh-round-table

[中文](README.md) | **English**

A round-table meeting plugin for DeepSeek Harness. Bring existing Agent sessions into a shared discussion, select evidence, arrange work, review results, and ask a dedicated secretary to draft minutes. Members keep their original sessions and context. You can also create knights from host-declared Agent presets; dsh-flat-teams is not required.

## Installation

Round Table **0.1.18** targets the official Windows **DeepSeek Harness 0.2.0-rc.2** desktop profile. It passed 124 regression suites, 225 browser checks and native desktop acceptance. Legacy Web rc.6 is not supported by this release. Confirmed secretary deletion validates all supported log generations owned by that secretary, preventing old upgrade artifacts from bringing it back.

`dsh-round-table@0.1.18` is published on [npm](https://www.npmjs.com/package/dsh-round-table). Use the desktop installation below, or download the `.tgz` from [v0.1.18 Release](https://github.com/whateverboy2333/dsh-round-table/releases/tag/v0.1.18) and install from a local `file:` URL. Run only one host per DSH_HOME. Rollback requires the complete pre-upgrade data backup because newer session formats may not load in an old host.

The desktop release requires **4.0.4** for `@deepseek-ai/cordis`, **3.18.4** for `@deepseek-ai/schemastery`, and **0.2.0-rc.2** for the related `@deepseek-ai/dsh-*` components. It rejects unknown runtime versions. Recheck compatibility when upgrading DSH.

Use the desktop **Plugins** page to add `dsh-round-table@0.1.18` and check the target is **desktop**. A local archive such as `file:C:/Downloads/dsh-round-table-0.1.18.tgz` remains available as an alternative. After installation, choose **Quit** from the application menu or tray and reopen DeepSeek Harness. Closing a window may leave the app running in the tray. Open Round table and check the version and existing meetings.

For a command-line installation, completely quit the desktop app first and use its bundled CLI. A bare `dsh` on PATH may belong to Hermes or a legacy Web installation. These commands use the default Windows install directory; adjust it if your installation is elsewhere:

```powershell
$desktopCli = Join-Path $env:LOCALAPPDATA 'Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd'
& $desktopCli --version   # This release requires 0.2.0-rc.2
& $desktopCli plugin --profile desktop add 'dsh-round-table@0.1.18'
# Reopen DeepSeek Harness desktop; do not launch a web profile.
```

The repository root is the plugin source. The internal workspace uses `plugins/dsh-round-table-desktop`; this public repository contains source, built artifacts and build/package-check support scripts, while internal acceptance scripts and business data remain private. Build using the npm lockfile and install through the desktop GUI.

```powershell
cd C:/path/to/dsh-round-table
npm ci
npm run typecheck
npm run build
npm run verify
npm pack
```
Runtime requires Node.js **^22.19.0 or >=24.0.0**; the acceptance baseline used desktop Node 24.18.1 and build/regression Node 22.23.1. For source development on Node 24, use 24.11.0 or newer to satisfy the locked build dependencies. The public `npm run verify` checks types and package contents. The reported 124 regression suites and 225 browser checks ran in an isolated development workspace without sending requests to original meetings or invoking real models.

## Start a meeting

1. Open Round table. Enter a title, goal and background, and select the default workspace. Invite existing sessions or create knights from official presets, each with its own workspace. Creation sends member briefings and members may respond. You can explicitly confirm an empty meeting and invite members later.
2. Each meeting creates a dedicated secretary in its default workspace. The secretary does not join ordinary discussion, receive member tasks, or have a chat entry in the panel. If initialization fails, retry in the same meeting.
3. Write in Discussion. With no selected recipients, Record to meeting only saves a record. Type `@` and select from the menu; review text, quotations and attachments before sending. Sending defaults to an ordinary discussion message: it creates no work task, requires no claim or formal result, and consumes no workflow task-attempt budget. A literal `@name` in prose does not select a recipient or execute anything.
4. Check each member's message receipt. Ordinary messages enter the original session through its FIFO interface without interrupting current work. Members can return multiple explicitly authorized updates through `meeting_reply_message`; ordinary replies do not become formal results or import unrelated private history. For formal work, ask the selected original members to generate task cards, review them, and confirm publication. Ordinary replies and marking a conclusion do not wake other members; usable formal results may satisfy already authorized, checked downstream automatic rules.
5. Open Minutes, select Full or Since last, and generate a draft. Check sources, the structured task snapshot and the prose before publishing to the meeting, notifying members or exporting. Publication only adds a record; notifications send content to members' original sessions. You can keep a draft indefinitely.

Discussion keeps the main reading space, with a compact meeting header and separate navigation and discussion tools. Members open in a right sidebar on the current page: roster → details → meeting work log. Wide layouts show both areas; narrow layouts use a closable overlay. Opening it preserves discussion scroll, search and unsent text. Materials, Minutes and Settings retain their own entries; Task cards opens full card text, version history and publication controls. The meeting list supports search, persistent pins, outstanding-item indicators and archives.

The list separates historical results awaiting review, faults requiring verification, and running work, with status filters. The meeting header links to the next action. After a completed run, the editable process is labelled as the next-round draft. Minutes show the summary, decisions, responsibilities and next steps first; generation information and evidence can be expanded, preserving historical prose.

Preset member batches retain each session identity and its creation progress. A retry resumes incomplete stages without recreating successful members or briefing them again. Member failures after meeting creation resume that same meeting. A lost creation response can be recovered by retrying the original request, which returns the same meeting. Legacy progress without a request identity still requires checking the list first.

## Prepare tasks, request changes and review

Select original members with @ in Discussion, then choose Generate task cards. Extra text may be empty. Only explicitly selected quotations and materials are sent. Each member returns independent, detailed Markdown cards, one per item; retries target only the failed member's original request.

View the full text, generator, assignee and versions in Task cards. Edit directly or ask that card's original generator to adjust it. Late suggestions never overwrite live user edits. Save edits, confirm assignees and select the cards to publish. **Confirming publication immediately notifies the chosen assignees to execute**, after the approved immutable versions are written to the meeting directory. Generation, editing and adoption do not execute work. Lost publication responses retain the same approved request and versions for recovery; a fresh ID cannot republish the same card version.

New meetings get a stable title-plus-ID directory in the selected workspace, with instructions, an index, materials, task cards, results and minutes. Read-only member tools work across workspaces and verify exact approved versions. The tool-disabled secretary receives actual verified filesystem snapshots. Missing or modified files and invalid indexes stop affected work; file names alone are not evidence of their contents. Older meetings require explicit directory adoption, which copies history without executing old work. Archiving or deleting a meeting preserves user files.

Drafts and pending requests are scoped to the current DSH instance. The manual task editor and template entry have been replaced. Historical requirements, results and logs remain available, and previously authorized uncertain requests can be verified using their original identities. Old drafts can be previewed or copied without guessing ownership.

Choose Import member replies directly in the discussion toolbar. Select a source member to explicitly read actual assistant replies, then preview and confirm the purpose: Add to meeting creates a meeting record; Fill task result applies only to the selected outstanding task. Source author, original reply sequence, time and digest validation remain recorded. Cancelling changes nothing; importing does not notify other members or automatically publish private history. Members can also explicitly submit formal results through tools.

An in-progress task can still receive ordinary clarification or supplementary messages. `contextTaskId` only links the existing task; it does not create another task, rewrite frozen requirements or block questions while a formal result is pending. The member sidebar work log gathers this meeting’s requirements, selected materials, deliveries, replies, formal results, linked revisions and review history. Former members keep their history; the log does not automatically read other private conversations.

Request changes uses one recoverable notes draft, available from the member work log and Process. Confirmation sends a linked revision to the original member; the old result remains and the outstanding item follows the newest revision. Explicitly rejected sends preserve notes and allow a new preview; uncertain delivery needs verification of the original request. Submission and human acceptance are separate states. Legacy review gates and returned/revised results remain enforced; new free steps have no review-template preset, and usable formal results may satisfy already authorized automatic stages; frozen historical inputs remain intact.

## Arrange the process

The progress toolbar separates the viewed record, display mode, saved configuration and current run. Saving only records the arrangement; starting still requires a preview and confirmation. Continuing a paused manual run resumes already authorized work and ignores unsaved changes. Stop and complete remain under Run operations; history is visibly read-only. Arrange diagram is available beside graph tools and does not execute work.

New step lists start empty. Add a step, edit its title directly, and select a real meeting member in every row. Reuse an Agent across steps. Any stage can expand into independent parallel steps; all formal branch results are required before the next stage. Each card header permanently exposes Delete, including when collapsed. Delete individual branches to shrink a parallel group to one ordinary step, or delete the last step to return to an empty list. Deletion edits the draft; Save updates the meeting configuration. Insert, reorder and delete stages without predefined review, decision, secretary or rework structures.

1. Select members and expand a step to enter requirements and materials. Incomplete drafts can be saved; starting requires valid names, members, a preview and confirmation. Saving does not execute work.
2. Each step has one Automatically receive upstream inputs and run option, off by default. Save, preview and confirm the run first. Selected steps receive formal upstream inputs when ready; unselected steps need manual preview and confirmation. Formal submissions can flow through ordinary new stages while configured review, routing and human confirmation gates still stop. Unreviewed results are never marked accepted automatically. Failures, uncertain delivery, unavailable members, execution budgets and automatic round caps stop progression. Saving future rules pauses the run and requires explicit resumption; restart never resumes automatically. Generated drafts and ordinary replies are not approved cards or formal results.
3. Existing graph definitions and run history remain intact. The list shows their actual nodes read-only with a link to the original graph editor. After ending an active run, explicitly prepare an empty step draft; it only replaces the saved configuration when saved. New steps' graph is a read-only dependency view. Active topology and started fields are frozen, while future field changes retain confirmation and pause/resume rules.

Defaults are two attempts per stage per round, 30 ordinary delivery reservations per run, and five secretary starts. Explicit grants increase cumulative budgets without starting work or resetting usage. Transport retries and temporary requests also consume these budgets. **Execution counts and character estimates are not token or monetary caps**; a member task can involve multiple model and tool calls.

Add materials from the specific Process node; staging inputs pauses an automatic run for review and explicit resumption. Binding an already published card and starting a node is new authorization and can execute it again; check its existing tasks. Temporary requests do not complete planned stages. Continue with existing results explicitly omits missing branches; skip processing and reuse input retains the omission notice. Neither treats skipped work as success.

Each opening starts from a 380px drawer and makes the original Agent page reflow beside it. Dragging adjusts this opening only; closing and reopening resets the size while keeping meeting selection and drafts. The full workbench fills the area to the right of the session sidebar. Closing or unloading releases the original page space.

## Materials and minutes

Materials lists every successfully uploaded document, image and version in this meeting. Uploading archives the original independently of sending or removing its draft reference. Different names retain separate entries even when their bytes match; exact retries reuse the original record. Retrying the original meeting creation request after its workspace becomes available also fills in previously uploaded materials. Existing meetings still require explicit confirmation to adopt a folder.

Ordinary files, including archives, retain complete originals and references up to 256 MB through 512 KB chunks and SHA verification. They are not extracted, parsed or embedded as binary model input. Images and small text keep their existing input protocol. Network failures resume the same upload identity; permanent validation failures do not offer futile retries. Removing a reference keeps the original; preview checks metadata and offers a complete download.

Draft references use native-style 64px rounded thumbnails with hover/focus removal and blue document names in the same input frame. Remove with the small cross or Delete/Backspace on a focused reference; Backspace at the start of prose can retract the last attachment. Archived originals remain. Inherited sources retain confirmation, ordinary editing and IME do not accidentally remove files, and images open in place.

Drag images or documents directly into the Round table discussion. There is no add-file button. File drags inside this pane belong only to the plugin; entering resets the host drag overlay, while targets outside remain handled by the original Agent. Read-only, pending, modal and other-page drops are rejected without falling through to the host. OS file paths are not inserted into prose. Format and size limits remain; loading archives and stages files without sending or waking anyone.

Agent read tools are limited to authentic, unarchived members, the verified creator of that meeting or its dedicated secretary. Ordinary members cannot join unfamiliar meetings or invite others through tools. A verified Agent creator can invite; legacy meetings never infer an owner, and the host user interface remains the management entry. Member briefings approve the role and instructions before FIFO delivery with a stable message identity. Uncertain delivery only reconciles persisted receipts rather than blindly sending again.

- The discussion composer accepts direct file drag-and-drop and pasted images, with thumbnails, file previews, removal and per-file retry. Upload archives only and never wakes members. Text and images commit in one message. Incomplete or failed uploads block sending while preserving the draft. Attachment-only sends still require an explicit action.
- Materials accept UTF-8 text, Markdown, code, diff/patch and PNG/JPEG/WebP. Images and directly parsed text are limited to 2 MB; ordinary references are limited to 256 MB and text to 100,000 characters. Changed same-name files retain versions and SHA-256; delivery uses the selected version. PDF/Office originals can be retained as file references; provide separate text when model reading is required.
- Image delivery requires a model adapter that advertises image input. The current DeepSeek adapter does not, so delivery is rejected in advance. Removing an attachment carried by a message can also remove its text quotation; the panel explains the effect and asks for confirmation.
- Minutes default to published meeting evidence, including ordinary questions and replies; ordinary replies do not count as completed tasks. Reading original-session replies requires explicit confirmation in Settings and uses membership intervals. Shared sessions may still contain other work, so attribution needs judgment. Workflow secretary stages use their frozen selected materials.
- The system provides task counts, members, submission and review states, and warns about detectable prose conflicts. **It does not certify all generated content**: suggestions, decisions, omissions and ambiguous counts still need review. If you explicitly acknowledge known conflicts, publication, notifications and export retain their notices.
- Incremental minutes use the last successful generation, whether shared or not. The first incremental request falls back to full. Cancellation or failure does not advance cursors; source changes keep separate baselines, and failed sources retain old cursors for a later retry.
- Long text is processed in parts, without a last-N cutoff. Partial source failures are reported; all-source failure fails generation. Empty meetings return an empty-content result without a model call. Generation uses the default model, a 6,000-token output budget per child call, input parts of about 16,000 characters and at most 128 child calls. Budget exhaustion fails explicitly rather than saving falsely complete minutes. These limits are not a meeting-wide monetary cap.

## Delivery and recovery

| State | Meaning and next action |
|---|---|
| `queued` | Authorized; waiting for an idle original session or an earlier task to finish |
| `offline` | Not delivered; original-session restoration failed or needs verification. Inspect the reason and retry restoration in the member sidebar |
| `delivering` | Sending and checking the host's persisted record |
| `delivered` | Delivery confirmed; waiting for a formal result. It does not mean read or complete |
| `uncertain` | Delivery cannot be proved. Check the original session; an explicitly authorized retry may duplicate work |
| `in_progress` | Claimed by the member |
| `completed` / `failed` / `cancelled` | Result submitted, failed, or meeting wait ended; acceptance is a separate state |

The table describes formal work tasks. Ordinary messages have separate receipt states: delivered confirms receipt in the original session without requiring a formal result. Verify uncertain delivery against the original message; unproved delivery is not blindly resent.

After execution is confirmed, the plugin checks authoritative host session and workspace information. An unloaded member is restored through the host entry point using the same session ID, original context, workspace and Agent preset; manually opening its window first is unnecessary. Archived or deleted sessions are not automatically restored or replaced. Read failures remain unknown rather than being treated as deletion. Busy sessions keep work queued. The member sidebar shows restoration progress, failure reasons and retry controls. Removing a member lists affected tasks and workflow nodes for confirmation, then ends unfinished meeting waits while preserving history; missing members do not count as completed. New knights still require verified workspace membership before joining.

Pausing the release queue blocks new releases, retries and queued delivery. Resuming continues previously authorized work. Pausing, ending waits, leaving a meeting and stopping a flow do not stop ordinary member sessions. Immediate broadcast/dispatch in Settings is a separate wake-up action requiring its own confirmation. After restart, flows pause and interrupted minutes jobs fail with manual retry available.

## Archiving, deletion and limits

Archiving keeps materials and ordinary sessions, ends outstanding meeting waits and flows, and cancels minutes generation. Restoring keeps delivery paused and does not reopen ended tasks. Bulk archiving shows a confirmation list, individual receipts and retries for failed items.

Permanent deletion needs a second confirmation, with an optional member notice. It removes meeting state and the dedicated secretary's main session log, while keeping ordinary member sessions. In-flight minutes are cancelled and admitted writes drain first. Failed deletion retains progress for retry. **There is no recycle bin.** Secretary log deletion supports the host JSONL backend; if another entry owns the secretary handle, restart the profile and retry. Historical one-shot child logs are not additionally purged.

- Members must run in the same DSH process. **Run only one round-table queue host per DSH_HOME.** Different profile names do not isolate sessions, meetings or storage by default. Development validation needs a separate DSH_HOME.
- Cross-machine collaboration and scheduled minutes are not supported. No cross-process exactly-once guarantee is made. Retrying uncertain delivery can duplicate work. Without a formal result, the meeting keeps waiting rather than inferring completion from private replies.
- Input selection controls evidence actively sent this round; original session context remains. Meeting file tools grant read-only access to approved versions for this meeting, never arbitrary paths. They do not isolate a member's existing context or other file permissions.
- The native sidebar may still show the secretary. Its tool restrictions apply while the plugin runs and do not remain an access-control policy after uninstalling it.
- Scenario managers may disable third-party plugins absent from the current scenario. If the entry disappears, check the active profile/scenario's plugin state.


In discussion text, Enter invokes the current send/record action and Ctrl/Cmd+Enter inserts a newline at the caret or selection. Shift+Enter also inserts a newline; IME selection, @ selection and disabled states never submit accidentally.

Existing runs keep their frozen rules. Original per-node graphs remain compatible with schema 2; users explicitly prepare new free-step plans, saved under schema 3 and read-only to older plugins. Original definitions remain in version history. This release supports schemas 1/2/3 and treats unknown schema 4+ as read-only.

## Agent handoff and current documentation

Read [CLAUDE](CLAUDE.md), [PRD](docs/PRD.md), [ENGINEERING](docs/ENGINEERING.md) and [API](docs/产品实现速查.md). Codex can load root AGENTS.md automatically. Main carries current maintenance documentation; the v0.1.18 tag and archives remain unchanged. Internal acceptance evidence is not distributed here, and public verify covers types/package checks only.

## Developer reference

Build artifacts are in `lib/`; the build cleans obsolete output. Before release, run the full verification and inspect the actual installation package. A local build is not a published release.

The [bilingual tools and HTTP API reference](docs/产品实现速查.md) lists Agent tools, management routes, parameters and state boundaries. Management HTTP endpoints serve the host's user panel and are not exposed as member tools for independently scheduling workflows.


The graph fits its available width and height. Ctrl+wheel zooms around the pointer inside the canvas; ordinary wheel scrolling remains available. Manual zoom survives layout changes until Fit canvas is selected. The member picker uses a chat-level floating layer and never sends while searching or selecting.

Member recovery uses the official existing-session-only API. A durable original identity binding prevents deletion races, retries or restarts from accepting a replacement context. Include DSH_HOME/round-table-member-identities in upgrade backups. Successful ordinary legacy-draft recovery closes only its processed reminder; original records and Settings access remain, while failures and uncertain sends keep accurate notices.

MIT © whateverboy2333
