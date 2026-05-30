# GitHub Issues 匯入（T-004 第一階段）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `taskcli import github` 指令，重用 `gh` CLI 把 GitHub issue 單向匯入為 `.taskcli/tasks/*.md`，以 `source` 欄位達成冪等 upsert。

**Architecture:** 網路邊界全部隔離在 `src/integrations/github.ts`（薄 `gh` 子行程包裝，邏輯抽成純函式 `buildGhArgs`/`parseIssuesJson`）。對映 `src/integrations/issueMapping.ts` 與編排 `src/commands/import.ts` 皆為純函式，後者透過注入 `fetchIssues`/`now` 在無網路下測試。`source` 欄位沿用 T-002 既有的選填欄位模式加入 model 層。

**Tech Stack:** Bun + TypeScript（strict）、`bun:test`、`node:util` parseArgs、`Bun.spawnSync`、`gh` CLI。

**對應 spec：** `docs/superpowers/specs/2026-05-30-taskcli-github-import-design.md`

---

## File Structure

| 檔案 | 動作 | 責任 |
|------|------|------|
| `src/model/types.ts` | 修改 | Task 介面新增選填 `source?: string` |
| `src/model/frontmatter.ts` | 修改 | `source` 的序列化 / 解析 |
| `src/integrations/issueMapping.ts` | 新建 | `issueToTask` 純對映（含 upsert 保留邏輯） |
| `src/integrations/github.ts` | 新建 | `GithubIssue`/`FetchOpts` 型別、純函式 `buildGhArgs`/`parseIssuesJson`、薄包裝 `fetchIssues`/`fetchIssue`/`resolveRepo` |
| `src/commands/import.ts` | 新建 | `runImport(root, opts, deps)` 編排 upsert |
| `src/cli.ts` | 修改 | 分派 `import github`、USAGE 補一行 |
| `test/model/frontmatter.test.ts` | 修改 | source 序列化 / 往返測試 |
| `test/integrations/issueMapping.test.ts` | 新建 | issueToTask 對映與 upsert 測試 |
| `test/integrations/github.test.ts` | 新建 | buildGhArgs / parseIssuesJson 純函式測試 |
| `test/commands/import.test.ts` | 新建 | runImport 新建 / 更新 / 冪等 / dry-run 測試 |
| `README.md`、`skills/taskcli/SKILL.md` | 修改 | 補 `import` 用法 |

---

## Task 1: model 層新增 `source` 欄位

**Files:**
- Modify: `src/model/types.ts`（Task 介面，約第 17–23 行的選填欄位區塊）
- Modify: `src/model/frontmatter.ts:11-35`（serializeTask）、`src/model/frontmatter.ts:68-73`（parseTask 選填還原）
- Test: `test/model/frontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

在 `test/model/frontmatter.test.ts` 末尾新增：

```typescript
test("serializeTask 含 source 時輸出 source 行，往返解析一致", () => {
  const t: Task = {
    id: "T-001", title: "x", type: "feature", status: "todo", priority: "med",
    tags: [], created: "2026-05-30T00:00:00+08:00", updated: "2026-05-30T00:00:00+08:00",
    body: "內文\n", source: "github:owner/repo#42",
  };
  const raw = serializeTask(t);
  expect(raw).toContain(`source: "github:owner/repo#42"`);
  const back = parseTask(raw);
  expect(back.source).toBe("github:owner/repo#42");
});

test("serializeTask 無 source 時不輸出 source 行，解析後為 undefined", () => {
  const t: Task = {
    id: "T-002", title: "y", type: "fix", status: "done", priority: "low",
    tags: [], created: "2026-05-30T00:00:00+08:00", updated: "2026-05-30T00:00:00+08:00",
    body: "",
  };
  const raw = serializeTask(t);
  expect(raw).not.toContain("source:");
  expect(parseTask(raw).source).toBeUndefined();
});
```

確認檔案頂部已 import `serializeTask`/`parseTask`，且有 `import type { Task } from "../../src/model/types";`（若無則補上）。

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/model/frontmatter.test.ts`
Expected: FAIL — `Task` 型別上沒有 `source` 屬性（tsc 報錯 / 執行期 `back.source` 為 undefined 導致第一個測試失敗）。

- [ ] **Step 3: 在 types.ts 加欄位**

`src/model/types.ts` 的 Task 介面選填欄位區塊（緊接 `depends_on?: string[];` 之後）新增：

```typescript
  source?: string;     // 外部來源辨識，如 github:owner/repo#42
```

- [ ] **Step 4: 在 frontmatter.ts 序列化 / 解析**

`src/model/frontmatter.ts` serializeTask 的選填欄位區塊（`depends_on` push 之後、`lines.push(created...)` 之前）新增：

```typescript
  if (t.source !== undefined) lines.push(`source: ${JSON.stringify(t.source)}`);
```

parseTask 的選填還原區塊（`depends_on` 那行之後）新增：

```typescript
  if ("source" in fm) task.source = String(fm.source);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test test/model/frontmatter.test.ts`
Expected: PASS（含新增 2 測試）。

- [ ] **Step 6: Commit**

```bash
git add src/model/types.ts src/model/frontmatter.ts test/model/frontmatter.test.ts
git commit -m "feat: [taskcli] Task 新增 source 欄位（外部來源辨識）"
```

---

## Task 2: `issueToTask` 純對映

**Files:**
- Create: `src/integrations/github.ts`（本 Task 先放型別骨架；Task 3 補函式）
- Create: `src/integrations/issueMapping.ts`
- Test: `test/integrations/issueMapping.test.ts`

說明：`issueToTask` 接收一筆正規化的 `GithubIssue`、`ResolvedConfig`、可選的既有 `Task`（upsert 時傳入）。為避免型別重複定義，`issueMapping.ts` 直接 `import type { GithubIssue } from "./github"`。因此本 Task 先在 `src/integrations/github.ts` 放入下列型別骨架（Task 3 會在同檔補函式）：

```typescript
// src/integrations/github.ts（型別骨架，Task 3 會補上函式）
export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  repo: string; // "owner/repo"
}

export interface FetchOpts {
  repo?: string;
  state?: "open" | "closed" | "all";
  label?: string;
  limit?: number;
}
```

- [ ] **Step 1: Write the failing test**

`test/integrations/issueMapping.test.ts`：

```typescript
import { expect, test } from "bun:test";
import { issueToTask, sourceOf } from "../../src/integrations/issueMapping";
import type { GithubIssue } from "../../src/integrations/github";
import type { ResolvedConfig } from "../../src/storage/config";
import type { Task } from "../../src/model/types";

const CFG: ResolvedConfig = { defaultType: "feature", defaultPriority: "med" };
const NOW = "2026-05-30T12:00:00+08:00";

function issue(over: Partial<GithubIssue> = {}): GithubIssue {
  return {
    number: 42, title: "修 bug", body: "說明", state: "open",
    labels: ["bug", "bug"], assignees: ["carl", "dev2"], repo: "owner/repo",
    ...over,
  };
}

test("sourceOf 產生 github:owner/repo#number", () => {
  expect(sourceOf(issue())).toBe("github:owner/repo#42");
});

test("issueToTask（新建）標準對映，type/priority 取自 config，created=updated=now", () => {
  const t = issueToTask(issue(), CFG, () => NOW);
  expect(t.title).toBe("修 bug");
  expect(t.body).toBe("說明");
  expect(t.status).toBe("todo");              // open -> todo
  expect(t.tags).toEqual(["bug"]);            // 去重
  expect(t.assignee).toBe("carl");            // 取首位
  expect(t.source).toBe("github:owner/repo#42");
  expect(t.type).toBe("feature");
  expect(t.priority).toBe("med");
  expect(t.created).toBe(NOW);
  expect(t.updated).toBe(NOW);
  expect(t.id).toBe("");                       // 新建時 id 由呼叫端配發
});

test("issueToTask closed -> done，空 assignees 不設 assignee", () => {
  const t = issueToTask(issue({ state: "closed", assignees: [] }), CFG, () => NOW);
  expect(t.status).toBe("done");
  expect(t.assignee).toBeUndefined();
});

test("issueToTask（upsert）保留既有 id/created/type/priority/due/depends_on，更新映射欄位與 updated", () => {
  const existing: Task = {
    id: "T-007", title: "舊標題", type: "fix", status: "done", priority: "high",
    tags: ["old"], created: "2026-01-01T00:00:00+08:00", updated: "2026-01-01T00:00:00+08:00",
    body: "舊內文", due: "2026-12-31", depends_on: ["T-001"], source: "github:owner/repo#42",
  };
  const t = issueToTask(issue({ title: "新標題", state: "open" }), CFG, () => NOW, existing);
  expect(t.id).toBe("T-007");                  // 保留
  expect(t.created).toBe("2026-01-01T00:00:00+08:00"); // 保留
  expect(t.type).toBe("fix");                  // 保留（不被 config 覆寫）
  expect(t.priority).toBe("high");             // 保留
  expect(t.due).toBe("2026-12-31");            // 保留
  expect(t.depends_on).toEqual(["T-001"]);     // 保留
  expect(t.title).toBe("新標題");              // 更新
  expect(t.status).toBe("todo");               // 更新（open）
  expect(t.updated).toBe(NOW);                 // 更新
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/integrations/issueMapping.test.ts`
Expected: FAIL — `Cannot find module './issueMapping'`（尚未建立）。

- [ ] **Step 3: 建立 github.ts 型別骨架**

依本 Task 開頭的「型別骨架」內容建立 `src/integrations/github.ts`（只放 `GithubIssue`、`FetchOpts` 兩個 interface）。

- [ ] **Step 4: 實作 issueMapping.ts**

`src/integrations/issueMapping.ts`：

```typescript
import { parseTags, type Task } from "../model/types";
import type { ResolvedConfig } from "../storage/config";
import { nowIso } from "../model/clock";
import type { GithubIssue } from "./github";

/** 由 issue 產生穩定的 source 辨識字串。 */
export function sourceOf(issue: GithubIssue): string {
  return `github:${issue.repo}#${issue.number}`;
}

/**
 * 把 GitHub issue 對映成 Task。
 * - existing 提供時為 upsert：保留 id/created/type/priority 等非映射欄位，只更新映射欄位與 updated。
 * - 未提供時為新建：id 留空字串由呼叫端配發，type/priority 取自 config，created=updated=now。
 */
export function issueToTask(
  issue: GithubIssue,
  cfg: ResolvedConfig,
  now: () => string = nowIso,
  existing?: Task,
): Task {
  const ts = now();
  const mapped = {
    title: issue.title,
    body: issue.body,
    status: issue.state === "closed" ? ("done" as const) : ("todo" as const),
    tags: parseTags(issue.labels),
    assignee: issue.assignees[0],
    source: sourceOf(issue),
  };
  if (existing) {
    return { ...existing, ...mapped, updated: ts };
  }
  return {
    id: "",
    type: cfg.defaultType,
    priority: cfg.defaultPriority,
    created: ts,
    updated: ts,
    ...mapped,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test test/integrations/issueMapping.test.ts`
Expected: PASS（4 測試）。

- [ ] **Step 6: Commit**

```bash
git add src/integrations/github.ts src/integrations/issueMapping.ts test/integrations/issueMapping.test.ts
git commit -m "feat: [taskcli] issueToTask 純對映（含 upsert 保留欄位）"
```

---

## Task 3: `buildGhArgs` / `parseIssuesJson` 純函式

**Files:**
- Modify: `src/integrations/github.ts`（在型別骨架後新增純函式）
- Test: `test/integrations/github.test.ts`

- [ ] **Step 1: Write the failing test**

`test/integrations/github.test.ts`：

```typescript
import { expect, test } from "bun:test";
import { buildGhArgs, parseIssuesJson } from "../../src/integrations/github";

test("buildGhArgs：批次預設 state=open，含 --json 欄位", () => {
  const args = buildGhArgs({ repo: "owner/repo" });
  expect(args.slice(0, 3)).toEqual(["issue", "list", "--repo"]);
  expect(args).toContain("owner/repo");
  expect(args[args.indexOf("--state") + 1]).toBe("open");
  expect(args[args.indexOf("--json") + 1]).toBe("number,title,body,state,labels,assignees");
});

test("buildGhArgs：帶 label/limit/state", () => {
  const args = buildGhArgs({ repo: "o/r", state: "all", label: "bug", limit: 5 });
  expect(args[args.indexOf("--state") + 1]).toBe("all");
  expect(args[args.indexOf("--label") + 1]).toBe("bug");
  expect(args[args.indexOf("--limit") + 1]).toBe("5");
});

test("buildGhArgs：帶 number 時用 issue view，不含 state/label/limit", () => {
  const args = buildGhArgs({ repo: "o/r" }, 42);
  expect(args.slice(0, 2)).toEqual(["issue", "view"]);
  expect(args).toContain("42");
  expect(args).not.toContain("--state");
  expect(args).not.toContain("--limit");
});

test("parseIssuesJson：攤平 labels/assignees，state 轉小寫，回填 repo", () => {
  const raw = JSON.stringify([
    {
      number: 42, title: "t", body: "b", state: "OPEN",
      labels: [{ name: "bug" }, { name: "p1" }],
      assignees: [{ login: "carl" }],
    },
  ]);
  const issues = parseIssuesJson(raw, "owner/repo");
  expect(issues).toHaveLength(1);
  expect(issues[0]).toEqual({
    number: 42, title: "t", body: "b", state: "open",
    labels: ["bug", "p1"], assignees: ["carl"], repo: "owner/repo",
  });
});

test("parseIssuesJson：單一物件（issue view 回傳）也能解析，body 缺值補空字串", () => {
  const raw = JSON.stringify({ number: 7, title: "t", state: "CLOSED", labels: [], assignees: [] });
  const issues = parseIssuesJson(raw, "o/r");
  expect(issues[0].state).toBe("closed");
  expect(issues[0].body).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/integrations/github.test.ts`
Expected: FAIL — `buildGhArgs`/`parseIssuesJson` 尚未從 `github.ts` export。

- [ ] **Step 3: 實作純函式**

在 `src/integrations/github.ts`（型別之後）新增：

```typescript
const JSON_FIELDS = "number,title,body,state,labels,assignees";

/** 依 opts 組出 gh 參數陣列。帶 number 用 `issue view`，否則 `issue list`。 */
export function buildGhArgs(opts: FetchOpts, number?: number): string[] {
  const repo = opts.repo ?? "";
  if (number !== undefined) {
    return ["issue", "view", String(number), "--repo", repo, "--json", JSON_FIELDS];
  }
  const args = ["issue", "list", "--repo", repo, "--state", opts.state ?? "open"];
  if (opts.label) args.push("--label", opts.label);
  if (opts.limit !== undefined) args.push("--limit", String(opts.limit));
  args.push("--json", JSON_FIELDS);
  return args;
}

interface RawIssue {
  number: number;
  title: string;
  body?: string;
  state: string;
  labels?: Array<{ name: string }>;
  assignees?: Array<{ login: string }>;
}

/** 解析 gh --json 輸出（陣列或單一物件）為正規化 GithubIssue[]。 */
export function parseIssuesJson(raw: string, repo: string): GithubIssue[] {
  const parsed = JSON.parse(raw) as RawIssue | RawIssue[];
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((r) => ({
    number: r.number,
    title: r.title,
    body: r.body ?? "",
    state: r.state.toLowerCase() === "closed" ? "closed" : "open",
    labels: (r.labels ?? []).map((l) => l.name),
    assignees: (r.assignees ?? []).map((a) => a.login),
    repo,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/integrations/github.test.ts`
Expected: PASS（5 測試）。

- [ ] **Step 5: Commit**

```bash
git add src/integrations/github.ts test/integrations/github.test.ts
git commit -m "feat: [taskcli] gh 參數組裝與 JSON 解析純函式"
```

---

## Task 4: `fetchIssues` / `fetchIssue` / `resolveRepo` 薄包裝

**Files:**
- Modify: `src/integrations/github.ts`（新增 spawn 薄層）

說明：spawn 薄層不寫單元測試（不打真實 gh / 網路），邏輯都已在 Task 3 的純函式覆蓋。本 Task 只把純函式接到 `Bun.spawnSync`。

- [ ] **Step 1: 實作薄包裝**

在 `src/integrations/github.ts` 末尾新增：

```typescript
function runGh(args: string[]): string {
  let proc;
  try {
    proc = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  } catch {
    throw new Error("找不到 gh CLI，請先安裝 GitHub CLI 並執行 `gh auth login`");
  }
  if (proc.exitCode !== 0) {
    const err = proc.stderr.toString().trim();
    throw new Error(`gh 執行失敗：${err || `exit ${proc.exitCode}`}（請確認已 gh auth login 且 repo 正確）`);
  }
  return proc.stdout.toString();
}

/** repo 未指定時用 gh 從 cwd 推導 owner/repo。 */
export function resolveRepo(opts: FetchOpts): string {
  if (opts.repo) return opts.repo;
  const out = runGh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
  if (!out) throw new Error("無法推導 repo，請用 --repo owner/repo 指定");
  return out;
}

/** 批次抓取 issue。 */
export function fetchIssues(opts: FetchOpts): GithubIssue[] {
  const repo = resolveRepo(opts);
  const raw = runGh(buildGhArgs({ ...opts, repo }));
  return parseIssuesJson(raw, repo);
}

/** 抓取單一 issue。 */
export function fetchIssue(number: number, opts: FetchOpts): GithubIssue[] {
  const repo = resolveRepo(opts);
  const raw = runGh(buildGhArgs({ ...opts, repo }, number));
  return parseIssuesJson(raw, repo);
}
```

- [ ] **Step 2: 確認型別與整體編譯**

Run: `bunx tsc --noEmit`
Expected: 無錯誤輸出（exit 0）。

- [ ] **Step 3: Commit**

```bash
git add src/integrations/github.ts
git commit -m "feat: [taskcli] gh 子行程薄包裝 fetchIssues/fetchIssue/resolveRepo"
```

---

## Task 5: `runImport` 編排（upsert + dry-run）

**Files:**
- Create: `src/commands/import.ts`
- Test: `test/commands/import.test.ts`

- [ ] **Step 1: Write the failing test**

`test/commands/import.test.ts`：

```typescript
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { listTasks } from "../../src/storage/tasks";
import { runImport } from "../../src/commands/import";
import type { GithubIssue, FetchOpts } from "../../src/integrations/github";

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tcli-import-"));
  runInit(root);
  return root;
}

function fakeFetch(issues: GithubIssue[]): (opts: FetchOpts, number?: number) => GithubIssue[] {
  return () => issues;
}

const ISSUE: GithubIssue = {
  number: 42, title: "從 issue 來", body: "內容", state: "open",
  labels: ["bug"], assignees: ["carl"], repo: "owner/repo",
};
const NOW = () => "2026-05-30T12:00:00+08:00";

test("runImport 新建：第一次匯入產生新 task 並寫入 source", () => {
  const root = freshRoot();
  const msg = runImport(root, {}, { fetchIssues: fakeFetch([ISSUE]), now: NOW });
  const tasks = listTasks(root);
  expect(tasks).toHaveLength(1);
  expect(tasks[0].source).toBe("github:owner/repo#42");
  expect(tasks[0].title).toBe("從 issue 來");
  expect(msg).toContain("新建 1");
});

test("runImport 冪等：相同 issue 重跑為更新、不新增 id", () => {
  const root = freshRoot();
  runImport(root, {}, { fetchIssues: fakeFetch([ISSUE]), now: NOW });
  const firstId = listTasks(root)[0].id;
  const updated = { ...ISSUE, title: "標題改了", state: "closed" as const };
  const msg = runImport(root, {}, { fetchIssues: fakeFetch([updated]), now: NOW });
  const tasks = listTasks(root);
  expect(tasks).toHaveLength(1);              // 沒有重複
  expect(tasks[0].id).toBe(firstId);          // id 保留
  expect(tasks[0].title).toBe("標題改了");    // 已更新
  expect(tasks[0].status).toBe("done");       // closed -> done
  expect(msg).toContain("更新 1");
});

test("runImport --dry-run 不寫檔但回報摘要", () => {
  const root = freshRoot();
  const msg = runImport(root, { dryRun: true }, { fetchIssues: fakeFetch([ISSUE]), now: NOW });
  expect(listTasks(root)).toHaveLength(0);    // 沒寫檔
  expect(msg).toContain("dry-run");
  expect(msg).toContain("新建 1");
});

test("runImport 帶 number 時把 number 傳給 fetch", () => {
  const root = freshRoot();
  let calledNumber: number | undefined = -1;
  const fetch = (_opts: FetchOpts, number?: number): GithubIssue[] => {
    calledNumber = number;
    return [ISSUE];
  };
  runImport(root, { number: 42 }, { fetchIssues: fetch, now: NOW });
  expect(calledNumber).toBe(42);
  expect(listTasks(root)).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/commands/import.test.ts`
Expected: FAIL — `Cannot find module '../../src/commands/import'`。

- [ ] **Step 3: 實作 import.ts**

`src/commands/import.ts`：

```typescript
import { listTasks, listTaskIds, writeTask } from "../storage/tasks";
import { nextId } from "../storage/ids";
import { loadConfig } from "../storage/config";
import { nowIso } from "../model/clock";
import { issueToTask, sourceOf } from "../integrations/issueMapping";
import { fetchIssues as realFetchIssues, fetchIssue as realFetchIssue } from "../integrations/github";
import type { FetchOpts, GithubIssue } from "../integrations/github";

export interface ImportOpts extends FetchOpts {
  number?: number;  // 指定單一 issue
  dryRun?: boolean;
}

export interface ImportDeps {
  fetchIssues?: (opts: FetchOpts, number?: number) => GithubIssue[];
  now?: () => string;
}

/** 預設 fetch adapter：有 number 走 fetchIssue，否則 fetchIssues。 */
function defaultFetch(opts: FetchOpts, number?: number): GithubIssue[] {
  return number !== undefined ? realFetchIssue(number, opts) : realFetchIssues(opts);
}

export function runImport(root: string, opts: ImportOpts, deps: ImportDeps = {}): string {
  const fetch = deps.fetchIssues ?? defaultFetch;
  const now = deps.now ?? nowIso;
  const cfg = loadConfig(root);

  const { number, dryRun, ...fetchOpts } = opts;
  const issues = fetch(fetchOpts, number);

  const existing = listTasks(root);
  const bySource = new Map(existing.filter((t) => t.source).map((t) => [t.source!, t]));
  const allocated = listTaskIds(root);

  let created = 0;
  let updated = 0;
  const touched: string[] = [];

  for (const issue of issues) {
    const match = bySource.get(sourceOf(issue));
    if (match) {
      const task = issueToTask(issue, cfg, now, match);
      if (!dryRun) writeTask(root, task);
      updated++;
      touched.push(task.id);
    } else {
      const draft = issueToTask(issue, cfg, now);
      const id = nextId("T", allocated);
      allocated.push(id);
      const task = { ...draft, id };
      if (!dryRun) writeTask(root, task);
      created++;
      touched.push(id);
    }
  }

  const prefix = dryRun ? "[dry-run] " : "";
  const tail = touched.length ? `：${touched.join(", ")}` : "";
  return `${prefix}匯入完成：新建 ${created} 個、更新 ${updated} 個${tail}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/commands/import.test.ts`
Expected: PASS（4 測試）。

- [ ] **Step 5: Commit**

```bash
git add src/commands/import.ts test/commands/import.test.ts
git commit -m "feat: [taskcli] runImport 編排（source upsert + dry-run）"
```

---

## Task 6: cli.ts 分派 `import github`

**Files:**
- Modify: `src/cli.ts`（import 區、USAGE、switch 新增 case）
- Test: `test/cli.test.ts`

- [ ] **Step 1: 先讀 test/cli.test.ts 頂部**

讀 `test/cli.test.ts` 最上方，確認既有的 `run(cwd, args)` helper 與「建立含 `.taskcli` 的暫存 root」做法（多數測試會 `mkdtempSync` + 跑 `init`）。下一步的測試沿用既有 helper，不要新造風格不一致者。

- [ ] **Step 2: Write the failing test**

在 `test/cli.test.ts` 末尾新增（`mkRoot` / `run` 為示意名稱，請替換成該檔實際使用的 helper）：

```typescript
test("import 未知子指令給錯誤訊息並非零退出", async () => {
  const cwd = mkRoot();              // 比照檔內既有：建立暫存目錄並跑 init
  const res = await run(cwd, ["import", "bogus"]);
  expect(res.code).not.toBe(0);
  expect(res.stderr).toContain("import");
});

test("import 無子指令顯示用法並非零退出", async () => {
  const cwd = mkRoot();
  const res = await run(cwd, ["import"]);
  expect(res.code).not.toBe(0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test test/cli.test.ts`
Expected: FAIL — 目前 `import` 落入 default case，錯誤訊息不含 `import` 子指令提示（斷言不符）。

- [ ] **Step 4: 加 import 與 USAGE**

`src/cli.ts` 頂部 import 區新增：

```typescript
import { runImport } from "./commands/import";
import type { FetchOpts } from "./integrations/github";
```

USAGE 字串在 `rm <id>` 那行之後、`install-bin` 之前插入一行：

```
  import github [<n>] [--repo --state --label --limit --dry-run]   從 GitHub Issues 匯入
```

- [ ] **Step 5: 新增 switch case**

在 `case "rm"` 區塊之後（維持與 `draft`/`skill` 一致的子指令分派風格）新增：

```typescript
      case "import": {
        const [sub, ...sr] = rest;
        if (sub === "github") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: {
              repo: { type: "string" }, state: { type: "string" },
              label: { type: "string" }, limit: { type: "string" },
              "dry-run": { type: "boolean" },
            },
            allowPositionals: true,
          });
          const number = positionals[0] ? Number(positionals[0]) : undefined;
          const state = values.state as FetchOpts["state"] | undefined;
          const msg = runImport(requireRoot(cwd), {
            number,
            dryRun: values["dry-run"],
            repo: values.repo,
            state,
            label: values.label,
            limit: values.limit ? Number(values.limit) : undefined,
          });
          process.stdout.write(`${msg}\n`);
          return;
        }
        fail(`未知 import 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
```

> 註：cli.ts 不注入 `deps`，`runImport` 用預設的 `defaultFetch`（依 number 自動選 fetchIssue/fetchIssues）。測試端才注入 fake。

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test test/cli.test.ts`
Expected: PASS。

接著跑全套 + 型別檢查：

Run: `bun test && bunx tsc --noEmit`
Expected: 全部 PASS、tsc exit 0。

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: [taskcli] cli 分派 import github 指令"
```

---

## Task 7: 真實端到端煙霧驗證 + 文件

**Files:**
- Modify: `README.md`、`skills/taskcli/SKILL.md`

- [ ] **Step 1: 真實 gh dry-run 煙霧測試（手動）**

在本 repo（已有 `.taskcli/`、`gh` 已登入）執行：

Run: `bun run src/cli.ts import github --repo CarlLee1983/TaskCli --state all --dry-run`
Expected: 印出 `[dry-run] 匯入完成：新建 N 個、更新 M 個...`（本 repo 目前無 issue 則 N=M=0），且 `git status` 不顯示 `.taskcli/tasks/` 有新增。

> 若要驗證實際寫入，可在 GitHub 建一個測試 issue 後執行不帶 `--dry-run` 的同指令，確認產生對應 `T-NNN.md` 且 frontmatter 含 `source: "github:CarlLee1983/TaskCli#<n>"`；驗畢刪除該測試 task 與 issue。

- [ ] **Step 2: 更新 README**

在 README 指令列表補上 `import github` 用法與一段範例：

````markdown
### 從 GitHub Issues 匯入

需先安裝 GitHub CLI 並 `gh auth login`。

```bash
# 匯入目前 repo 的 open issues（dry-run 先預覽）
taskcli import github --dry-run
taskcli import github

# 指定 repo / 範圍
taskcli import github --repo owner/repo --state all --label bug --limit 50

# 只匯入單一 issue
taskcli import github 42
```

以 `source: github:owner/repo#<n>` 辨識來源，重跑時更新既有 task 而非重建。
注意：import 為單向，re-import 會以 issue 狀態覆寫本地 status。
````

- [ ] **Step 3: 更新 SKILL.md**

在 `skills/taskcli/SKILL.md` 適當段落補一句：當使用者要把 GitHub issue 轉成 task 時，可請使用者執行 `taskcli import github`（或代為組指令），匯入後照常用 list/show/update 追蹤。

- [ ] **Step 4: 全套驗證**

Run: `bun test && bunx tsc --noEmit`
Expected: 全綠、tsc exit 0。

- [ ] **Step 5: 標記 T-004 完成並 commit**

```bash
bun run src/cli.ts done T-004
git add README.md skills/taskcli/SKILL.md .taskcli/tasks/T-004.md
git commit -m "docs: [taskcli] import github 用法說明，T-004 完成"
```

---

## Self-Review 結果

**Spec 覆蓋：** §3 指令介面→Task 6；§4 架構（github/issueMapping/import 三模組）→Task 2–5；§5 欄位對映→Task 2；§6 upsert→Task 5；§7 取捨（status 覆寫、單值 assignee）→Task 2 對映邏輯體現；§8 測試策略→各 Task 的 TDD 步驟；§9 影響（source 欄位、cli、docs）→Task 1、6、7。無遺漏。

**型別一致性：** `GithubIssue`/`FetchOpts`（github.ts）、`ResolvedConfig`（storage/config.ts，既有）、`issueToTask(issue, cfg, now, existing?)`、`sourceOf(issue)`、`buildGhArgs(opts, number?)`、`parseIssuesJson(raw, repo)`、`runImport(root, opts, deps?)`、`ImportDeps.fetchIssues: (opts, number?) => GithubIssue[]` —— 跨 Task 簽名一致；`runImport` 在 Task 5 解構 `{ number, dryRun, ...fetchOpts }` 後把 `fetchOpts` 傳給 fetch，與 cli.ts（Task 6）不注入 deps、走 `defaultFetch` 一致。

**Placeholder 掃描：** 無 TBD/TODO；每個 code step 均含完整程式碼。Task 6 的 `mkRoot`/`run` 標明為「沿用該檔既有 helper」的指引（Step 1 要求先讀檔頂部），非佔位內容。

**修正紀錄：** Task 5 的 `listTaskIds` 改為與 `listTasks`/`writeTask` 同一行 import（`src/storage/tasks.ts` 同時 export 三者），移除草稿階段重複 import；`defaultFetch` 收斂單一 issue 與批次的呼叫選擇，cli 不再需要自組 adapter。
