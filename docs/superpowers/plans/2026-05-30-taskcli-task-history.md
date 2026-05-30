# TaskCli Task History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source-agnostic, task-centric development history to TaskCli with JSONL sidecar storage, CLI append/list commands, automatic status-change events, and a read-only HTML task timeline view.

**Architecture:** Keep task markdown unchanged and add `.taskcli/history/<task-id>.jsonl` as an append-only sidecar per task. Implement history as a small parallel vertical slice: model types, storage helpers, command functions, read-only HTML renderer/server, CLI dispatch, docs, and tests. Status changes integrate at `runUpdate` so `done` inherits the same behavior.

**Tech Stack:** Bun, TypeScript ESM, `bun:test`, Bun.serve, existing TaskCli storage helpers (`atomicWrite`, `ensureDir`, `requireRoot`, `readTask`).

---

## File Structure

- Create `src/storage/history.ts`
  - Owns history path resolution, JSONL read/append, event ID allocation, and event creation validation.
  - Depends on `historyDir(root)` from `src/storage/paths.ts`, `ensureDir` from `src/storage/io.ts`, and `TaskHistoryEvent` types.
- Create `src/commands/history.ts`
  - Owns CLI-level behavior for `history add` and `history list`.
  - Verifies the task exists via `readTask(root, taskId)` before reading or appending history.
- Create `src/history/page.ts`
  - Renders safe, read-only HTML for one task plus its timeline.
  - Escapes all user-controlled strings and uses `white-space: pre-wrap` for task/history bodies.
- Create `src/history/server.ts`
  - Starts a read-only Bun.serve server for `history view`.
  - Serves only `GET /`; every other route is 404.
- Create tests:
  - `test/storage/history.test.ts`
  - `test/commands/history.test.ts`
  - `test/history/page.test.ts`
  - `test/history/server.test.ts`
- Modify `src/model/types.ts`
  - Add history event type constants, interface, type parser, and event parser.
- Modify `src/storage/paths.ts`
  - Add `historyDir(root)`.
- Modify `src/commands/tasks.ts`
  - Append `status_change` events only when the status actually changes.
- Modify `src/cli.ts`
  - Add `history add/list/view` parsing and usage text.
- Modify docs:
  - `README.md`
  - `CHANGELOG.md`
  - Add `docs/releases/v0.3.0-task-history.md` or update the current unreleased notes if the repo has an active v0.3 section by the time implementation starts.

## Cross-Cutting Conventions

- Use exact history event type strings: `note`, `decision`, `status_change`, `verification`, `source`.
- User-facing manual `history add` accepts only: `note`, `decision`, `verification`, `source`.
- `status_change` is system-created by `runUpdate` / `runDone`.
- Treat `body` as Markdown-capable text in storage, but render it as escaped plain text in HTML.
- Do not add runtime dependencies.
- Commit after each task using the repository Lore commit protocol.

---

### Task 1: Model and Storage Foundation

**Files:**
- Modify: `src/model/types.ts`
- Modify: `src/storage/paths.ts`
- Create: `src/storage/history.ts`
- Test: `test/storage/history.test.ts`

- [ ] **Step 1: Write failing storage/model tests**

Create `test/storage/history.test.ts` with these tests:

```ts
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import {
  appendHistoryEvent,
  historyPath,
  listHistoryEvents,
  nextHistoryEventId,
} from "../../src/storage/history";
import { parseHistoryEvent, parseHistoryEventType } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "hist-store-"));
  runInit(root);
  return root;
}

test("historyPath stores per-task JSONL under .taskcli/history", () => {
  const root = setup();
  expect(historyPath(root, "T-001")).toBe(join(root, ".taskcli", "history", "T-001.jsonl"));
});

test("appendHistoryEvent creates JSONL and listHistoryEvents reads in order", () => {
  const root = setup();
  appendHistoryEvent(root, {
    id: "E-001",
    task_id: "T-001",
    type: "note",
    created: "2026-05-30T10:00:00+08:00",
    body: "first",
  });
  appendHistoryEvent(root, {
    id: "E-002",
    task_id: "T-001",
    type: "decision",
    created: "2026-05-30T10:05:00+08:00",
    title: "Use JSONL",
    body: "second",
    meta: { format: "jsonl" },
  });

  const events = listHistoryEvents(root, "T-001");
  expect(events.map((e) => e.id)).toEqual(["E-001", "E-002"]);
  expect(events[1]!.meta).toEqual({ format: "jsonl" });
  expect(readFileSync(historyPath(root, "T-001"), "utf8").trim().split("\n")).toHaveLength(2);
});

test("listHistoryEvents returns empty array when history file is absent", () => {
  const root = setup();
  expect(listHistoryEvents(root, "T-404")).toEqual([]);
});

test("nextHistoryEventId increments inside a single task history", () => {
  expect(nextHistoryEventId([])).toBe("E-001");
  expect(nextHistoryEventId([
    { id: "E-001", task_id: "T-001", type: "note", created: "x", body: "" },
    { id: "E-009", task_id: "T-001", type: "source", created: "x", body: "" },
  ])).toBe("E-010");
});

test("parseHistoryEventType accepts known types and rejects unknown ones", () => {
  expect(parseHistoryEventType("note")).toBe("note");
  expect(parseHistoryEventType("status_change")).toBe("status_change");
  expect(() => parseHistoryEventType("command")).toThrow(/history type/);
});

test("parseHistoryEvent validates shape and optional meta", () => {
  const parsed = parseHistoryEvent({
    id: "E-001",
    task_id: "T-001",
    type: "verification",
    created: "2026-05-30T10:00:00+08:00",
    author: "agent",
    title: "Tests",
    body: "bun test passed",
    meta: { command: "bun test" },
  });
  expect(parsed.type).toBe("verification");
  expect(parsed.meta?.command).toBe("bun test");
  expect(() => parseHistoryEvent({ ...parsed, meta: { bad: 1 } })).toThrow(/meta/);
});

test("listHistoryEvents reports bad JSONL line with file and line number", () => {
  const root = setup();
  writeFileSync(historyPath(root, "T-001"), "{bad json}\n", "utf8");
  expect(() => listHistoryEvents(root, "T-001")).toThrow(/T-001\.jsonl:1/);
});

test("appendHistoryEvent rejects events for a different task path", () => {
  const root = setup();
  expect(() => appendHistoryEvent(root, {
    id: "E-001",
    task_id: "T-002",
    type: "note",
    created: "2026-05-30T10:00:00+08:00",
    body: "wrong file",
  }, "T-001")).toThrow(/task_id/);
  expect(existsSync(historyPath(root, "T-001"))).toBe(false);
});
```

- [ ] **Step 2: Run the new test and verify it fails on missing exports**

Run:

```bash
bun test test/storage/history.test.ts
```

Expected: FAIL with errors mentioning missing `src/storage/history` and missing history exports from `src/model/types`.

- [ ] **Step 3: Add history event model types and parsers**

Append this code to `src/model/types.ts` after the existing helpers:

```ts
export const TASK_HISTORY_EVENT_TYPES = [
  "note",
  "decision",
  "status_change",
  "verification",
  "source",
] as const;
export type TaskHistoryEventType = (typeof TASK_HISTORY_EVENT_TYPES)[number];

export const MANUAL_TASK_HISTORY_EVENT_TYPES = [
  "note",
  "decision",
  "verification",
  "source",
] as const;
export type ManualTaskHistoryEventType = (typeof MANUAL_TASK_HISTORY_EVENT_TYPES)[number];

export interface TaskHistoryEvent {
  id: string;
  task_id: string;
  type: TaskHistoryEventType;
  created: string;
  author?: string;
  title?: string;
  body: string;
  meta?: Record<string, string>;
}

export function parseHistoryEventType(input: unknown): TaskHistoryEventType {
  return parseEnum("history type", input, TASK_HISTORY_EVENT_TYPES);
}

export function parseManualHistoryEventType(input: unknown): ManualTaskHistoryEventType {
  return parseEnum("history type", input, MANUAL_TASK_HISTORY_EVENT_TYPES);
}

function parseOptionalString(field: string, input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input !== "string") throw new Error(`欄位 ${field} 需為字串`);
  return input === "" ? undefined : input;
}

function parseHistoryMeta(input: unknown): Record<string, string> | undefined {
  if (input == null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("欄位 meta 需為物件");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v !== "string") throw new Error(`欄位 meta.${k} 需為字串`);
    out[k] = v;
  }
  return out;
}

export function parseHistoryEvent(input: unknown): TaskHistoryEvent {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    throw new Error("history event 需為物件");
  }
  const obj = input as Record<string, unknown>;
  const id = parseOptionalString("id", obj.id);
  const task_id = parseOptionalString("task_id", obj.task_id);
  const created = parseOptionalString("created", obj.created);
  if (!id || !/^E-\d+$/.test(id)) throw new Error(`欄位 id 不合法：${String(obj.id)}，需為 E-NNN`);
  if (!task_id || !/^T-\d+$/.test(task_id)) throw new Error(`欄位 task_id 不合法：${String(obj.task_id)}，需為 T-NNN`);
  if (!created) throw new Error("欄位 created 需為非空字串");
  const body = obj.body == null ? "" : obj.body;
  if (typeof body !== "string") throw new Error("欄位 body 需為字串");
  return {
    id,
    task_id,
    type: parseHistoryEventType(obj.type),
    created,
    author: parseOptionalString("author", obj.author),
    title: parseOptionalString("title", obj.title),
    body,
    meta: parseHistoryMeta(obj.meta),
  };
}
```

- [ ] **Step 4: Add historyDir path helper**

Modify `src/storage/paths.ts` to include:

```ts
export function historyDir(root: string): string {
  return join(root, ".taskcli", "history");
}
```

Place it near `tasksDir` and `draftsDir`.

- [ ] **Step 5: Implement storage/history.ts**

Create `src/storage/history.ts`:

```ts
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { historyDir } from "./paths";
import { ensureDir } from "./io";
import { parseHistoryEvent, type TaskHistoryEvent } from "../model/types";

export function historyPath(root: string, taskId: string): string {
  return join(historyDir(root), `${taskId}.jsonl`);
}

export function listHistoryEvents(root: string, taskId: string): TaskHistoryEvent[] {
  const p = historyPath(root, taskId);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n");
  const events: TaskHistoryEvent[] = [];
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    try {
      events.push(parseHistoryEvent(JSON.parse(line)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${p}:${idx + 1}: ${msg}`);
    }
  });
  return events;
}

export function nextHistoryEventId(events: TaskHistoryEvent[]): string {
  let max = 0;
  for (const event of events) {
    const m = event.id.match(/^E-(\d+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return `E-${String(max + 1).padStart(3, "0")}`;
}

export function appendHistoryEvent(root: string, event: TaskHistoryEvent, taskId = event.task_id): void {
  const parsed = parseHistoryEvent(event);
  if (parsed.task_id !== taskId) {
    throw new Error(`history event task_id ${parsed.task_id} 與目標 task ${taskId} 不一致`);
  }
  const p = historyPath(root, taskId);
  ensureDir(historyDir(root));
  appendFileSync(p, `${JSON.stringify(parsed)}\n`, "utf8");
}
```

- [ ] **Step 6: Run focused storage tests and verify they pass**

Run:

```bash
bun test test/storage/history.test.ts
```

Expected: PASS all tests in `history.test.ts`.

- [ ] **Step 7: Run model type regression tests**

Run:

```bash
bun test test/model/types.test.ts test/storage/paths.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add src/model/types.ts src/storage/paths.ts src/storage/history.ts test/storage/history.test.ts
git commit -m "Add append-only task history storage" \
  -m "Constraint: History must stay source-agnostic and avoid changing task markdown frontmatter." \
  -m "Rejected: Embedding history in task body | harder to parse and risks disrupting existing task files." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Preserve JSONL append-only semantics for future history features." \
  -m "Tested: bun test test/storage/history.test.ts; bun test test/model/types.test.ts test/storage/paths.test.ts" \
  -m "Not-tested: CLI and HTML history view are implemented in later tasks."
```

---

### Task 2: History Add/List Commands

**Files:**
- Create: `src/commands/history.ts`
- Test: `test/commands/history.test.ts`

- [ ] **Step 1: Write failing command tests**

Create `test/commands/history.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { runHistoryAdd, runHistoryList } from "../../src/commands/history";
import { writeTask } from "../../src/storage/tasks";
import { listHistoryEvents } from "../../src/storage/history";
import type { Task } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "hist-cmd-"));
  runInit(root);
  writeTask(root, task("T-001"));
  return root;
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: `標題 ${id}`,
    type: "feature",
    status: "todo",
    priority: "med",
    tags: [],
    created: "2026-05-30T10:00:00+08:00",
    updated: "2026-05-30T10:00:00+08:00",
    body: "",
    ...over,
  };
}

test("history add appends a manual event and returns event id", () => {
  const root = setup();
  const out = runHistoryAdd(root, "T-001", {
    type: "decision",
    title: "Use sidecar",
    body: "Keep task markdown unchanged",
    author: "agent",
    now: () => "2026-05-30T11:00:00+08:00",
  });
  expect(out).toBe("已新增 T-001 history E-001");
  const events = listHistoryEvents(root, "T-001");
  expect(events[0]).toMatchObject({
    id: "E-001",
    task_id: "T-001",
    type: "decision",
    title: "Use sidecar",
    author: "agent",
    body: "Keep task markdown unchanged",
    created: "2026-05-30T11:00:00+08:00",
  });
});

test("history add reads bodyFile", () => {
  const root = setup();
  const bodyFile = join(root, "decision.md");
  writeFileSync(bodyFile, "line 1\nline 2\n", "utf8");
  runHistoryAdd(root, "T-001", {
    type: "note",
    title: "From file",
    bodyFile,
    now: () => "2026-05-30T11:00:00+08:00",
  });
  expect(listHistoryEvents(root, "T-001")[0]!.body).toBe("line 1\nline 2\n");
});

test("history add validates task existence, manual type, body source, and content", () => {
  const root = setup();
  expect(() => runHistoryAdd(root, "T-999", { type: "note", body: "x" })).toThrow(/找不到 task/);
  expect(() => runHistoryAdd(root, "T-001", { body: "x" })).toThrow(/--type/);
  expect(() => runHistoryAdd(root, "T-001", { type: "status_change", body: "x" })).toThrow(/history type/);
  expect(() => runHistoryAdd(root, "T-001", { type: "note", body: "x", bodyFile: "x.md" })).toThrow(/--body/);
  expect(() => runHistoryAdd(root, "T-001", { type: "note" })).toThrow(/--title/);
});

test("history list renders text summaries and JSON", () => {
  const root = setup();
  runHistoryAdd(root, "T-001", {
    type: "source",
    title: "Agent plan",
    body: "A long body that should appear in text output",
    now: () => "2026-05-30T11:00:00+08:00",
  });
  const text = runHistoryList(root, "T-001", {});
  expect(text).toContain("2026-05-30T11:00:00+08:00");
  expect(text).toContain("[source]");
  expect(text).toContain("Agent plan");
  const json = JSON.parse(runHistoryList(root, "T-001", { json: true }));
  expect(json[0].type).toBe("source");
});

test("history list returns empty message for existing task with no events", () => {
  const root = setup();
  expect(runHistoryList(root, "T-001", {})).toBe("（尚無 history）");
  expect(runHistoryList(root, "T-001", { json: true })).toBe("[]");
});
```

- [ ] **Step 2: Run command tests and verify they fail on missing module**

Run:

```bash
bun test test/commands/history.test.ts
```

Expected: FAIL with missing `src/commands/history`.

- [ ] **Step 3: Implement commands/history.ts**

Create `src/commands/history.ts`:

```ts
import { readFileSync } from "node:fs";
import { nowIso } from "../model/clock";
import {
  parseManualHistoryEventType,
  type ManualTaskHistoryEventType,
  type TaskHistoryEvent,
} from "../model/types";
import { readTask } from "../storage/tasks";
import { appendHistoryEvent, listHistoryEvents, nextHistoryEventId } from "../storage/history";

export interface HistoryAddOpts {
  type?: string;
  title?: string;
  body?: string;
  bodyFile?: string;
  author?: string;
  now?: () => string;
}

export interface HistoryListOpts {
  json?: boolean;
}

function cleanOptional(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  return trimmed ? trimmed : undefined;
}

function summarize(event: TaskHistoryEvent): string {
  const primary = event.title || event.body.replace(/\s+/g, " ").trim();
  const summary = primary.length > 80 ? `${primary.slice(0, 77)}...` : primary;
  const author = event.author ? ` @${event.author}` : "";
  return `${event.created}  [${event.type}]${author}  ${summary}`.trimEnd();
}

export function runHistoryAdd(root: string, taskId: string, opts: HistoryAddOpts): string {
  readTask(root, taskId);
  if (!opts.type) throw new Error("history add 需要 --type");
  const type: ManualTaskHistoryEventType = parseManualHistoryEventType(opts.type);
  if (opts.body !== undefined && opts.bodyFile !== undefined) {
    throw new Error("--body 與 --body-file 不可同時使用");
  }
  const title = cleanOptional(opts.title);
  const body = opts.bodyFile !== undefined ? readFileSync(opts.bodyFile, "utf8") : opts.body ?? "";
  if (!title && body.trim() === "") throw new Error("history add 至少需要 --title 或 --body");
  const existing = listHistoryEvents(root, taskId);
  const event: TaskHistoryEvent = {
    id: nextHistoryEventId(existing),
    task_id: taskId,
    type,
    created: (opts.now ?? nowIso)(),
    author: cleanOptional(opts.author),
    title,
    body,
  };
  appendHistoryEvent(root, event, taskId);
  return `已新增 ${taskId} history ${event.id}`;
}

export function runHistoryList(root: string, taskId: string, opts: HistoryListOpts): string {
  readTask(root, taskId);
  const events = listHistoryEvents(root, taskId);
  if (opts.json) return JSON.stringify(events, null, 2);
  if (events.length === 0) return "（尚無 history）";
  return events.map(summarize).join("\n");
}
```

- [ ] **Step 4: Run command and storage tests**

Run:

```bash
bun test test/commands/history.test.ts test/storage/history.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/commands/history.ts test/commands/history.test.ts
git commit -m "Expose manual task history commands" \
  -m "Constraint: Manual history must not allow forged status_change events." \
  -m "Rejected: Letting agents write JSONL directly | CLI validation gives a stable source-agnostic entry point." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep manual event validation centralized in commands/history.ts." \
  -m "Tested: bun test test/commands/history.test.ts test/storage/history.test.ts" \
  -m "Not-tested: CLI dispatch and HTML view are implemented in later tasks."
```

---

### Task 3: Automatic Status Change Events

**Files:**
- Modify: `src/commands/tasks.ts`
- Modify: `test/commands/tasks.test.ts`

- [ ] **Step 1: Add failing status history tests**

Append these tests to `test/commands/tasks.test.ts`:

```ts
import { listHistoryEvents } from "../../src/storage/history";

test("update --status appends status_change history only when status changes", () => {
  const root = setup();
  writeTask(root, task("T-001", { status: "todo" }));
  runUpdate(root, "T-001", {
    status: "in_progress",
    now: () => "2026-05-31T09:00:00+08:00",
  });
  let events = listHistoryEvents(root, "T-001");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    id: "E-001",
    task_id: "T-001",
    type: "status_change",
    created: "2026-05-31T09:00:00+08:00",
    title: "todo -> in_progress",
    body: "",
    meta: { from: "todo", to: "in_progress" },
  });

  runUpdate(root, "T-001", {
    status: "in_progress",
    now: () => "2026-05-31T09:05:00+08:00",
  });
  events = listHistoryEvents(root, "T-001");
  expect(events).toHaveLength(1);
});

test("done appends status_change history", () => {
  const root = setup();
  writeTask(root, task("T-001", { status: "in_progress" }));
  runDone(root, "T-001", { now: () => "2026-05-31T09:00:00+08:00" });
  const events = listHistoryEvents(root, "T-001");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: "status_change",
    title: "in_progress -> done",
    meta: { from: "in_progress", to: "done" },
  });
});
```

If TypeScript rejects a second import appended at the bottom, move `listHistoryEvents` into the existing import block at the top instead:

```ts
import { listHistoryEvents } from "../../src/storage/history";
```

- [ ] **Step 2: Run focused task command tests and verify new expectations fail**

Run:

```bash
bun test test/commands/tasks.test.ts
```

Expected: FAIL because no `status_change` events are appended yet.

- [ ] **Step 3: Integrate history append in tasks.ts**

Modify the imports in `src/commands/tasks.ts` to add history helpers and `TaskStatus` type:

```ts
import { appendHistoryEvent, listHistoryEvents, nextHistoryEventId } from "../storage/history";
import {
  parseEnum, parseTags, parseDue, parseDependsOn,
  TASK_TYPES, TASK_STATUSES, PRIORITIES,
  type Task,
  type TaskStatus,
} from "../model/types";
```

Add this helper near the ranking helpers:

```ts
function appendStatusChangeHistory(root: string, taskId: string, from: TaskStatus, to: TaskStatus, created: string): void {
  if (from === to) return;
  const existing = listHistoryEvents(root, taskId);
  appendHistoryEvent(root, {
    id: nextHistoryEventId(existing),
    task_id: taskId,
    type: "status_change",
    created,
    title: `${from} -> ${to}`,
    body: "",
    meta: { from, to },
  }, taskId);
}
```

Then update `runUpdate` so it computes the new status and timestamp once before building `updated`:

```ts
  const nextStatus = opts.status ? parseEnum("status", opts.status, TASK_STATUSES) : t.status;
  const updatedAt = (opts.now ?? nowIso)();

  const updated: Task = {
    ...t,
    title: opts.title ?? t.title,
    type: opts.type ? parseEnum("type", opts.type, TASK_TYPES) : t.type,
    status: nextStatus,
    priority: opts.priority ? parseEnum("priority", opts.priority, PRIORITIES) : t.priority,
    tags,
    body: opts.body !== undefined ? opts.body : t.body,
    depends_on,
    due: opts.due !== undefined ? parseDue(opts.due) : t.due,
    assignee: opts.assignee !== undefined ? (opts.assignee || undefined) : t.assignee,
    estimate: opts.estimate !== undefined ? (opts.estimate || undefined) : t.estimate,
    updated: updatedAt,
  };
  writeTask(root, updated);
  appendStatusChangeHistory(root, id, t.status, updated.status, updatedAt);
  return `已更新 ${id}`;
```

- [ ] **Step 4: Run task and history tests**

Run:

```bash
bun test test/commands/tasks.test.ts test/commands/history.test.ts test/storage/history.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/commands/tasks.ts test/commands/tasks.test.ts
git commit -m "Record task status changes in history" \
  -m "Constraint: Only actual status transitions should create automatic history events." \
  -m "Rejected: Auditing every field update in the first slice | noisier and outside the approved MVP." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Route future status mutations through runUpdate or preserve equivalent history writes." \
  -m "Tested: bun test test/commands/tasks.test.ts test/commands/history.test.ts test/storage/history.test.ts" \
  -m "Not-tested: Browser history view is implemented in later tasks."
```

---

### Task 4: Read-Only HTML Renderer and Server

**Files:**
- Create: `src/history/page.ts`
- Create: `src/history/server.ts`
- Test: `test/history/page.test.ts`
- Test: `test/history/server.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `test/history/page.test.ts`:

```ts
import { expect, test } from "bun:test";
import { renderTaskHistoryPage } from "../../src/history/page";
import type { Task, TaskHistoryEvent } from "../../src/model/types";

const task: Task = {
  id: "T-001",
  title: "實作 <history>",
  type: "feature",
  status: "in_progress",
  priority: "high",
  tags: ["agent", "history"],
  created: "2026-05-30T10:00:00+08:00",
  updated: "2026-05-30T11:00:00+08:00",
  body: "Body <script>alert(1)</script>",
  source: "agent-plan",
};

const events: TaskHistoryEvent[] = [
  {
    id: "E-001",
    task_id: "T-001",
    type: "decision",
    created: "2026-05-30T10:30:00+08:00",
    author: "agent",
    title: "Use JSONL",
    body: "Decision <b>body</b>",
  },
  {
    id: "E-002",
    task_id: "T-001",
    type: "status_change",
    created: "2026-05-30T11:00:00+08:00",
    title: "todo -> in_progress",
    body: "",
    meta: { from: "todo", to: "in_progress" },
  },
];

test("history page renders task summary and timeline", () => {
  const html = renderTaskHistoryPage(task, events);
  expect(html).toContain("T-001");
  expect(html).toContain("feature / high");
  expect(html).toContain("#agent");
  expect(html).toContain("Use JSONL");
  expect(html).toContain("todo → in_progress");
});

test("history page escapes user-controlled task and event text", () => {
  const html = renderTaskHistoryPage(task, events);
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).not.toContain("Decision <b>body</b>");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).toContain("Decision &lt;b&gt;body&lt;/b&gt;");
});

test("history page renders empty history guidance", () => {
  const html = renderTaskHistoryPage(task, []);
  expect(html).toContain("尚無歷程");
  expect(html).toContain("taskcli history add T-001 --type note --body");
});
```

- [ ] **Step 2: Write failing server tests**

Create `test/history/server.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { writeTask } from "../../src/storage/tasks";
import { appendHistoryEvent } from "../../src/storage/history";
import { startHistoryServer } from "../../src/history/server";
import type { Task } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "hist-srv-"));
  runInit(root);
  writeTask(root, task("T-001"));
  appendHistoryEvent(root, {
    id: "E-001",
    task_id: "T-001",
    type: "note",
    created: "2026-05-30T10:00:00+08:00",
    body: "hello timeline",
  });
  return root;
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: `標題 ${id}`,
    type: "feature",
    status: "todo",
    priority: "med",
    tags: [],
    created: "2026-05-30T10:00:00+08:00",
    updated: "2026-05-30T10:00:00+08:00",
    body: "",
    ...over,
  };
}

test("GET / returns task history HTML", async () => {
  const root = setup();
  const srv = startHistoryServer(root, "T-001", { port: 0 });
  try {
    const res = await fetch(srv.url);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("T-001");
    expect(html).toContain("hello timeline");
  } finally {
    srv.stop();
  }
});

test("unknown history server route returns 404", async () => {
  const root = setup();
  const srv = startHistoryServer(root, "T-001", { port: 0 });
  try {
    const res = await fetch(srv.url + "save");
    expect(res.status).toBe(404);
  } finally {
    srv.stop();
  }
});
```

- [ ] **Step 3: Run renderer/server tests and verify missing modules fail**

Run:

```bash
bun test test/history/page.test.ts test/history/server.test.ts
```

Expected: FAIL with missing `src/history/page` and `src/history/server`.

- [ ] **Step 4: Implement history/page.ts**

Create `src/history/page.ts`:

```ts
import type { Task, TaskHistoryEvent } from "../model/types";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function optionalRow(label: string, value: string | string[] | undefined): string {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join(", ") : value;
  if (!text) return "";
  return `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(text)}</b></div>`;
}

function renderEventBody(event: TaskHistoryEvent): string {
  if (event.type === "status_change" && event.meta?.from && event.meta?.to) {
    return `<div class="status-change">${escapeHtml(event.meta.from)} → ${escapeHtml(event.meta.to)}</div>`;
  }
  if (!event.body) return "";
  return `<pre>${escapeHtml(event.body)}</pre>`;
}

function renderEvent(event: TaskHistoryEvent): string {
  const author = event.author ? `<span class="author">@${escapeHtml(event.author)}</span>` : "";
  const title = event.title ? `<h3>${escapeHtml(event.title)}</h3>` : "";
  return `<article class="event ${escapeHtml(event.type)}">
    <div class="event-meta">
      <span class="badge">${escapeHtml(event.type)}</span>
      <time>${escapeHtml(event.created)}</time>
      ${author}
    </div>
    ${title}
    ${renderEventBody(event)}
  </article>`;
}

export function renderTaskHistoryPage(task: Task, events: TaskHistoryEvent[]): string {
  const tags = task.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join(" ");
  const timeline = events.length
    ? events.map(renderEvent).join("\n")
    : `<div class="empty">
        <h2>尚無歷程</h2>
        <p>可用 CLI 追加第一筆 note：</p>
        <code>taskcli history add ${escapeHtml(task.id)} --type note --body "..."</code>
      </div>`;

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(task.id)} history</title>
<style>
  :root { --bg:#f8fafc; --card:#fff; --border:#e2e8f0; --text:#0f172a; --muted:#64748b; --primary:#2563eb; --ok:#047857; --warn:#b45309; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:system-ui,-apple-system,"Noto Sans TC","PingFang TC",sans-serif; background:var(--bg); color:var(--text); line-height:1.55; }
  main { max-width: 980px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  header, .panel, .event, .empty { background:var(--card); border:1px solid var(--border); border-radius:14px; box-shadow:0 1px 3px rgba(15,23,42,.05); }
  header { padding:1.25rem 1.4rem; margin-bottom:1rem; }
  h1 { margin:0 0 .4rem; font-size:1.6rem; letter-spacing:-.02em; }
  h2 { margin:0 0 .75rem; font-size:1.1rem; }
  h3 { margin:.55rem 0 .4rem; font-size:1rem; }
  .subtitle { color:var(--muted); }
  .tags { margin-top:.6rem; }
  .tag, .badge { display:inline-block; border-radius:999px; padding:.16rem .55rem; font-size:.8rem; font-weight:650; }
  .tag { background:#eff6ff; color:#1d4ed8; margin-right:.25rem; }
  .badge { background:#e2e8f0; color:#334155; }
  .status_change .badge { background:#fef3c7; color:var(--warn); }
  .verification .badge { background:#dcfce7; color:var(--ok); }
  .grid { display:grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap:1rem; align-items:start; }
  .panel { padding:1rem 1.2rem; }
  .facts { display:grid; gap:.6rem; }
  .facts div { display:flex; justify-content:space-between; gap:1rem; border-bottom:1px solid #f1f5f9; padding-bottom:.45rem; }
  .facts span, time, .author { color:var(--muted); font-size:.86rem; }
  pre { white-space:pre-wrap; margin:.6rem 0 0; padding:.85rem; border-radius:10px; background:#f8fafc; border:1px solid var(--border); font:inherit; }
  .task-body { margin-top:1rem; }
  .timeline { display:grid; gap:.75rem; }
  .event { padding:1rem 1.15rem; border-left:4px solid var(--primary); }
  .event-meta { display:flex; flex-wrap:wrap; align-items:center; gap:.55rem; }
  .status-change { margin-top:.55rem; font-weight:700; color:var(--warn); }
  .empty { padding:1.5rem; color:var(--muted); }
  code { display:block; color:#0f172a; background:#f1f5f9; border:1px solid var(--border); border-radius:9px; padding:.75rem; overflow:auto; }
  @media (max-width: 760px) { .grid { grid-template-columns:1fr; } }
</style>
</head>
<body>
<main>
<header>
  <h1>${escapeHtml(task.id)} ${escapeHtml(task.title)}</h1>
  <div class="subtitle">${escapeHtml(task.status)} · ${escapeHtml(task.type)} / ${escapeHtml(task.priority)}${task.source ? ` · source: ${escapeHtml(task.source)}` : ""}</div>
  ${tags ? `<div class="tags">${tags}</div>` : ""}
</header>
<div class="grid">
  <section class="panel">
    <h2>Task Summary</h2>
    <div class="facts">
      ${optionalRow("created", task.created)}
      ${optionalRow("updated", task.updated)}
      ${optionalRow("due", task.due)}
      ${optionalRow("assignee", task.assignee)}
      ${optionalRow("estimate", task.estimate)}
      ${optionalRow("depends_on", task.depends_on)}
    </div>
    ${task.body ? `<div class="task-body"><h2>Body</h2><pre>${escapeHtml(task.body)}</pre></div>` : ""}
  </section>
  <section class="timeline">
    ${timeline}
  </section>
</div>
</main>
</body>
</html>`;
}
```

- [ ] **Step 5: Implement history/server.ts**

Create `src/history/server.ts`:

```ts
import { readTask } from "../storage/tasks";
import { listHistoryEvents } from "../storage/history";
import { renderTaskHistoryPage } from "./page";

export interface HistoryServer {
  url: string;
  port: number;
  stop: () => void;
}

export interface HistoryServerOpts {
  port?: number;
}

export function startHistoryServer(root: string, taskId: string, opts: HistoryServerOpts): HistoryServer {
  readTask(root, taskId);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port ?? 0,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/") {
        const task = readTask(root, taskId);
        const events = listHistoryEvents(root, taskId);
        return new Response(renderTaskHistoryPage(task, events), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port ?? 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    stop: () => server.stop(),
  };
}
```

- [ ] **Step 6: Run history UI tests**

Run:

```bash
bun test test/history/page.test.ts test/history/server.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add src/history/page.ts src/history/server.ts test/history/page.test.ts test/history/server.test.ts
git commit -m "Render task history in a read-only browser view" \
  -m "Constraint: The first browser view must inspect history without becoming a second write path." \
  -m "Rejected: Markdown rendering | escaped plain text is safer and sufficient for the MVP." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Escape all task and history text before adding richer rendering." \
  -m "Tested: bun test test/history/page.test.ts test/history/server.test.ts" \
  -m "Not-tested: CLI history view dispatch is implemented in the next task."
```

---

### Task 5: CLI Dispatch for history add/list/view

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Append these tests to `test/cli.test.ts`:

```ts
test("history add/list 經 CLI 追加並讀取 history", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-hist-"));
  await run(root, ["init"]);
  await run(root, ["add", "需要歷程"]);

  const add = await run(root, [
    "history", "add", "T-001",
    "--type", "note",
    "--title", "觀察",
    "--body", "可以追蹤歷程",
    "--author", "agent",
  ]);
  expect(add.code).toBe(0);
  expect(add.stdout).toContain("E-001");

  const list = await run(root, ["history", "list", "T-001", "--json"]);
  expect(list.code).toBe(0);
  const events = JSON.parse(list.stdout);
  expect(events[0]).toMatchObject({ type: "note", title: "觀察", author: "agent" });
});

test("history add --body-file 經 CLI 讀取檔案", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-hist-file-"));
  await run(root, ["init"]);
  await run(root, ["add", "檔案歷程"]);
  const bodyFile = join(root, "note.md");
  await Bun.write(bodyFile, "from file\n");

  const add = await run(root, [
    "history", "add", "T-001",
    "--type", "source",
    "--title", "來源摘要",
    "--body-file", bodyFile,
  ]);
  expect(add.code).toBe(0);
  const list = await run(root, ["history", "list", "T-001", "--json"]);
  expect(JSON.parse(list.stdout)[0].body).toBe("from file\n");
});

test("history view 未提供 task id 時給錯誤", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-hist-view-"));
  await run(root, ["init"]);
  const res = await run(root, ["history", "view"]);
  expect(res.code).not.toBe(0);
  expect(res.stderr).toContain("history view 需要 <task-id>");
});

test("--help 含 history examples", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cli-help-history-"));
  const res = await run(cwd, ["--help"]);
  expect(res.code).toBe(0);
  expect(res.stdout).toContain("history add");
  expect(res.stdout).toContain("history view");
});
```

- [ ] **Step 2: Run CLI tests and verify history command is unknown**

Run:

```bash
bun test test/cli.test.ts
```

Expected: FAIL on unknown `history` command and missing help text.

- [ ] **Step 3: Wire imports and usage in cli.ts**

Modify `src/cli.ts` imports:

```ts
import { runHistoryAdd, runHistoryList } from "./commands/history";
import { startHistoryServer } from "./history/server";
```

Update `USAGE` to include command rows:

```text
  history add <task-id> --type <type> [--title --body --body-file --author]   追加 task 歷程
  history list <task-id> [--json]       列出 task 歷程
  history view <task-id> [--port n] [--open]   啟動只讀歷程頁
```

Update examples:

```text
  taskcli history add T-001 --type decision --title "採 JSONL" --body "保留 task markdown 相容"
  taskcli history view T-001 --open
```

- [ ] **Step 4: Add history switch branch before import/rm fallback**

Add this `case` in the main command `switch` in `src/cli.ts`:

```ts
      case "history": {
        const [sub, ...sr] = rest;
        if (sub === "add") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: {
              type: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              "body-file": { type: "string" },
              author: { type: "string" },
            },
            allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("history add 需要 <task-id>");
          if (values.body !== undefined && values["body-file"] !== undefined) fail("--body 與 --body-file 不可同時使用");
          process.stdout.write(`${runHistoryAdd(requireRoot(cwd), id, {
            type: values.type,
            title: values.title,
            body: values.body,
            bodyFile: values["body-file"],
            author: values.author,
          })}\n`);
          return;
        }
        if (sub === "list") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: { json: { type: "boolean" } },
            allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("history list 需要 <task-id>");
          process.stdout.write(`${runHistoryList(requireRoot(cwd), id, { json: values.json })}\n`);
          return;
        }
        if (sub === "view") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: { port: { type: "string" }, open: { type: "boolean" } },
            allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("history view 需要 <task-id>");
          const srv = startHistoryServer(requireRoot(cwd), id, {
            port: values.port ? Number(values.port) : undefined,
          });
          process.stdout.write(`歷程頁已啟動：${srv.url}\n按 Ctrl+C 結束。\n`);
          if (values.open) Bun.spawn(["open", srv.url]);
          await new Promise<void>(() => {});
          return;
        }
        fail(`未知 history 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
```

- [ ] **Step 5: Run CLI and command tests**

Run:

```bash
bun test test/cli.test.ts test/commands/history.test.ts
```

Expected: PASS. The `history view` CLI test only checks missing id, so it does not hang.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "Route task history through the CLI" \
  -m "Constraint: history view is a long-running read-only local server and must not run during normal test assertions." \
  -m "Rejected: Adding browser editing in this slice | it would create a second write path before the CLI contract is stable." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep history subcommands grouped under taskcli history for future extension." \
  -m "Tested: bun test test/cli.test.ts test/commands/history.test.ts" \
  -m "Not-tested: Manual browser launch with --open waits until final smoke verification."
```

---

### Task 6: Documentation and Release Notes

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/v0.3.0-task-history.md`

- [ ] **Step 1: Update README task structure section**

In `README.md`, after the `.taskcli/tasks/T-001.md` example, add:

```markdown
## task history（`.taskcli/history/T-001.jsonl`）

TaskCli 可為每個 task 保留 append-only 開發歷程，不改動 task markdown 本體：

```jsonl
{"id":"E-001","task_id":"T-001","type":"source","created":"2026-05-30T10:00:00+08:00","title":"Agent plan","body":"由 agent plan 拆出此 task"}
{"id":"E-002","task_id":"T-001","type":"status_change","created":"2026-05-30T10:30:00+08:00","title":"todo -> in_progress","body":"","meta":{"from":"todo","to":"in_progress"}}
{"id":"E-003","task_id":"T-001","type":"verification","created":"2026-05-30T11:00:00+08:00","author":"agent","body":"bun test passed"}
```

手動可追加 `note`、`decision`、`verification`、`source`。`status_change` 由 `update --status` / `done` 自動產生。
```

If nested code fences break Markdown rendering, use four backticks for the outer inserted section.

- [ ] **Step 2: Update README command table and examples**

Add to the command table:

```markdown
| `history add <task-id> --type note\|decision\|verification\|source [--title --body --body-file --author]` | 追加 task 開發歷程 |
| `history list <task-id> [--json]` | 列出 task 歷程 |
| `history view <task-id> [--port n] [--open]` | 啟動單一 task 只讀歷程頁 |
```

Add to common examples:

```bash
taskcli history add T-001 --type decision --title "採 sidecar JSONL" --body "保持 task markdown 相容"
taskcli history add T-001 --type verification --author agent --body "bun test passed"
taskcli history view T-001 --open
```

- [ ] **Step 3: Add release document**

Create `docs/releases/v0.3.0-task-history.md`:

```markdown
# TaskCli v0.3.0 Task History 交付說明

此版本讓 TaskCli 從 task 清單延伸為 task-centric 的專案開發歷程承接層。

## 新增

- `.taskcli/history/<task-id>.jsonl`：每個 task 一個 append-only history sidecar。
- `taskcli history add <task-id>`：追加 `note`、`decision`、`verification`、`source` 事件。
- `taskcli history list <task-id> [--json]`：列出單一 task 歷程。
- `taskcli history view <task-id> [--open]`：以本地只讀 HTML 頁檢視 task summary 與 timeline。
- `taskcli update --status ...` 與 `taskcli done` 會在狀態實際改變時自動記錄 `status_change`。

## 相容性

- 不改既有 `.taskcli/tasks/*.md` frontmatter schema。
- 不綁定 Superpowers、GitHub、Slack 或任何特定 agent。
- HTML view 第一版只讀，所有寫入仍透過 CLI。

## 建議用法

```bash
taskcli history add T-001 --type source --title "Agent plan" --body "由開發計畫拆出"
taskcli update T-001 --status in_progress
taskcli history add T-001 --type verification --author agent --body "bun test passed"
taskcli history view T-001 --open
```
```

- [ ] **Step 4: Update CHANGELOG.md**

Open `CHANGELOG.md` and add an unreleased/v0.3.0 entry near the top. If no Unreleased section exists, add:

```markdown
## v0.3.0 - Task history

- 新增 per-task append-only history JSONL sidecar。
- 新增 `taskcli history add/list/view`。
- `update --status` / `done` 自動記錄 `status_change`。
- 新增只讀 HTML task timeline view。
```

- [ ] **Step 5: Run documentation smoke checks**

Run:

```bash
grep -n "history add" README.md CHANGELOG.md docs/releases/v0.3.0-task-history.md
bun test test/cli.test.ts
```

Expected: grep finds the new docs lines; CLI tests pass.

- [ ] **Step 6: Commit Task 6**

Run:

```bash
git add README.md CHANGELOG.md docs/releases/v0.3.0-task-history.md
git commit -m "Document task history workflows" \
  -m "Constraint: Documentation must present history as source-agnostic task memory, not as a Superpowers-only feature." \
  -m "Rejected: Documenting project dashboards | not part of the v0.3.0 implementation slice." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep examples focused on CLI-owned writes and read-only browser inspection." \
  -m "Tested: grep -n history add README.md CHANGELOG.md docs/releases/v0.3.0-task-history.md; bun test test/cli.test.ts" \
  -m "Not-tested: Rendered README appearance outside plain Markdown."
```

---

### Task 7: Full Verification and Build Smoke

**Files:**
- Modify only if verification reveals a defect.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
bun test
```

Expected: PASS all tests.

- [ ] **Step 2: Run TypeScript typecheck**

Run:

```bash
bunx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run binary build**

Run:

```bash
bun run build
```

Expected: creates or updates `dist/taskcli` without build errors. Do not commit `dist/` because it is ignored.

- [ ] **Step 4: Smoke test compiled binary help**

Run:

```bash
./dist/taskcli --help | grep -n "history view"
```

Expected: output includes the `history view` usage line.

- [ ] **Step 5: Smoke test history workflow in a temporary project**

Run:

```bash
tmp="$(mktemp -d)"
./dist/taskcli init --help >/dev/null 2>&1 || true
(
  cd "$tmp"
  /Users/carl/Dev/CMG/TaskCli/dist/taskcli init
  /Users/carl/Dev/CMG/TaskCli/dist/taskcli add "History smoke"
  /Users/carl/Dev/CMG/TaskCli/dist/taskcli history add T-001 --type note --body "smoke note"
  /Users/carl/Dev/CMG/TaskCli/dist/taskcli update T-001 --status in_progress
  /Users/carl/Dev/CMG/TaskCli/dist/taskcli history list T-001 --json
)
```

Expected: JSON output contains one `note` event and one `status_change` event. If the first `init --help` line is unnecessary or confusing during execution, skip it and run only the subshell workflow.

- [ ] **Step 6: Check git status for unintended files**

Run:

```bash
git status --short
```

Expected: no unintended files. `.superpowers/` may remain untracked from brainstorming; do not commit it unless the user explicitly wants visual companion artifacts tracked.

- [ ] **Step 7: Final verification commit if fixes were needed**

If verification required code/doc fixes, commit them with a Lore message. If no fixes were needed, do not create an empty commit.

Template if fixes were needed:

```bash
git add <fixed-files>
git commit -m "Stabilize task history verification" \
  -m "Constraint: Final verification must pass tests, typecheck, build, and compiled CLI smoke checks." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Preserve the verified CLI workflow when extending history." \
  -m "Tested: bun test; bunx tsc --noEmit; bun run build; ./dist/taskcli --help | grep -n history view; compiled CLI smoke workflow" \
  -m "Not-tested: Browser --open manual visual inspection unless explicitly run during implementation."
```

---

## Self-Review Checklist

- Spec coverage:
  - Sidecar JSONL: Task 1.
  - History add/list: Task 2 and Task 5.
  - Automatic `status_change`: Task 3.
  - Read-only HTML view: Task 4 and Task 5.
  - README/release/usage: Task 5 and Task 6.
  - Full tests/typecheck/build: Task 7.
- Placeholder scan: This plan contains concrete file paths, test code, implementation snippets, commands, and expected results for every step.
- Type consistency:
  - Event fields use `id`, `task_id`, `type`, `created`, `author`, `title`, `body`, `meta` consistently.
  - Manual event parser is `parseManualHistoryEventType` and excludes `status_change`.
  - Server API is `startHistoryServer(root, taskId, opts)` and renderer API is `renderTaskHistoryPage(task, events)`.
