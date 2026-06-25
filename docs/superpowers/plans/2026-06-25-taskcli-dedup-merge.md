# TaskCli 重複工作管理（建立防重 + merge）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `taskcli merge` 指令安全合併重複 task，並在 SKILL.md 加入「建立前語意防重」與「事後清理」的 agent 行為。

**Architecture:** 沿用既有分層 `cli.ts → commands/* → storage/+model/`。語意判斷留在 agent（SKILL.md），CLI 只做結構性合併：重接入向相依、聯集來源的 tags/depends_on、寫 history note、刪除來源；合併前在記憶體完成循環檢查，通過才落盤。

**Tech Stack:** Bun + TypeScript（ESM、strict）。測試 `bun test`。無新增執行期相依。

## Global Constraints

- CLI 純存取、不碰 LLM——`merge` 不得做任何語意相似度計算或網路呼叫。
- 不改既有資料格式：task frontmatter 欄位、id 格式（`T-NNN` / `E-NNN`）、history JSONL schema 不變。
- immutable 風格：回傳新物件，不原地 mutate 輸入。
- 指令函式回傳「要印出的字串」，由 `cli.ts` 統一 `process.stdout.write`；錯誤一律 `throw new Error(...)`。
- 時間一律經 `model/clock.ts`（`nowIso`）注入；測試以 `now` 參數固定時間。
- 讀取型輸出支援 `--json`。
- 提交前 `bun test` 全綠。

---

## File Structure

- `src/model/deps.ts`（新增）：純函式 `hasCycle(graph)`，相依圖循環偵測。
- `src/storage/history.ts`（修改）：新增 `deleteHistory(root, taskId)` 刪除 history sidecar。
- `src/commands/merge.ts`（新增）：`runMerge(root, opts)` 合併核心邏輯。
- `src/cli.ts`（修改）：新增 `merge` 指令分派與 `USAGE` 說明。
- `skills/taskcli/SKILL.md`（修改）：新增建立防重步驟與清理指引。
- `README.md` / `CHANGELOG.md`（修改）：文件。
- 測試：`test/model/deps.test.ts`、`test/storage/history.test.ts`（追加）、`test/commands/merge.test.ts`、`test/skill-content.test.ts`（追加）。

---

## Task 1: `hasCycle` 相依圖循環偵測

**Files:**
- Create: `src/model/deps.ts`
- Test: `test/model/deps.test.ts`

**Interfaces:**
- Produces: `export function hasCycle(graph: Map<string, string[]>): boolean` — key 為 task id，value 為其 `depends_on` 陣列；忽略指向不存在 key 的邊；任一節點走回灰色節點即視為有環。

- [ ] **Step 1: 寫失敗測試**

`test/model/deps.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { hasCycle } from "../../src/model/deps";

test("hasCycle 偵測直接循環", () => {
  const g = new Map([["T-001", ["T-002"]], ["T-002", ["T-001"]]]);
  expect(hasCycle(g)).toBe(true);
});

test("hasCycle 偵測自我循環", () => {
  expect(hasCycle(new Map([["T-001", ["T-001"]]]))).toBe(true);
});

test("hasCycle 無循環回 false", () => {
  const g = new Map([["T-001", ["T-002"]], ["T-002", []]]);
  expect(hasCycle(g)).toBe(false);
});

test("hasCycle 忽略指向不存在節點的邊", () => {
  expect(hasCycle(new Map([["T-001", ["T-999"]]]))).toBe(false);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/model/deps.test.ts`
Expected: FAIL（`Cannot find module '.../src/model/deps'`）。

- [ ] **Step 3: 實作**

`src/model/deps.ts`:

```typescript
// 相依圖循環偵測：DFS 白/灰/黑著色。只走指向存在節點的邊。
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function hasCycle(graph: Map<string, string[]>): boolean {
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);
  let found = false;

  function dfs(id: string): void {
    color.set(id, GRAY);
    for (const dep of graph.get(id) ?? []) {
      if (!color.has(dep)) continue; // 忽略指向不存在節點的邊
      const c = color.get(dep);
      if (c === GRAY) {
        found = true;
        return;
      }
      if (c === WHITE) {
        dfs(dep);
        if (found) return;
      }
    }
    color.set(id, BLACK);
  }

  for (const id of graph.keys()) {
    if (color.get(id) === WHITE) dfs(id);
    if (found) return true;
  }
  return false;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/model/deps.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/model/deps.ts test/model/deps.test.ts
git commit -m "feat: [taskcli] 新增 hasCycle 相依圖循環偵測"
```

---

## Task 2: `deleteHistory` 刪除 history sidecar

**Files:**
- Modify: `src/storage/history.ts`
- Test: `test/storage/history.test.ts`（追加）

**Interfaces:**
- Consumes: 既有 `appendHistoryEvent`、`historyPath`。
- Produces: `export function deleteHistory(root: string, taskId: string): void` — sidecar 存在則刪除，不存在則靜默通過（不丟錯）。

- [ ] **Step 1: 寫失敗測試（追加到 `test/storage/history.test.ts` 檔尾）**

```typescript
import { mkdtempSync, existsSync as existsSyncFs } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { deleteHistory, historyPath as historyPathFn } from "../../src/storage/history";

function tmpHistRoot(): string {
  return mkdtempSync(joinPath(tmpdir(), "taskcli-histdel-"));
}

test("deleteHistory 刪除既有 sidecar", () => {
  const root = tmpHistRoot();
  appendHistoryEvent(root, {
    id: "E-001", task_id: "T-001", type: "note",
    created: "2026-01-01T00:00:00+08:00", body: "x",
  });
  expect(existsSyncFs(historyPathFn(root, "T-001"))).toBe(true);
  deleteHistory(root, "T-001");
  expect(existsSyncFs(historyPathFn(root, "T-001"))).toBe(false);
});

test("deleteHistory 對不存在 sidecar 不報錯", () => {
  const root = tmpHistRoot();
  expect(() => deleteHistory(root, "T-404")).not.toThrow();
});
```

> 註：若 `test/storage/history.test.ts` 已 import `appendHistoryEvent`，沿用既有 import 即可，勿重複宣告。

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/storage/history.test.ts`
Expected: FAIL（`deleteHistory` is not exported / not a function）。

- [ ] **Step 3: 實作**

在 `src/storage/history.ts`：第 1 行的 import 加入 `rmSync`：

```typescript
import { appendFileSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
```

在檔尾新增：

```typescript
export function deleteHistory(root: string, taskId: string): void {
  const p = historyPath(root, taskId);
  if (existsSync(p)) rmSync(p);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/storage/history.test.ts`
Expected: PASS（含新增 2 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/storage/history.ts test/storage/history.test.ts
git commit -m "feat: [taskcli] 新增 deleteHistory 刪除 history sidecar"
```

---

## Task 3: `runMerge` 合併核心

**Files:**
- Create: `src/commands/merge.ts`
- Test: `test/commands/merge.test.ts`

**Interfaces:**
- Consumes: `listTasks`、`readTask`、`writeTask`、`deleteTask`（`src/storage/tasks`）；`appendHistoryEvent`、`listHistoryEvents`、`nextHistoryEventId`、`deleteHistory`（`src/storage/history`）；`hasCycle`（`src/model/deps`）；`parseTags`、`Task`（`src/model/types`）；`nowIso`（`src/model/clock`）。
- Produces: `export interface MergeOpts { source: string; target: string; json?: boolean; now?: () => string }` 與 `export function runMerge(root: string, opts: MergeOpts): string`。非 json 回傳 `已將 <source> 併入 <target>，重接 N 個相依`；json 回傳 `{"target","deleted","repointed":[...]}`。

- [ ] **Step 1: 寫失敗測試**

`test/commands/merge.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { writeTask, readTask, taskPath } from "../../src/storage/tasks";
import { appendHistoryEvent, listHistoryEvents, historyPath } from "../../src/storage/history";
import { runMerge } from "../../src/commands/merge";
import type { Task } from "../../src/model/types";

const NOW = () => "2026-06-25T12:00:00+08:00";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "taskcli-merge-"));
  runInit(root);
  return root;
}

function mkTask(over: Partial<Task> & { id: string; title: string }): Task {
  return {
    type: "feature",
    status: "todo",
    priority: "med",
    tags: [],
    created: "2026-01-01T00:00:00+08:00",
    updated: "2026-01-01T00:00:00+08:00",
    body: "",
    ...over,
  };
}

test("基本併入：刪除 source、保留 target、寫入 history note、更新 target 時間", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  expect(existsSync(taskPath(root, "T-002"))).toBe(false);
  expect(existsSync(taskPath(root, "T-001"))).toBe(true);
  expect(readTask(root, "T-001").updated).toBe("2026-06-25T12:00:00+08:00");
  const events = listHistoryEvents(root, "T-001");
  expect(events.some((e) => e.title === "merged from T-002")).toBe(true);
});

test("入向相依重接到 target 並更新該 task 時間", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  writeTask(root, mkTask({ id: "T-003", title: "dependent", depends_on: ["T-002"] }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  const t3 = readTask(root, "T-003");
  expect(t3.depends_on).toEqual(["T-001"]);
  expect(t3.updated).toBe("2026-06-25T12:00:00+08:00");
});

test("source 的 depends_on 與 tags 聯集併入 target 並去重", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper", tags: ["a"], depends_on: ["T-004"] }));
  writeTask(root, mkTask({ id: "T-002", title: "dup", tags: ["a", "b"], depends_on: ["T-004", "T-005"] }));
  writeTask(root, mkTask({ id: "T-004", title: "x" }));
  writeTask(root, mkTask({ id: "T-005", title: "y" }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  const t = readTask(root, "T-001");
  expect(t.tags).toEqual(["a", "b"]);
  expect(t.depends_on).toEqual(["T-004", "T-005"]);
});

test("重接後移除 target 的自我相依", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper", depends_on: ["T-002"] }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  expect(readTask(root, "T-001").depends_on).toBeUndefined();
});

test("入向相依同時含 source 與 target 時去重", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  writeTask(root, mkTask({ id: "T-003", title: "dependent", depends_on: ["T-001", "T-002"] }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  expect(readTask(root, "T-003").depends_on).toEqual(["T-001"]);
});

test("會造成循環時拒絕且不寫入", () => {
  const root = setup();
  // 合併後 T-003 依賴 T-001、T-001 依賴 T-003 → 形成環
  writeTask(root, mkTask({ id: "T-001", title: "keeper", depends_on: ["T-003"] }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  writeTask(root, mkTask({ id: "T-003", title: "mid", depends_on: ["T-002"] }));
  expect(() => runMerge(root, { source: "T-002", target: "T-001", now: NOW })).toThrow(/循環/);
  expect(existsSync(taskPath(root, "T-002"))).toBe(true);
  expect(readTask(root, "T-003").depends_on).toEqual(["T-002"]);
});

test("source 不存在報錯", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  expect(() => runMerge(root, { source: "T-999", target: "T-001", now: NOW })).toThrow(/找不到 task/);
});

test("target 不存在報錯", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "dup" }));
  expect(() => runMerge(root, { source: "T-001", target: "T-999", now: NOW })).toThrow(/找不到 task/);
});

test("source 等於 target 報錯", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "x" }));
  expect(() => runMerge(root, { source: "T-001", target: "T-001", now: NOW })).toThrow(/不可相同/);
});

test("source 的 history sidecar 一併刪除", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  appendHistoryEvent(root, {
    id: "E-001", task_id: "T-002", type: "note",
    created: "2026-01-01T00:00:00+08:00", body: "hi",
  });
  expect(existsSync(historyPath(root, "T-002"))).toBe(true);
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  expect(existsSync(historyPath(root, "T-002"))).toBe(false);
});

test("--json 輸出 target/deleted/repointed", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  writeTask(root, mkTask({ id: "T-003", title: "dep", depends_on: ["T-002"] }));
  const out = runMerge(root, { source: "T-002", target: "T-001", json: true, now: NOW });
  expect(JSON.parse(out)).toEqual({ target: "T-001", deleted: "T-002", repointed: ["T-003"] });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/commands/merge.test.ts`
Expected: FAIL（`Cannot find module '.../src/commands/merge'`）。

- [ ] **Step 3: 實作**

`src/commands/merge.ts`:

```typescript
import { listTasks, readTask, writeTask, deleteTask } from "../storage/tasks";
import { appendHistoryEvent, listHistoryEvents, nextHistoryEventId, deleteHistory } from "../storage/history";
import { hasCycle } from "../model/deps";
import { nowIso } from "../model/clock";
import { parseTags, type Task } from "../model/types";

export interface MergeOpts {
  source: string;
  target: string;
  json?: boolean;
  now?: () => string;
}

// 將 deps 中的 source 改指向 target，去除自我相依（== ownerId）並去重
function remapDeps(deps: string[] | undefined, ownerId: string, source: string, target: string): string[] {
  const out: string[] = [];
  for (const d of deps ?? []) {
    const mapped = d === source ? target : d;
    if (mapped === ownerId) continue;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

// 空陣列正規化為 undefined，使 frontmatter 不輸出 depends_on
function normalizeDeps(deps: string[]): string[] | undefined {
  return deps.length > 0 ? deps : undefined;
}

function depsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function runMerge(root: string, opts: MergeOpts): string {
  const { source, target } = opts;
  if (source === target) throw new Error("merge 的 source 與 target 不可相同");
  const sourceTask = readTask(root, source); // 不存在則丟「找不到 task：<id>」
  const targetTask = readTask(root, target);
  const now = (opts.now ?? nowIso)();
  const all = listTasks(root);

  // 1. target 的新 deps（聯集 source）與 tags
  const newTargetDeps = remapDeps(
    [...(targetTask.depends_on ?? []), ...(sourceTask.depends_on ?? [])],
    target,
    source,
    target,
  );
  const newTargetTags = parseTags([...targetTask.tags, ...sourceTask.tags]);

  // 2. 其餘 task 的入向相依重接（只記錄實際有變動者）
  const repointed: string[] = [];
  const rewrites = new Map<string, Task>();
  for (const t of all) {
    if (t.id === source || t.id === target) continue;
    const next = remapDeps(t.depends_on, t.id, source, target);
    if (!depsEqual(next, t.depends_on ?? [])) {
      rewrites.set(t.id, { ...t, depends_on: normalizeDeps(next), updated: now });
      repointed.push(t.id);
    }
  }

  // 3. 合併後完整相依圖（排除 source），循環檢查；通過才落盤
  const graph = new Map<string, string[]>();
  for (const t of all) {
    if (t.id === source) continue;
    if (t.id === target) {
      graph.set(target, newTargetDeps);
      continue;
    }
    const rw = rewrites.get(t.id);
    graph.set(t.id, (rw ? rw.depends_on : t.depends_on) ?? []);
  }
  if (hasCycle(graph)) throw new Error(`merge 會造成循環相依，已取消：${source} → ${target}`);

  // 4. 落盤
  const updatedTarget: Task = {
    ...targetTask,
    tags: newTargetTags,
    depends_on: normalizeDeps(newTargetDeps),
    updated: now,
  };
  writeTask(root, updatedTarget);
  for (const t of rewrites.values()) writeTask(root, t);

  // 5. target history 記 merge note
  appendHistoryEvent(
    root,
    {
      id: nextHistoryEventId(listHistoryEvents(root, target)),
      task_id: target,
      type: "note",
      created: now,
      title: `merged from ${source}`,
      body: `將 ${source}（${sourceTask.title}）併入 ${target}`,
    },
    target,
  );

  // 6. 刪除 source 與其 history sidecar
  deleteTask(root, source);
  deleteHistory(root, source);

  if (opts.json) return JSON.stringify({ target, deleted: source, repointed });
  return `已將 ${source} 併入 ${target}，重接 ${repointed.length} 個相依`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/commands/merge.test.ts`
Expected: PASS（11 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/commands/merge.ts test/commands/merge.test.ts
git commit -m "feat: [taskcli] 新增 merge 合併核心邏輯"
```

---

## Task 4: CLI 串接 `merge` 指令

**Files:**
- Modify: `src/cli.ts`
- Test: `test/commands/merge.test.ts`（追加 CLI 整合測試）

**Interfaces:**
- Consumes: `runMerge`（Task 3）。
- Produces: CLI 子指令 `taskcli merge <source-id> --into <target-id> [--json]`。

- [ ] **Step 1: 寫失敗整合測試（追加到 `test/commands/merge.test.ts` 檔尾）**

```typescript
const CLI = join(import.meta.dir, "..", "..", "src", "cli.ts");

test("CLI merge 透過 --into 合併並回報", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  const r = Bun.spawnSync(["bun", CLI, "merge", "T-002", "--into", "T-001"], { cwd: root });
  expect(r.exitCode).toBe(0);
  expect(r.stdout.toString()).toContain("已將 T-002 併入 T-001");
});

test("CLI merge 缺 --into 報錯 exit 1", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "x" }));
  const r = Bun.spawnSync(["bun", CLI, "merge", "T-001"], { cwd: root });
  expect(r.exitCode).toBe(1);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/commands/merge.test.ts`
Expected: 新增 2 tests FAIL（CLI 回 `未知指令：merge`、exit 1，第一個測試斷言 stdout 不含預期字串而失敗）。

- [ ] **Step 3: 實作**

在 `src/cli.ts`：

(a) 於 import 區（與其他 `runX` import 相鄰）新增：

```typescript
import { runMerge } from "./commands/merge";
```

(b) 在 `USAGE` 字串中 `rm <id>` 那一行之後新增一行：

```
  merge <source> --into <target> [--json]      合併重複 task（重接相依後刪除來源）
```

(c) 在 `switch (cmd)` 內、`case "rm":` 區塊之後新增：

```typescript
      case "merge": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: { into: { type: "string" }, json: { type: "boolean" } },
          allowPositionals: true,
        });
        const source = positionals[0];
        if (!source) fail("merge 需要 <source-id>");
        if (!values.into) fail("merge 需要 --into <target-id>");
        process.stdout.write(`${runMerge(requireRoot(cwd), {
          source,
          target: values.into,
          json: values.json,
        })}\n`);
        return;
      }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/commands/merge.test.ts`
Expected: PASS（13 tests）。

- [ ] **Step 5: 跑全測試確認無回歸**

Run: `bun test`
Expected: 全綠。

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts test/commands/merge.test.ts
git commit -m "feat: [taskcli] CLI 串接 merge 指令"
```

---

## Task 5: SKILL.md 建立防重與清理指引

**Files:**
- Modify: `skills/taskcli/SKILL.md`
- Test: `test/skill-content.test.ts`（追加斷言）

**Interfaces:** 無程式介面；新增 agent 行為說明（英文）。

- [ ] **Step 1: 寫失敗測試（追加到 `test/skill-content.test.ts` 檔尾）**

```typescript
test("SKILL.md 含建立前防重與 merge 清理指引", () => {
  const body = md();
  expect(body).toMatch(/Check for duplicates/i);
  expect(body).toMatch(/taskcli merge/);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/skill-content.test.ts`
Expected: FAIL（找不到 `Check for duplicates` / `taskcli merge`）。

- [ ] **Step 3: 實作**

在 `skills/taskcli/SKILL.md`：

(a) 在 `## Step 2: Create a draft` 這一行**之前**插入新區塊：

```markdown
## Step 2: Check for duplicates before creating

TaskCli does not detect duplicates for you — semantic matching is your job.
Before creating tasks, check each item against what already exists:

1. Fetch existing tasks: `taskcli list --json` (for large sets, narrow with `--query <keyword>`).
2. Compare each item you are about to create against existing tasks **semantically**, not just by literal title match.
3. De-duplicate within the batch itself (the same thing described twice).
4. For each suspected duplicate, surface it to the user and let them choose:
   - **Skip** — don't create this item.
   - **Create anyway** — it is genuinely different.
   - **Update existing** — fold the new info into the existing task with `taskcli update <id> ...`.
5. Proceed to draft creation only for the items the user wants to create.

```

(b) 將後續四個步驟標題依序 +1 改號：

- `## Step 2: Create a draft` → `## Step 3: Create a draft`
- `## Step 3: Ask the user to review (important)` → `## Step 4: Ask the user to review (important)`
- `## Step 4: Finalize` → `## Step 5: Finalize`
- `## Step 5: Track and manage` → `## Step 6: Track and manage`

(c) 在改號後的 `## Step 6: Track and manage` 區段、其表格**之後**新增：

```markdown
### Cleaning up duplicate tasks

To consolidate duplicates that already exist:

1. `taskcli list --json` and group tasks that are semantically the same; surface the groups to the user to confirm.
2. After confirmation, fold any useful content into the task to keep with `taskcli update <keeper> ...`.
3. Merge the redundant task into the keeper with `taskcli merge <duplicate> --into <keeper>`. This repoints any task that depended on the duplicate, unions its tags and dependencies into the keeper, records a history note, and deletes the duplicate — leaving no dangling dependencies.
```

> 改號時注意：`finalize` 步驟內文若提到「Step 4」等字樣需一併核對，但現行內文未以數字互相引用，僅標題編號改變即可。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/skill-content.test.ts`
Expected: PASS（含原有與新增斷言）。

- [ ] **Step 5: Commit**

```bash
git add skills/taskcli/SKILL.md test/skill-content.test.ts
git commit -m "docs: [taskcli] SKILL.md 新增建立防重與 merge 清理指引"
```

---

## Task 6: README 與 CHANGELOG 文件

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:** 無。

- [ ] **Step 1: README 指令一覽加入 merge**

在 `README.md` 的「指令一覽」表格中，`show <id> ... / done <id> / rm <id>` 那一列**之後**新增：

```markdown
| `merge <source> --into <target> [--json]` | 合併重複 task：重接入向相依、聯集來源 tags/depends_on、記 history note 後刪除來源 |
```

並在該節「常用補充」程式碼區塊末尾新增一行範例：

```bash
taskcli merge T-005 --into T-002              # 把重複的 T-005 併入 T-002
```

- [ ] **Step 2: CHANGELOG 記錄**

在 `CHANGELOG.md` 的 `## [Unreleased]` 之下新增（若無 `### Added` 小節則一併新增）：

```markdown
### Added

- 新增 `taskcli merge <source> --into <target> [--json]`：合併重複 task——將指向來源的相依重接到目標、聯集來源的 `tags`/`depends_on`、於目標 history 記一筆 note，再刪除來源與其 sidecar；會拒絕造成循環相依的合併。
- `skills/taskcli/SKILL.md` 新增「建立前語意防重」步驟與「事後合併重複」清理指引。
```

- [ ] **Step 3: 跑全測試與建置確認**

Run: `bun test && bun run build`
Expected: 測試全綠、build exit 0。

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: [taskcli] 補 merge 指令說明與 CHANGELOG"
```

---

## Self-Review

**Spec coverage：**
- 建立時防重（agent 行為）→ Task 5 ✅
- `list --json` 撈候選（既有，無需改）→ 已於 SKILL.md 引用 ✅
- `merge` 語法 / 行為（重接入向相依、聯集 deps+tags、history note、刪 source、更新時間戳）→ Task 3 ✅
- 邊界（source==target、不存在、自我相依移除、相依去重、循環拒絕、原子性「通過才落盤」）→ Task 3 測試與實作（循環檢查在落盤前）✅
- `--json` 輸出 → Task 3 ✅
- CLI 分派 + USAGE → Task 4 ✅
- 測試（含 skill 斷言）→ Task 1–5 ✅
- 文件（README/CHANGELOG/USAGE/SKILL.md）→ Task 4（USAGE）、5（SKILL）、6（README/CHANGELOG）✅

**Placeholder scan：** 無 TBD/TODO，所有步驟含完整可貼上的程式碼與指令。

**Type consistency：** `runMerge(root, MergeOpts)` 簽章、`MergeOpts` 欄位（source/target/json/now）、`hasCycle(Map<string,string[]>)`、`deleteHistory(root, taskId)` 在各 Task 間一致；`remapDeps`/`normalizeDeps`/`depsEqual` 為 merge.ts 內部函式，僅 Task 3 使用。history note 用 `type: "note"`（屬 `TASK_HISTORY_EVENT_TYPES`，合法）。
