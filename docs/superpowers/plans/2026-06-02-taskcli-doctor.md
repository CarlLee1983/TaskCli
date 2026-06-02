# TaskCli `doctor` 指令 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `taskcli doctor [--fix] [--json]` 指令，診斷 `.taskcli/` 工作區的資料完整性，並能安全自動修復無損問題。

**Architecture:** 集中式 `src/doctor/` 模組——`checks.ts`（純函式診斷）、`fixes.ts`（安全修復）、`report.ts`（輸出格式）、`types.ts`（型別），由 `src/commands/doctor.ts` 串接並決定 exit code，`cli.ts` 新增 `doctor` case。診斷與輸出/副作用分離，每群檢查獨立可測。

**Tech Stack:** TypeScript + Bun（`bun:test`）；重用既有 `parseTask`、`storage/*`、`io.ts`（`atomicWrite`/`ensureDir`）。

**Spec:** `docs/superpowers/specs/2026-06-02-taskcli-doctor-design.md`

---

## 檔案結構

- Create: `src/doctor/types.ts` — `Finding` / `CheckResult` / `DoctorReport` / `FixOutcome` 型別。
- Create: `src/doctor/checks.ts` — `runChecks(root): DoctorReport` 與四群組純函式。
- Create: `src/doctor/report.ts` — `formatReport` / `formatJson` / `exitCodeFor`。
- Create: `src/doctor/fixes.ts` — `applyFixes(root, report): FixOutcome[]`。
- Create: `src/commands/doctor.ts` — `runDoctor(root, opts)`。
- Modify: `src/cli.ts` — 新增 `doctor` case 與 USAGE 行。
- Create: `test/doctor/checks.test.ts`、`test/doctor/report.test.ts`、`test/doctor/fixes.test.ts`。
- Modify: `test/cli.test.ts` — doctor end-to-end。
- Modify: `README.md`、`CHANGELOG.md`。

**共用測試夾具**（在每個 doctor 測試檔頂部各自定義）：

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "doctor-"));
  mkdirSync(join(root, ".taskcli/tasks"), { recursive: true });
  mkdirSync(join(root, ".taskcli/drafts"), { recursive: true });
  mkdirSync(join(root, ".taskcli/transcripts"), { recursive: true });
  return root;
}

function writeTaskFile(root: string, fileId: string, content: string): void {
  writeFileSync(join(root, ".taskcli/tasks", `${fileId}.md`), content, "utf8");
}

function validTask(id: string, extra = ""): string {
  return `---\nid: ${JSON.stringify(id)}\ntitle: "t"\ntype: "feature"\nstatus: "todo"\npriority: "med"\ntags: []\n${extra}created: "2026-06-02T10:00:00+08:00"\nupdated: "2026-06-02T10:00:00+08:00"\n---\n`;
}

function codes(report: { checks: { findings: { code: string }[] }[] }): string[] {
  return report.checks.flatMap((c) => c.findings.map((f) => f.code));
}
```

---

### Task 1: 型別與 `runChecks` 骨架

**Files:**
- Create: `src/doctor/types.ts`
- Create: `src/doctor/checks.ts`
- Test: `test/doctor/checks.test.ts`

- [ ] **Step 1: 建立型別檔**

`src/doctor/types.ts`：

```ts
export type Severity = "error" | "warn";

export interface Finding {
  code: string;
  severity: Severity;
  target: string;
  message: string;
  fixable: boolean;
}

export interface CheckResult {
  name: string;
  findings: Finding[];
}

export interface DoctorReport {
  ok: boolean;
  errorCount: number;
  warnCount: number;
  checks: CheckResult[];
}

export interface FixOutcome {
  code: string;
  target: string;
  action: string;
  applied: boolean;
}
```

- [ ] **Step 2: 寫失敗測試（乾淨 repo → ok）**

`test/doctor/checks.test.ts`（含上方「共用測試夾具」）：

```ts
import { expect, test } from "bun:test";
import { runChecks } from "../../src/doctor/checks";

test("乾淨 repo：ok、無 finding", () => {
  const root = makeRepo();
  const report = runChecks(root);
  expect(report.ok).toBe(true);
  expect(report.errorCount).toBe(0);
  expect(report.warnCount).toBe(0);
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `bun test test/doctor/checks.test.ts`
Expected: FAIL（`Cannot find module '../../src/doctor/checks'`）。

- [ ] **Step 4: 實作 checks 骨架（四群組先回空）**

`src/doctor/checks.ts`：

```ts
import { readFileSync } from "node:fs";
import { listTaskIds, taskPath } from "../storage/tasks";
import { parseTask } from "../model/frontmatter";
import type { Task } from "../model/types";
import type { CheckResult, DoctorReport } from "./types";

interface LoadedTask {
  fileId: string;
  task: Task | null;
  parseError: string | null;
}

function loadTasks(root: string): LoadedTask[] {
  return listTaskIds(root).map((fileId) => {
    try {
      const raw = readFileSync(taskPath(root, fileId), "utf8");
      return { fileId, task: parseTask(raw), parseError: null };
    } catch (e) {
      return { fileId, task: null, parseError: e instanceof Error ? e.message : String(e) };
    }
  });
}

function checkLayout(_root: string): CheckResult {
  return { name: "layout", findings: [] };
}
function checkTasks(_loaded: LoadedTask[]): CheckResult {
  return { name: "tasks", findings: [] };
}
function checkDeps(_loaded: LoadedTask[]): CheckResult {
  return { name: "deps", findings: [] };
}
function checkSidecars(_root: string, _loaded: LoadedTask[]): CheckResult {
  return { name: "sidecars", findings: [] };
}

export function runChecks(root: string): DoctorReport {
  const loaded = loadTasks(root);
  const checks: CheckResult[] = [
    checkLayout(root),
    checkTasks(loaded),
    checkDeps(loaded),
    checkSidecars(root, loaded),
  ];
  let errorCount = 0;
  let warnCount = 0;
  for (const c of checks) {
    for (const f of c.findings) {
      if (f.severity === "error") errorCount++;
      else warnCount++;
    }
  }
  return { ok: errorCount === 0, errorCount, warnCount, checks };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `bun test test/doctor/checks.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/doctor/types.ts src/doctor/checks.ts test/doctor/checks.test.ts
git commit -m "feat: [taskcli] doctor checks 骨架與型別"
```

---

### Task 2: layout 檢查

**Files:**
- Modify: `src/doctor/checks.ts`
- Test: `test/doctor/checks.test.ts`

- [ ] **Step 1: 寫失敗測試**

於 `test/doctor/checks.test.ts` 追加：

```ts
import { rmSync, writeFileSync as wf } from "node:fs";

test("缺少 transcripts 目錄 → layout.missing_dir（warn, fixable）", () => {
  const root = makeRepo();
  rmSync(join(root, ".taskcli/transcripts"), { recursive: true });
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "layout")!.findings
    .find((x) => x.code === "layout.missing_dir");
  expect(f).toBeDefined();
  expect(f!.severity).toBe("warn");
  expect(f!.fixable).toBe(true);
  expect(report.warnCount).toBe(1);
});

test("config.json 壞掉 → layout.config_unparsable（error）", () => {
  const root = makeRepo();
  wf(join(root, ".taskcli/config.json"), "not-json", "utf8");
  const report = runChecks(root);
  expect(codes(report)).toContain("layout.config_unparsable");
  expect(report.ok).toBe(false);
});

test("config.defaultType 非法 → layout.config_invalid_enum（warn）", () => {
  const root = makeRepo();
  wf(join(root, ".taskcli/config.json"), JSON.stringify({ defaultType: "bogus" }), "utf8");
  const report = runChecks(root);
  expect(codes(report)).toContain("layout.config_invalid_enum");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/doctor/checks.test.ts`
Expected: FAIL（找不到對應 finding）。

- [ ] **Step 3: 實作 checkLayout**

在 `src/doctor/checks.ts` 頂部 import 補上：

```ts
import { existsSync } from "node:fs";
import { tasksDir, draftsDir, transcriptsDir, configPath } from "../storage/paths";
import { TASK_TYPES, PRIORITIES } from "../model/types";
import type { Finding } from "./types";
```

以下列實作取代既有 `checkLayout` 樁：

```ts
function checkLayout(root: string): CheckResult {
  const findings: Finding[] = [];
  const dirs: [string, string][] = [
    ["tasks", tasksDir(root)],
    ["drafts", draftsDir(root)],
    ["transcripts", transcriptsDir(root)],
  ];
  for (const [name, dir] of dirs) {
    if (!existsSync(dir)) {
      findings.push({
        code: "layout.missing_dir",
        severity: "warn",
        target: `.taskcli/${name}`,
        message: `缺少目錄 .taskcli/${name}`,
        fixable: true,
      });
    }
  }
  const cfgPath = configPath(root);
  if (existsSync(cfgPath)) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
    } catch {
      findings.push({
        code: "layout.config_unparsable",
        severity: "error",
        target: ".taskcli/config.json",
        message: "config.json 無法解析為 JSON",
        fixable: false,
      });
      return { name: "layout", findings };
    }
    if (
      raw.defaultType !== undefined &&
      !(TASK_TYPES as readonly string[]).includes(raw.defaultType as string)
    ) {
      findings.push({
        code: "layout.config_invalid_enum",
        severity: "warn",
        target: ".taskcli/config.json",
        message: `defaultType 不合法：${String(raw.defaultType)}`,
        fixable: false,
      });
    }
    if (
      raw.defaultPriority !== undefined &&
      !(PRIORITIES as readonly string[]).includes(raw.defaultPriority as string)
    ) {
      findings.push({
        code: "layout.config_invalid_enum",
        severity: "warn",
        target: ".taskcli/config.json",
        message: `defaultPriority 不合法：${String(raw.defaultPriority)}`,
        fixable: false,
      });
    }
  }
  return { name: "layout", findings };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/doctor/checks.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/doctor/checks.ts test/doctor/checks.test.ts
git commit -m "feat: [taskcli] doctor layout 檢查"
```

---

### Task 3: tasks 檢查（parse_failed / id_mismatch / duplicate_id）

**Files:**
- Modify: `src/doctor/checks.ts`
- Test: `test/doctor/checks.test.ts`

- [ ] **Step 1: 寫失敗測試**

追加：

```ts
test("壞 frontmatter → task.parse_failed（error）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", "沒有 frontmatter 的內容");
  const report = runChecks(root);
  expect(codes(report)).toContain("task.parse_failed");
  expect(report.ok).toBe(false);
});

test("檔名與 id 不符 → task.id_mismatch（error, fixable）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-007", validTask("T-008"));
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "tasks")!.findings
    .find((x) => x.code === "task.id_mismatch");
  expect(f).toBeDefined();
  expect(f!.target).toBe("T-007");
  expect(f!.fixable).toBe(true);
});

test("重複 id → task.duplicate_id（error）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-300", validTask("T-300"));
  writeTaskFile(root, "T-301", validTask("T-300"));
  const report = runChecks(root);
  expect(codes(report)).toContain("task.duplicate_id");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/doctor/checks.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作 checkTasks**

以下列取代 `checkTasks` 樁：

```ts
function checkTasks(loaded: LoadedTask[]): CheckResult {
  const findings: Finding[] = [];
  const idToFiles = new Map<string, string[]>();
  for (const lt of loaded) {
    if (lt.parseError) {
      findings.push({
        code: "task.parse_failed",
        severity: "error",
        target: lt.fileId,
        message: `frontmatter 解析失敗：${lt.parseError}`,
        fixable: false,
      });
      continue;
    }
    const task = lt.task!;
    if (task.id !== lt.fileId) {
      findings.push({
        code: "task.id_mismatch",
        severity: "error",
        target: lt.fileId,
        message: `檔名與 id 不符（id=${task.id}）`,
        fixable: true,
      });
    }
    const list = idToFiles.get(task.id) ?? [];
    list.push(lt.fileId);
    idToFiles.set(task.id, list);
  }
  for (const [id, files] of idToFiles) {
    if (files.length > 1) {
      findings.push({
        code: "task.duplicate_id",
        severity: "error",
        target: id,
        message: `id ${id} 重複於：${files.join("、")}`,
        fixable: false,
      });
    }
  }
  return { name: "tasks", findings };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/doctor/checks.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/doctor/checks.ts test/doctor/checks.test.ts
git commit -m "feat: [taskcli] doctor task 檔完整性檢查"
```

---

### Task 4: deps 檢查（dangling / cycle / on_cancelled）

**Files:**
- Modify: `src/doctor/checks.ts`
- Test: `test/doctor/checks.test.ts`

- [ ] **Step 1: 寫失敗測試**

追加：

```ts
test("懸空相依 → dep.dangling（error, fixable）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", validTask("T-001", `depends_on: ["T-099"]\n`));
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "deps")!.findings
    .find((x) => x.code === "dep.dangling");
  expect(f).toBeDefined();
  expect(f!.fixable).toBe(true);
});

test("循環相依 → dep.cycle（error）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", validTask("T-001", `depends_on: ["T-002"]\n`));
  writeTaskFile(root, "T-002", validTask("T-002", `depends_on: ["T-001"]\n`));
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "deps")!.findings
    .find((x) => x.code === "dep.cycle");
  expect(f).toBeDefined();
  expect(f!.message).toContain("→");
});

test("相依於已取消 task → dep.on_cancelled（warn）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", validTask("T-001", `depends_on: ["T-002"]\n`));
  writeTaskFile(
    root,
    "T-002",
    validTask("T-002").replace(`status: "todo"`, `status: "cancelled"`),
  );
  const report = runChecks(root);
  const deps = report.checks.find((c) => c.name === "deps")!.findings;
  expect(deps.find((x) => x.code === "dep.on_cancelled")).toBeDefined();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/doctor/checks.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作 checkDeps**

以下列取代 `checkDeps` 樁：

```ts
function checkDeps(loaded: LoadedTask[]): CheckResult {
  const findings: Finding[] = [];
  const tasks = loaded.filter((l) => l.task).map((l) => l.task!) as Task[];
  const byId = new Map<string, Task>();
  for (const t of tasks) if (!byId.has(t.id)) byId.set(t.id, t);

  for (const t of tasks) {
    for (const dep of t.depends_on ?? []) {
      const target = byId.get(dep);
      if (!target) {
        findings.push({
          code: "dep.dangling",
          severity: "error",
          target: t.id,
          message: `懸空相依 ${dep}`,
          fixable: true,
        });
      } else if (target.status === "cancelled") {
        findings.push({
          code: "dep.on_cancelled",
          severity: "warn",
          target: t.id,
          message: `相依於已取消的 ${dep}`,
          fixable: false,
        });
      }
    }
  }

  // 循環偵測：DFS 白/灰/黑著色，只走存在 task 間的邊
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of byId.keys()) color.set(id, WHITE);
  const stack: string[] = [];
  const reported = new Set<string>();

  function dfs(id: string): void {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of byId.get(id)!.depends_on ?? []) {
      if (!byId.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        const start = stack.indexOf(dep);
        const cyc = stack.slice(start).concat(dep);
        const key = [...new Set(cyc)].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          findings.push({
            code: "dep.cycle",
            severity: "error",
            target: cyc[0]!,
            message: `循環相依：${cyc.join(" → ")}`,
            fixable: false,
          });
        }
      } else if (color.get(dep) === WHITE) {
        dfs(dep);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const id of [...byId.keys()].sort()) {
    if (color.get(id) === WHITE) dfs(id);
  }

  return { name: "deps", findings };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/doctor/checks.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/doctor/checks.ts test/doctor/checks.test.ts
git commit -m "feat: [taskcli] doctor 相依關係檢查"
```

---

### Task 5: sidecars 檢查（history / transcript）

**Files:**
- Modify: `src/doctor/checks.ts`
- Test: `test/doctor/checks.test.ts`

- [ ] **Step 1: 寫失敗測試**

追加：

```ts
import { mkdirSync as mk } from "node:fs";

test("history sidecar 對應 task 不存在 → history.orphan（warn）", () => {
  const root = makeRepo();
  mk(join(root, ".taskcli/history"), { recursive: true });
  const ev = { id: "E-001", task_id: "T-099", type: "note", created: "2026-06-02T10:00:00+08:00", body: "x" };
  writeFileSync(join(root, ".taskcli/history/T-099.jsonl"), `${JSON.stringify(ev)}\n`, "utf8");
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "sidecars")!.findings
    .find((x) => x.code === "history.orphan");
  expect(f).toBeDefined();
  expect(f!.severity).toBe("warn");
});

test("history jsonl 壞行 → history.parse_failed（error）", () => {
  const root = makeRepo();
  mk(join(root, ".taskcli/history"), { recursive: true });
  writeTaskFile(root, "T-001", validTask("T-001"));
  writeFileSync(join(root, ".taskcli/history/T-001.jsonl"), "not-json\n", "utf8");
  const report = runChecks(root);
  expect(codes(report)).toContain("history.parse_failed");
});

test("transcript 解析失敗 → transcript.parse_failed（error）", () => {
  const root = makeRepo();
  writeFileSync(join(root, ".taskcli/transcripts/TR-001.md"), "沒有 frontmatter", "utf8");
  const report = runChecks(root);
  expect(codes(report)).toContain("transcript.parse_failed");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/doctor/checks.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作 checkSidecars**

在 import 區補上：

```ts
import { readdirSync } from "node:fs";
import { historyDir } from "../storage/paths";
import { listHistoryEvents } from "../storage/history";
import { listTranscriptIds, transcriptPath } from "../storage/transcripts";
import { parseTranscript } from "../model/transcript";
```

以下列取代 `checkSidecars` 樁：

```ts
function checkSidecars(root: string, loaded: LoadedTask[]): CheckResult {
  const findings: Finding[] = [];
  const existingIds = new Set(loaded.filter((l) => l.task).map((l) => l.task!.id));

  const hDir = historyDir(root);
  if (existsSync(hDir)) {
    const files = readdirSync(hDir).filter((x) => x.endsWith(".jsonl")).sort();
    for (const f of files) {
      const taskId = f.slice(0, -".jsonl".length);
      try {
        listHistoryEvents(root, taskId);
      } catch (e) {
        findings.push({
          code: "history.parse_failed",
          severity: "error",
          target: f,
          message: e instanceof Error ? e.message : String(e),
          fixable: false,
        });
        continue;
      }
      if (!existingIds.has(taskId)) {
        findings.push({
          code: "history.orphan",
          severity: "warn",
          target: f,
          message: `history sidecar 對應的 task ${taskId} 不存在`,
          fixable: false,
        });
      }
    }
  }

  for (const id of listTranscriptIds(root)) {
    try {
      parseTranscript(readFileSync(transcriptPath(root, id), "utf8"));
    } catch (e) {
      findings.push({
        code: "transcript.parse_failed",
        severity: "error",
        target: id,
        message: e instanceof Error ? e.message : String(e),
        fixable: false,
      });
    }
  }

  return { name: "sidecars", findings };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/doctor/checks.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/doctor/checks.ts test/doctor/checks.test.ts
git commit -m "feat: [taskcli] doctor sidecar 一致性檢查"
```

---

### Task 6: report 輸出與 exit code

**Files:**
- Create: `src/doctor/report.ts`
- Test: `test/doctor/report.test.ts`

- [ ] **Step 1: 寫失敗測試**

`test/doctor/report.test.ts`：

```ts
import { expect, test } from "bun:test";
import { formatReport, formatJson, exitCodeFor } from "../../src/doctor/report";
import type { DoctorReport } from "../../src/doctor/types";

const CLEAN: DoctorReport = { ok: true, errorCount: 0, warnCount: 0, checks: [] };

const WITH_ERROR: DoctorReport = {
  ok: false,
  errorCount: 1,
  warnCount: 1,
  checks: [
    { name: "deps", findings: [
      { code: "dep.dangling", severity: "error", target: "T-001", message: "懸空相依 T-099", fixable: true },
      { code: "dep.on_cancelled", severity: "warn", target: "T-002", message: "相依於已取消的 T-005", fixable: false },
    ] },
  ],
};

test("乾淨報告：顯示一切正常與 task 數", () => {
  const out = formatReport(CLEAN, 12);
  expect(out).toContain("一切正常");
  expect(out).toContain("12 tasks");
});

test("有問題報告：分組、可 --fix 標記、摘要", () => {
  const out = formatReport(WITH_ERROR, 5);
  expect(out).toContain("▎deps");
  expect(out).toContain("[可 --fix]");
  expect(out).toContain("1 error");
  expect(out).toContain("1 warn");
  expect(out).toContain("taskcli doctor --fix");
});

test("exit code：有 error 回 1，否則 0", () => {
  expect(exitCodeFor(WITH_ERROR)).toBe(1);
  expect(exitCodeFor(CLEAN)).toBe(0);
  expect(exitCodeFor({ ...CLEAN, warnCount: 3 })).toBe(0);
});

test("formatJson：--fix 模式含 fixes 欄位", () => {
  const json = JSON.parse(formatJson(CLEAN, [
    { code: "layout.missing_dir", target: ".taskcli/drafts", action: "建立目錄", applied: true },
  ]));
  expect(json.fixes).toHaveLength(1);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/doctor/report.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 實作 report.ts**

```ts
import type { DoctorReport, Finding, FixOutcome } from "./types";

const ICON: Record<string, string> = { error: "✖", warn: "⚠" };

function formatFinding(f: Finding): string {
  const fixTag = f.fixable ? "  [可 --fix]" : "";
  return `  ${ICON[f.severity]} ${f.target}  ${f.message}${fixTag}`;
}

export function formatReport(report: DoctorReport, taskCount: number, fixes?: FixOutcome[]): string {
  const lines: string[] = ["🔎 taskcli doctor", ""];
  if (fixes && fixes.length > 0) {
    lines.push("▎已套用修復");
    for (const fx of fixes) {
      const mark = fx.applied ? "✔" : "·";
      lines.push(`  ${mark} ${fx.target}  ${fx.action}`);
    }
    lines.push("");
  }
  for (const c of report.checks) {
    if (c.findings.length === 0) continue;
    lines.push(`▎${c.name}`);
    for (const f of c.findings) lines.push(formatFinding(f));
    lines.push("");
  }
  if (report.errorCount === 0 && report.warnCount === 0) {
    lines.push(`✅ 一切正常（${taskCount} tasks、0 問題）`);
  } else {
    const anyFixable = report.checks.some((c) => c.findings.some((f) => f.fixable));
    let summary = `摘要：${report.errorCount} error、${report.warnCount} warn。`;
    if (anyFixable) summary += "有可自動修復項，可執行 `taskcli doctor --fix`。";
    lines.push(summary);
  }
  return lines.join("\n");
}

export function formatJson(report: DoctorReport, fixes?: FixOutcome[]): string {
  return JSON.stringify(fixes ? { ...report, fixes } : report, null, 2);
}

export function exitCodeFor(report: DoctorReport): number {
  return report.errorCount > 0 ? 1 : 0;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/doctor/report.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/doctor/report.ts test/doctor/report.test.ts
git commit -m "feat: [taskcli] doctor 報告輸出與 exit code"
```

---

### Task 7: `--fix` 安全修復

**Files:**
- Create: `src/doctor/fixes.ts`
- Test: `test/doctor/fixes.test.ts`

- [ ] **Step 1: 寫失敗測試**

`test/doctor/fixes.test.ts`（含「共用測試夾具」）：

```ts
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { runChecks } from "../../src/doctor/checks";
import { applyFixes } from "../../src/doctor/fixes";

test("missing_dir：建回目錄，重跑乾淨", () => {
  const root = makeRepo();
  rmSync(join(root, ".taskcli/drafts"), { recursive: true });
  applyFixes(root, runChecks(root));
  expect(existsSync(join(root, ".taskcli/drafts"))).toBe(true);
  expect(runChecks(root).warnCount).toBe(0);
});

test("dangling dep：移除懸空相依，保留有效相依", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-002", validTask("T-002"));
  writeTaskFile(root, "T-001", validTask("T-001", `depends_on: ["T-002","T-099"]\n`));
  const outcomes = applyFixes(root, runChecks(root));
  expect(outcomes.some((o) => o.code === "dep.dangling" && o.applied)).toBe(true);
  const after = readFileSync(join(root, ".taskcli/tasks/T-001.md"), "utf8");
  expect(after).toContain("T-002");
  expect(after).not.toContain("T-099");
});

test("id_mismatch：以檔名改寫 id", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-007", validTask("T-008"));
  applyFixes(root, runChecks(root));
  const after = readFileSync(join(root, ".taskcli/tasks/T-007.md"), "utf8");
  expect(after).toContain(`id: "T-007"`);
  expect(runChecks(root).errorCount).toBe(0);
});

test("id_mismatch：目標 id 已被佔用時不修復（applied=false）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-007", validTask("T-007"));  // 已佔用 T-007
  writeTaskFile(root, "T-008", validTask("T-007"));  // 檔名 T-008、id T-007
  const before = readFileSync(join(root, ".taskcli/tasks/T-008.md"), "utf8");
  const outcomes = applyFixes(root, runChecks(root));
  const o = outcomes.find((x) => x.code === "task.id_mismatch" && x.target === "T-008");
  expect(o!.applied).toBe(false);
  expect(readFileSync(join(root, ".taskcli/tasks/T-008.md"), "utf8")).toBe(before);
});

test("不該 fix 的項目原封不動：壞 frontmatter 不被改", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", "壞掉的內容");
  const before = readFileSync(join(root, ".taskcli/tasks/T-001.md"), "utf8");
  applyFixes(root, runChecks(root));
  expect(readFileSync(join(root, ".taskcli/tasks/T-001.md"), "utf8")).toBe(before);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/doctor/fixes.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 實作 fixes.ts**

```ts
import { readFileSync } from "node:fs";
import { ensureDir, atomicWrite } from "../storage/io";
import { tasksDir, draftsDir, transcriptsDir } from "../storage/paths";
import { listTaskIds, taskPath } from "../storage/tasks";
import { parseTask, serializeTask } from "../model/frontmatter";
import type { Task } from "../model/types";
import type { DoctorReport, FixOutcome } from "./types";

const DIR_BY_TARGET: Record<string, (root: string) => string> = {
  ".taskcli/tasks": tasksDir,
  ".taskcli/drafts": draftsDir,
  ".taskcli/transcripts": transcriptsDir,
};

export function applyFixes(root: string, report: DoctorReport): FixOutcome[] {
  const outcomes: FixOutcome[] = [];
  const fixable = report.checks.flatMap((c) => c.findings).filter((f) => f.fixable);

  for (const f of fixable.filter((x) => x.code === "layout.missing_dir")) {
    const dirFn = DIR_BY_TARGET[f.target];
    if (dirFn) {
      ensureDir(dirFn(root));
      outcomes.push({ code: f.code, target: f.target, action: `建立目錄 ${f.target}`, applied: true });
    }
  }

  // 重新載入目前 task 狀態供 id / dep 修復
  const loaded = listTaskIds(root).map((fileId) => {
    try {
      return { fileId, task: parseTask(readFileSync(taskPath(root, fileId), "utf8")) as Task };
    } catch {
      return { fileId, task: null as Task | null };
    }
  });
  const parsed = loaded.filter((l) => l.task) as { fileId: string; task: Task }[];
  const declaredIds = new Set(parsed.map((l) => l.task.id));

  for (const f of fixable.filter((x) => x.code === "task.id_mismatch")) {
    const entry = parsed.find((l) => l.fileId === f.target);
    if (!entry) continue;
    const collision = parsed.some((l) => l.fileId !== f.target && l.task.id === entry.fileId);
    if (collision) {
      outcomes.push({
        code: f.code, target: f.target,
        action: `跳過：id ${entry.fileId} 已被其他 task 佔用`, applied: false,
      });
      continue;
    }
    const updated: Task = { ...entry.task, id: entry.fileId };
    atomicWrite(taskPath(root, entry.fileId), serializeTask(updated));
    declaredIds.delete(entry.task.id);
    declaredIds.add(entry.fileId);
    entry.task = updated;
    outcomes.push({
      code: f.code, target: f.target,
      action: `將 frontmatter id 改為 ${entry.fileId}`, applied: true,
    });
  }

  for (const f of fixable.filter((x) => x.code === "dep.dangling")) {
    const entry = parsed.find((l) => l.fileId === f.target || l.task.id === f.target);
    if (!entry || !entry.task.depends_on) continue;
    const removed = entry.task.depends_on.filter((d) => !declaredIds.has(d));
    if (removed.length === 0) continue;
    const kept = entry.task.depends_on.filter((d) => declaredIds.has(d));
    const updated: Task = { ...entry.task, depends_on: kept.length > 0 ? kept : undefined };
    atomicWrite(taskPath(root, entry.fileId), serializeTask(updated));
    entry.task = updated;
    outcomes.push({
      code: f.code, target: f.target,
      action: `移除懸空相依 ${removed.join("、")}`, applied: true,
    });
  }

  return outcomes;
}
```

注意：`dep.dangling` 對同一 task 可能產生多個 finding（每個懸空 dep 一筆），但 `fixable.filter` 會逐筆處理；第一筆已移除全部懸空 dep，第二筆因 `removed.length === 0` 自然跳過，不會重複寫入。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/doctor/fixes.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/doctor/fixes.ts test/doctor/fixes.test.ts
git commit -m "feat: [taskcli] doctor --fix 安全修復"
```

---

### Task 8: command 串接、CLI wiring 與 end-to-end

**Files:**
- Create: `src/commands/doctor.ts`
- Modify: `src/cli.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: 實作 runDoctor**

`src/commands/doctor.ts`：

```ts
import { runChecks } from "../doctor/checks";
import { applyFixes } from "../doctor/fixes";
import { formatReport, formatJson, exitCodeFor } from "../doctor/report";
import { listTaskIds } from "../storage/tasks";
import type { FixOutcome } from "../doctor/types";

export interface DoctorOpts {
  fix?: boolean;
  json?: boolean;
}

export function runDoctor(root: string, opts: DoctorOpts): { output: string; exitCode: number } {
  let report = runChecks(root);
  let fixes: FixOutcome[] | undefined;
  if (opts.fix) {
    fixes = applyFixes(root, report);
    report = runChecks(root);
  }
  const taskCount = listTaskIds(root).length;
  const output = opts.json ? formatJson(report, fixes) : formatReport(report, taskCount, fixes);
  return { output, exitCode: exitCodeFor(report) };
}
```

- [ ] **Step 2: CLI wiring**

`src/cli.ts`：在頂部 import 區（與其他 command import 並列）加入：

```ts
import { runDoctor } from "./commands/doctor";
```

在 USAGE 字串中（`skill install` 行之後）加入：

```
  doctor [--fix] [--json]             檢查 .taskcli 工作區健康度
```

在 `switch (cmd)` 中（`install-bin` case 之前）加入：

```ts
      case "doctor": {
        const { values } = parseArgs({
          args: rest,
          options: { fix: { type: "boolean" }, json: { type: "boolean" } },
          allowPositionals: true,
        });
        const { output, exitCode } = runDoctor(requireRoot(cwd), {
          fix: values.fix,
          json: values.json,
        });
        process.stdout.write(`${output}\n`);
        if (exitCode !== 0) process.exit(exitCode);
        return;
      }
```

- [ ] **Step 3: 寫 end-to-end 測試**

`test/cli.test.ts` 既有 helper 為 `async run(cwd, args, stdin?)`，回傳 `{ stdout, stderr, code }`，CLI 路徑常數為 `CLI`。先把頂部 import 補上 `writeFileSync`：

```ts
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
```

於檔尾追加：

```ts
test("doctor：乾淨 repo 回 exit 0 與正常訊息", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-doctor-"));
  await run(root, ["init"]);
  const r = await run(root, ["doctor"]);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("一切正常");
});

test("doctor：懸空相依回 exit 1，--fix 後回 0", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-doctor-"));
  await run(root, ["init"]);
  writeFileSync(
    join(root, ".taskcli/tasks/T-001.md"),
    `---\nid: "T-001"\ntitle: "t"\ntype: "feature"\nstatus: "todo"\npriority: "med"\ntags: []\ndepends_on: ["T-099"]\ncreated: "2026-06-02T10:00:00+08:00"\nupdated: "2026-06-02T10:00:00+08:00"\n---\n`,
    "utf8",
  );
  const bad = await run(root, ["doctor"]);
  expect(bad.code).toBe(1);
  const fixed = await run(root, ["doctor", "--fix"]);
  expect(fixed.code).toBe(0);
});

test("doctor --json：輸出可解析的 DoctorReport", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-doctor-"));
  await run(root, ["init"]);
  const r = await run(root, ["doctor", "--json"]);
  const parsed = JSON.parse(r.stdout);
  expect(parsed.ok).toBe(true);
  expect(Array.isArray(parsed.checks)).toBe(true);
});
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/cli.test.ts`
Expected: PASS（三個 doctor 測試與既有測試皆過）。

- [ ] **Step 5: 跑全測試 + build 驗證**

Run: `bun test && bun run build`
Expected: 全數 PASS，`dist/taskcli` 產出成功。

- [ ] **Step 6: Commit**

```bash
git add src/commands/doctor.ts src/cli.ts test/cli.test.ts
git commit -m "feat: [taskcli] CLI 串接 doctor 指令"
```

---

### Task 9: 文件更新

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: README 功能範圍補一條**

在 README「功能範圍」清單末加入：

```markdown
- `doctor`：檢查 `.taskcli/` 工作區健康度（task 完整性、相依關係、目錄與設定、sidecar 一致性），`--fix` 安全修復，`--json` 供 agent 取用。
```

並在「流程」或指令說明處補一行範例：

```markdown
taskcli doctor                        # 診斷工作區
taskcli doctor --fix                  # 安全自動修復
```

- [ ] **Step 2: CHANGELOG 補項**

在 `CHANGELOG.md` 最上方新增（依既有格式）：

```markdown
## [Unreleased]

### Added
- `doctor` 指令：診斷 `.taskcli/` 工作區（task 完整性、相依關係、目錄與設定、sidecar 一致性），支援 `--fix` 安全修復與 `--json` 輸出；有 error 時 exit code 為 1。
```

> 若既有 CHANGELOG 已有 `## [Unreleased]` 區塊，併入其 `### Added` 而非新建。

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: [taskcli] 補 doctor 指令說明"
```

---

## 完成準則

- `bun test` 全綠；`bun run build` 成功。
- `taskcli doctor` 在乾淨 repo 回 exit 0；有壞資料時回 exit 1。
- `taskcli doctor --fix` 能移除懸空相依、補目錄、修正 id 不符，且不動壞檔與需人工判斷的問題。
- `taskcli doctor --json` 輸出可解析的 `DoctorReport`（`--fix` 時含 `fixes`）。
