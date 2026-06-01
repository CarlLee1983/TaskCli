# TaskCli Transcript Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a transcript inbox that stores imported text/audio transcripts under `.taskcli/transcripts/` and exposes them through stable CLI commands without creating tasks directly.

**Architecture:** Add a focused transcript model/storage layer parallel to tasks and drafts, then add command functions for `add`, `list`, `show`, `rm`, and provider-command based `import`. Keep provider execution generic: TaskCli renders `{input}` and `{language}` into a configured shell command, captures stdout as transcript body, and leaves model/API setup to the external command.

**Tech Stack:** Bun CLI, TypeScript strict mode, markdown files with JSON-compatible YAML frontmatter, Bun test, existing TaskCli storage/config/path patterns.

---

## File Structure

Create or modify these files:

- Create: `src/model/transcript.ts`
  - Owns the `Transcript` type plus `serializeTranscript` and `parseTranscript`.
  - Keeps transcript parsing separate from task frontmatter parsing.
- Create: `src/storage/transcripts.ts`
  - Owns `.taskcli/transcripts/` paths, ID listing, read/write/delete, and `TR-NNN` generation use.
- Create: `src/commands/transcript.ts`
  - Owns `runTranscriptAdd`, `runTranscriptList`, `runTranscriptShow`, `runTranscriptRm`, and `runTranscriptImport`.
  - Owns provider command rendering/execution helpers used only by transcript import.
- Modify: `src/storage/paths.ts`
  - Add `transcriptsDir(root)`.
- Modify: `src/storage/ids.ts`
  - Allow `nextId("TR", existingIds)` while keeping existing `T` and `D` behavior.
- Modify: `src/storage/config.ts`
  - Extend resolved config with transcript defaults and provider map.
  - Keep fallback behavior for missing/bad JSON.
- Modify: `src/commands/init.ts`
  - Ensure `.taskcli/transcripts/` exists.
  - Write default transcript config keys for new projects only.
- Modify: `src/cli.ts`
  - Add help text and route the `transcript` command group.
- Modify: `README.md`
  - Document the transcript inbox flow and provider config.
- Create: `test/model/transcript.test.ts`
  - Unit tests for transcript serialization/parsing.
- Create: `test/storage/transcripts.test.ts`
  - Unit tests for transcript storage and deletion.
- Create: `test/commands/transcript.test.ts`
  - Unit tests for command functions, fake provider import, and failure cases.
- Modify: `test/storage/config.test.ts`
  - Cover transcript config parsing and fallback.
- Modify: `test/commands/init.test.ts`
  - Cover `.taskcli/transcripts/` skeleton and config keys.
- Modify: `test/cli.test.ts`
  - Cover end-to-end CLI routing for transcript commands.

---

### Task 1: Transcript model and storage

**Files:**
- Create: `src/model/transcript.ts`
- Create: `src/storage/transcripts.ts`
- Modify: `src/storage/paths.ts`
- Modify: `src/storage/ids.ts`
- Test: `test/model/transcript.test.ts`
- Test: `test/storage/transcripts.test.ts`

- [ ] **Step 1: Write failing model tests**

Create `test/model/transcript.test.ts`:

```ts
import { expect, test } from "bun:test";
import { parseTranscript, serializeTranscript } from "../../src/model/transcript";
import type { Transcript } from "../../src/model/transcript";

function transcript(over: Partial<Transcript> = {}): Transcript {
  return {
    id: "TR-001",
    title: "產品週會錄音",
    source_file: "/tmp/meeting.m4a",
    language: "zh-TW",
    provider: "local-whisper",
    created: "2026-06-01T10:00:00+08:00",
    updated: "2026-06-01T10:00:00+08:00",
    drafts: [],
    tasks: [],
    body: "今天討論三件事。",
    ...over,
  };
}

test("serializeTranscript 輸出 frontmatter 與 body", () => {
  const raw = serializeTranscript(transcript());
  expect(raw).toContain('id: "TR-001"');
  expect(raw).toContain('title: "產品週會錄音"');
  expect(raw).toContain('source_file: "/tmp/meeting.m4a"');
  expect(raw).toContain('language: "zh-TW"');
  expect(raw).toContain('provider: "local-whisper"');
  expect(raw).toContain("drafts: []");
  expect(raw).toContain("tasks: []");
  expect(raw.endsWith("今天討論三件事。")).toBe(true);
});

test("parseTranscript 還原 transcript", () => {
  const parsed = parseTranscript(serializeTranscript(transcript({ drafts: ["D-001"], tasks: ["T-001"] })));
  expect(parsed).toEqual(transcript({ drafts: ["D-001"], tasks: ["T-001"] }));
});

test("parseTranscript 允許沒有 provider", () => {
  const input = transcript({ provider: undefined });
  const parsed = parseTranscript(serializeTranscript(input));
  expect(parsed.provider).toBeUndefined();
  expect(parsed.id).toBe("TR-001");
});

test("parseTranscript 驗證 TR id", () => {
  const raw = serializeTranscript(transcript()).replace('id: "TR-001"', 'id: "T-001"');
  expect(() => parseTranscript(raw)).toThrow(/id/);
});

test("parseTranscript 驗證 drafts 與 tasks id", () => {
  const badDraft = serializeTranscript(transcript({ drafts: ["bad"] }));
  expect(() => parseTranscript(badDraft)).toThrow(/drafts/);

  const badTask = serializeTranscript(transcript({ tasks: ["bad"] }));
  expect(() => parseTranscript(badTask)).toThrow(/tasks/);
});
```

- [ ] **Step 2: Run model test to verify it fails**

Run:

```bash
bun test test/model/transcript.test.ts
```

Expected: FAIL because `src/model/transcript.ts` does not exist.

- [ ] **Step 3: Implement transcript model**

Create `src/model/transcript.ts`:

```ts
export interface Transcript {
  id: string;
  title: string;
  source_file: string;
  language: string;
  provider?: string;
  created: string;
  updated: string;
  drafts: string[];
  tasks: string[];
  body: string;
}

const REQUIRED_FM_KEYS = [
  "id",
  "title",
  "source_file",
  "language",
  "created",
  "updated",
  "drafts",
  "tasks",
] as const;

function parseString(field: string, input: unknown): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`欄位 ${field} 需為非空字串`);
  }
  return input;
}

function parseOptionalString(field: string, input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input !== "string") throw new Error(`欄位 ${field} 需為字串`);
  return input === "" ? undefined : input;
}

function parseIdList(field: "drafts" | "tasks", input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error(`欄位 ${field} 需為陣列`);
  const prefix = field === "drafts" ? "D" : "T";
  const re = new RegExp(`^${prefix}-\\d+$`);
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string" || !re.test(item)) {
      throw new Error(`欄位 ${field} 含非法 ID：${String(item)}`);
    }
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

export function serializeTranscript(t: Transcript): string {
  const lines = [
    "---",
    `id: ${JSON.stringify(t.id)}`,
    `title: ${JSON.stringify(t.title)}`,
    `source_file: ${JSON.stringify(t.source_file)}`,
    `language: ${JSON.stringify(t.language)}`,
  ];
  if (t.provider !== undefined) lines.push(`provider: ${JSON.stringify(t.provider)}`);
  lines.push(
    `created: ${JSON.stringify(t.created)}`,
    `updated: ${JSON.stringify(t.updated)}`,
    `drafts: [${t.drafts.map((x) => JSON.stringify(x)).join(",")}]`,
    `tasks: [${t.tasks.map((x) => JSON.stringify(x)).join(",")}]`,
    "---",
    "",
  );
  return `${lines.join("\n")}${t.body}`;
}

export function parseTranscript(raw: string): Transcript {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("缺少 frontmatter 區塊");
  const [, fmBlock, bodyRaw] = m;
  const fm: Record<string, unknown> = {};
  for (const line of fmBlock!.split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(": ");
    if (idx === -1) throw new Error(`frontmatter 格式錯誤：${line}`);
    const key = line.slice(0, idx).trim();
    const valueRaw = line.slice(idx + 2).trim();
    try {
      fm[key] = JSON.parse(valueRaw);
    } catch {
      throw new Error(`frontmatter 值非合法 JSON：${line}`);
    }
  }
  for (const k of REQUIRED_FM_KEYS) {
    if (!(k in fm)) throw new Error(`frontmatter 缺少欄位：${k}`);
  }

  const id = parseString("id", fm.id);
  if (!/^TR-\d+$/.test(id)) throw new Error(`欄位 id 不合法：${id}，需為 TR-NNN`);

  return {
    id,
    title: parseString("title", fm.title),
    source_file: parseString("source_file", fm.source_file),
    language: parseString("language", fm.language),
    provider: parseOptionalString("provider", fm.provider),
    created: parseString("created", fm.created),
    updated: parseString("updated", fm.updated),
    drafts: parseIdList("drafts", fm.drafts),
    tasks: parseIdList("tasks", fm.tasks),
    body: (bodyRaw ?? "").replace(/^\n/, ""),
  };
}
```

- [ ] **Step 4: Run model test to verify it passes**

Run:

```bash
bun test test/model/transcript.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing storage tests**

Create `test/storage/transcripts.test.ts`:

```ts
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import {
  deleteTranscript,
  listTranscriptIds,
  listTranscripts,
  readTranscript,
  transcriptPath,
  writeTranscript,
} from "../../src/storage/transcripts";
import type { Transcript } from "../../src/model/transcript";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "tr-store-"));
  runInit(root);
  return root;
}

function transcript(id: string, over: Partial<Transcript> = {}): Transcript {
  return {
    id,
    title: `錄音 ${id}`,
    source_file: `/tmp/${id}.m4a`,
    language: "zh-TW",
    provider: "fake",
    created: "2026-06-01T10:00:00+08:00",
    updated: "2026-06-01T10:00:00+08:00",
    drafts: [],
    tasks: [],
    body: "文字稿",
    ...over,
  };
}

test("write/read transcript", () => {
  const root = setup();
  writeTranscript(root, transcript("TR-001", { title: "會議" }));
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(true);
  expect(readTranscript(root, "TR-001").title).toBe("會議");
});

test("listTranscriptIds 依 id 排序", () => {
  const root = setup();
  writeTranscript(root, transcript("TR-002"));
  writeTranscript(root, transcript("TR-001"));
  expect(listTranscriptIds(root)).toEqual(["TR-001", "TR-002"]);
  expect(listTranscripts(root).map((t) => t.id)).toEqual(["TR-001", "TR-002"]);
});

test("deleteTranscript 刪除 transcript 檔案", () => {
  const root = setup();
  writeTranscript(root, transcript("TR-001"));
  deleteTranscript(root, "TR-001");
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});

test("read/delete 找不到 transcript 時丟錯", () => {
  const root = setup();
  expect(() => readTranscript(root, "TR-999")).toThrow(/找不到 transcript/);
  expect(() => deleteTranscript(root, "TR-999")).toThrow(/找不到 transcript/);
});
```

- [ ] **Step 6: Run storage test to verify it fails**

Run:

```bash
bun test test/storage/transcripts.test.ts
```

Expected: FAIL because transcript storage paths/functions do not exist.

- [ ] **Step 7: Add transcript path and ID support**

Modify `src/storage/paths.ts` by adding this function after `historyDir`:

```ts
export function transcriptsDir(root: string): string {
  return join(root, ".taskcli", "transcripts");
}
```

Modify `src/storage/ids.ts` to allow transcript IDs:

```ts
export function nextId(prefix: "T" | "D" | "TR", existingIds: string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existingIds) {
    const m = id.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
```

- [ ] **Step 8: Implement transcript storage**

Create `src/storage/transcripts.ts`:

```ts
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { transcriptsDir } from "./paths";
import { atomicWrite } from "./io";
import { parseTranscript, serializeTranscript, type Transcript } from "../model/transcript";

export function transcriptPath(root: string, id: string): string {
  return join(transcriptsDir(root), `${id}.md`);
}

export function writeTranscript(root: string, t: Transcript): void {
  atomicWrite(transcriptPath(root, t.id), serializeTranscript(t));
}

export function readTranscript(root: string, id: string): Transcript {
  const p = transcriptPath(root, id);
  if (!existsSync(p)) throw new Error(`找不到 transcript：${id}`);
  return parseTranscript(readFileSync(p, "utf8"));
}

export function listTranscriptIds(root: string): string[] {
  const dir = transcriptsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((id) => /^TR-\d+$/.test(id))
    .sort();
}

export function listTranscripts(root: string): Transcript[] {
  return listTranscriptIds(root).map((id) => readTranscript(root, id));
}

export function deleteTranscript(root: string, id: string): void {
  const p = transcriptPath(root, id);
  if (!existsSync(p)) throw new Error(`找不到 transcript：${id}`);
  rmSync(p);
}
```

- [ ] **Step 9: Run model and storage tests**

Run:

```bash
bun test test/model/transcript.test.ts test/storage/transcripts.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

```bash
git add src/model/transcript.ts src/storage/transcripts.ts src/storage/paths.ts src/storage/ids.ts test/model/transcript.test.ts test/storage/transcripts.test.ts
git commit -m "Add transcript storage boundary" -m "Constraint: Transcript records must remain separate from tasks and drafts.\nRejected: Reusing task frontmatter parser | transcript fields and IDs have different validation rules.\nConfidence: high\nScope-risk: narrow\nTested: bun test test/model/transcript.test.ts test/storage/transcripts.test.ts"
```

---

### Task 2: Config and init support

**Files:**
- Modify: `src/storage/config.ts`
- Modify: `src/commands/init.ts`
- Test: `test/storage/config.test.ts`
- Test: `test/commands/init.test.ts`

- [ ] **Step 1: Write failing config tests**

Append to `test/storage/config.test.ts`:

```ts

test("無 transcript config 時回傳 transcript fallback", () => {
  const root = setup();
  expect(loadConfig(root).transcript).toEqual({
    defaultProvider: undefined,
    defaultLanguage: "zh-TW",
    providers: {},
  });
});

test("讀取 transcript provider config", () => {
  const root = setup();
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      transcript: {
        defaultProvider: "fake",
        defaultLanguage: "en",
        providers: {
          fake: { command: "printf hi" },
        },
      },
    }),
    "utf8",
  );
  expect(loadConfig(root).transcript).toEqual({
    defaultProvider: "fake",
    defaultLanguage: "en",
    providers: { fake: { command: "printf hi" } },
  });
});

test("忽略 transcript providers 中沒有 command 的項目", () => {
  const root = setup();
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      transcript: {
        providers: {
          bad: {},
          good: { command: "printf ok" },
        },
      },
    }),
    "utf8",
  );
  expect(loadConfig(root).transcript.providers).toEqual({ good: { command: "printf ok" } });
});
```

- [ ] **Step 2: Run config tests to verify failure**

Run:

```bash
bun test test/storage/config.test.ts
```

Expected: FAIL because `loadConfig(root).transcript` is not defined.

- [ ] **Step 3: Extend config loader**

Replace `src/storage/config.ts` with:

```ts
import { existsSync, readFileSync } from "node:fs";
import { configPath } from "./paths";
import { parseEnum, TASK_TYPES, PRIORITIES, type TaskType, type Priority } from "../model/types";

export interface TranscriptProviderConfig {
  command: string;
}

export interface TranscriptConfig {
  defaultProvider?: string;
  defaultLanguage: string;
  providers: Record<string, TranscriptProviderConfig>;
}

export interface ResolvedConfig {
  defaultType: TaskType;
  defaultPriority: Priority;
  transcript: TranscriptConfig;
}

const FALLBACK: ResolvedConfig = {
  defaultType: "feature",
  defaultPriority: "med",
  transcript: {
    defaultProvider: undefined,
    defaultLanguage: "zh-TW",
    providers: {},
  },
};

function parseTranscriptConfig(input: unknown): TranscriptConfig {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    return { ...FALLBACK.transcript, providers: {} };
  }
  const obj = input as Record<string, unknown>;
  const providers: Record<string, TranscriptProviderConfig> = {};
  if (typeof obj.providers === "object" && obj.providers != null && !Array.isArray(obj.providers)) {
    for (const [name, value] of Object.entries(obj.providers as Record<string, unknown>)) {
      if (typeof value !== "object" || value == null || Array.isArray(value)) continue;
      const command = (value as Record<string, unknown>).command;
      if (typeof command === "string" && command.trim() !== "") {
        providers[name] = { command };
      }
    }
  }
  return {
    defaultProvider: typeof obj.defaultProvider === "string" && obj.defaultProvider.trim() !== ""
      ? obj.defaultProvider
      : undefined,
    defaultLanguage: typeof obj.defaultLanguage === "string" && obj.defaultLanguage.trim() !== ""
      ? obj.defaultLanguage
      : FALLBACK.transcript.defaultLanguage,
    providers,
  };
}

export function loadConfig(root: string): ResolvedConfig {
  const p = configPath(root);
  if (!existsSync(p)) return FALLBACK;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return FALLBACK;
  }
  return {
    defaultType: raw.defaultType
      ? parseEnum("defaultType", raw.defaultType, TASK_TYPES)
      : FALLBACK.defaultType,
    defaultPriority: raw.defaultPriority
      ? parseEnum("defaultPriority", raw.defaultPriority, PRIORITIES)
      : FALLBACK.defaultPriority,
    transcript: parseTranscriptConfig(raw.transcript),
  };
}
```

- [ ] **Step 4: Run config tests**

Run:

```bash
bun test test/storage/config.test.ts test/commands/tasks.test.ts
```

Expected: PASS. `tasks.test.ts` verifies existing `runAdd` behavior still works with the extended config object.

- [ ] **Step 5: Write failing init tests**

Modify the first test in `test/commands/init.test.ts` so it also asserts transcript skeleton/config:

```ts
test("init 建立 .taskcli 骨架與 config", () => {
  const root = mkdtempSync(join(tmpdir(), "init-"));
  const msg = runInit(root);
  expect(existsSync(join(root, ".taskcli/tasks"))).toBe(true);
  expect(existsSync(join(root, ".taskcli/drafts"))).toBe(true);
  expect(existsSync(join(root, ".taskcli/transcripts"))).toBe(true);
  const cfg = JSON.parse(readFileSync(join(root, ".taskcli/config.json"), "utf8"));
  expect(cfg.taskTypes).toContain("feature");
  expect(cfg.transcript.defaultLanguage).toBe("zh-TW");
  expect(cfg.transcript.providers).toEqual({});
  expect(msg).toContain(".taskcli");
});
```

- [ ] **Step 6: Run init tests to verify failure**

Run:

```bash
bun test test/commands/init.test.ts
```

Expected: FAIL because `.taskcli/transcripts` and transcript config are not created.

- [ ] **Step 7: Update init skeleton**

Modify `src/commands/init.ts`:

```ts
import { existsSync } from "node:fs";
import { configPath, tasksDir, draftsDir, taskcliDir, transcriptsDir } from "../storage/paths";
import { ensureDir, atomicWrite } from "../storage/io";
import { TASK_TYPES, PRIORITIES } from "../model/types";

export function runInit(cwd: string): string {
  const existed = existsSync(taskcliDir(cwd));
  ensureDir(tasksDir(cwd));
  ensureDir(draftsDir(cwd));
  ensureDir(transcriptsDir(cwd));
  if (!existsSync(configPath(cwd))) {
    const cfg = {
      taskTypes: [...TASK_TYPES],
      priorities: [...PRIORITIES],
      defaultType: "feature",
      defaultPriority: "med",
      transcript: {
        defaultLanguage: "zh-TW",
        providers: {},
      },
    };
    atomicWrite(configPath(cwd), `${JSON.stringify(cfg, null, 2)}\n`);
  }
  return existed
    ? `.taskcli 已存在，已確保骨架完整：${taskcliDir(cwd)}`
    : `已建立 .taskcli 骨架：${taskcliDir(cwd)}`;
}
```

- [ ] **Step 8: Run config/init tests**

Run:

```bash
bun test test/storage/config.test.ts test/commands/init.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/storage/config.ts src/commands/init.ts test/storage/config.test.ts test/commands/init.test.ts
git commit -m "Prepare config for transcript providers" -m "Constraint: Provider API keys and model setup belong to external commands.\nRejected: Built-in provider SDK config | first version should stay dependency-free.\nConfidence: high\nScope-risk: narrow\nTested: bun test test/storage/config.test.ts test/commands/init.test.ts"
```

---

### Task 3: Transcript command functions

**Files:**
- Create: `src/commands/transcript.ts`
- Test: `test/commands/transcript.test.ts`

- [ ] **Step 1: Write failing command tests for add/list/show/rm**

Create `test/commands/transcript.test.ts`:

```ts
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import {
  runTranscriptAdd,
  runTranscriptList,
  runTranscriptRm,
  runTranscriptShow,
} from "../../src/commands/transcript";
import { transcriptPath } from "../../src/storage/transcripts";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "tr-cmd-"));
  runInit(root);
  return root;
}

test("transcript add --from-file 建立 TR-001", () => {
  const root = setup();
  const source = join(root, "memo.md");
  writeFileSync(source, "記得整理 onboarding 流程\n", "utf8");
  const out = runTranscriptAdd(root, {
    fromFile: source,
    title: "語音備忘",
    language: "zh-TW",
    now: () => "2026-06-01T10:00:00+08:00",
  });
  expect(out).toContain("TR-001");
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(true);
  const shown = JSON.parse(runTranscriptShow(root, "TR-001", { json: true }));
  expect(shown).toMatchObject({
    id: "TR-001",
    title: "語音備忘",
    source_file: source,
    language: "zh-TW",
    drafts: [],
    tasks: [],
    body: "記得整理 onboarding 流程\n",
  });
});

test("transcript add 未提供 title 時用檔名", () => {
  const root = setup();
  const source = join(root, "quick-note.txt");
  writeFileSync(source, "quick note", "utf8");
  runTranscriptAdd(root, {
    fromFile: source,
    now: () => "2026-06-01T10:00:00+08:00",
  });
  const shown = JSON.parse(runTranscriptShow(root, "TR-001", { json: true }));
  expect(shown.title).toBe("quick-note");
  expect(shown.language).toBe("zh-TW");
});

test("transcript list human 與 json output", () => {
  const root = setup();
  const a = join(root, "a.md");
  const b = join(root, "b.md");
  writeFileSync(a, "alpha", "utf8");
  writeFileSync(b, "beta", "utf8");
  runTranscriptAdd(root, { fromFile: a, title: "Alpha", now: () => "2026-06-01T10:00:00+08:00" });
  runTranscriptAdd(root, { fromFile: b, title: "Beta", now: () => "2026-06-01T10:01:00+08:00" });

  expect(runTranscriptList(root, {})).toContain("TR-001  Alpha");
  const parsed = JSON.parse(runTranscriptList(root, { json: true }));
  expect(parsed.map((t: { id: string; title: string }) => [t.id, t.title])).toEqual([
    ["TR-001", "Alpha"],
    ["TR-002", "Beta"],
  ]);
  expect(parsed[0].body).toBeUndefined();
});

test("transcript show human output returns markdown", () => {
  const root = setup();
  const source = join(root, "memo.md");
  writeFileSync(source, "body text", "utf8");
  runTranscriptAdd(root, { fromFile: source, title: "Memo", now: () => "2026-06-01T10:00:00+08:00" });
  const out = runTranscriptShow(root, "TR-001", {});
  expect(out).toContain('id: "TR-001"');
  expect(out).toContain("body text");
});

test("transcript rm 刪除 transcript", () => {
  const root = setup();
  const source = join(root, "memo.md");
  writeFileSync(source, "body", "utf8");
  runTranscriptAdd(root, { fromFile: source, now: () => "2026-06-01T10:00:00+08:00" });
  expect(runTranscriptRm(root, "TR-001")).toContain("TR-001");
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});
```

- [ ] **Step 2: Run command tests to verify failure**

Run:

```bash
bun test test/commands/transcript.test.ts
```

Expected: FAIL because `src/commands/transcript.ts` does not exist.

- [ ] **Step 3: Implement add/list/show/rm command functions**

Create `src/commands/transcript.ts` with the non-import functions first:

```ts
import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { loadConfig } from "../storage/config";
import { nextId } from "../storage/ids";
import {
  deleteTranscript,
  listTranscriptIds,
  listTranscripts,
  readTranscript,
  writeTranscript,
} from "../storage/transcripts";
import { serializeTranscript } from "../model/transcript";
import { nowIso } from "../model/clock";
import type { Transcript } from "../model/transcript";

export interface TranscriptAddOpts {
  fromFile?: string;
  title?: string;
  language?: string;
  now?: () => string;
}

export interface TranscriptListOpts {
  json?: boolean;
}

export interface TranscriptShowOpts {
  json?: boolean;
}

function titleFromPath(path: string): string {
  const base = basename(path);
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

function createTranscript(root: string, input: {
  body: string;
  sourceFile: string;
  title?: string;
  language?: string;
  provider?: string;
  now?: () => string;
}): Transcript {
  const cleanBody = input.body;
  if (cleanBody.trim() === "") throw new Error("transcript 內容不可為空");
  const cfg = loadConfig(root);
  const now = (input.now ?? nowIso)();
  return {
    id: nextId("TR", listTranscriptIds(root)),
    title: input.title?.trim() || titleFromPath(input.sourceFile),
    source_file: input.sourceFile,
    language: input.language?.trim() || cfg.transcript.defaultLanguage,
    provider: input.provider,
    created: now,
    updated: now,
    drafts: [],
    tasks: [],
    body: cleanBody,
  };
}

export function runTranscriptAdd(root: string, opts: TranscriptAddOpts): string {
  if (!opts.fromFile) throw new Error("transcript add 需要 --from-file <file>");
  if (!existsSync(opts.fromFile)) throw new Error(`找不到 transcript 來源檔案：${opts.fromFile}`);
  const body = readFileSync(opts.fromFile, "utf8");
  const transcript = createTranscript(root, {
    body,
    sourceFile: opts.fromFile,
    title: opts.title,
    language: opts.language,
    now: opts.now,
  });
  writeTranscript(root, transcript);
  return `已建立 ${transcript.id}`;
}

export function runTranscriptList(root: string, opts: TranscriptListOpts): string {
  const transcripts = listTranscripts(root);
  if (opts.json) {
    return JSON.stringify(transcripts.map(({ body: _body, ...meta }) => meta), null, 2);
  }
  if (transcripts.length === 0) return "（沒有 transcript）";
  return transcripts.map((t) => `${t.id}  ${t.title}`).join("\n");
}

export function runTranscriptShow(root: string, id: string, opts: TranscriptShowOpts): string {
  const transcript = readTranscript(root, id);
  if (opts.json) return JSON.stringify(transcript, null, 2);
  return serializeTranscript(transcript);
}

export function runTranscriptRm(root: string, id: string): string {
  deleteTranscript(root, id);
  return `已刪除 ${id}`;
}

```

- [ ] **Step 4: Run command tests for current subset**

Run:

```bash
bun test test/commands/transcript.test.ts --grep "transcript add|transcript list|transcript show|transcript rm"
```

Expected: PASS for add/list/show/rm tests.

- [ ] **Step 5: Add failing provider import tests**

First, modify the import block in `test/commands/transcript.test.ts` to include `runTranscriptImport`:

```ts
import {
  runTranscriptAdd,
  runTranscriptImport,
  runTranscriptList,
  runTranscriptRm,
  runTranscriptShow,
} from "../../src/commands/transcript";
```

Then append to `test/commands/transcript.test.ts`:

```ts

test("transcript import 使用 fake provider stdout 建立 transcript", async () => {
  const root = setup();
  const audio = join(root, "meeting.m4a");
  writeFileSync(audio, "fake audio", "utf8");
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      defaultType: "feature",
      defaultPriority: "med",
      transcript: {
        defaultProvider: "fake",
        defaultLanguage: "zh-TW",
        providers: {
          fake: { command: "printf '轉錄 {language} %s\\n' {input}" },
        },
      },
    }),
    "utf8",
  );

  const out = await runTranscriptImport(root, audio, {
    title: "會議錄音",
    now: () => "2026-06-01T10:00:00+08:00",
  });
  expect(out).toContain("TR-001");
  const shown = JSON.parse(runTranscriptShow(root, "TR-001", { json: true }));
  expect(shown).toMatchObject({
    id: "TR-001",
    title: "會議錄音",
    source_file: audio,
    language: "zh-TW",
    provider: "fake",
  });
  expect(shown.body).toContain("轉錄 zh-TW");
  expect(shown.body).toContain(audio);
});

test("transcript import 可用指定 provider 與 language", async () => {
  const root = setup();
  const audio = join(root, "memo.wav");
  writeFileSync(audio, "fake audio", "utf8");
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      transcript: {
        defaultProvider: "unused",
        defaultLanguage: "zh-TW",
        providers: {
          alt: { command: "printf 'lang=%s file=%s' {language} {input}" },
        },
      },
    }),
    "utf8",
  );

  await runTranscriptImport(root, audio, {
    provider: "alt",
    language: "en",
    now: () => "2026-06-01T10:00:00+08:00",
  });
  const shown = JSON.parse(runTranscriptShow(root, "TR-001", { json: true }));
  expect(shown.provider).toBe("alt");
  expect(shown.language).toBe("en");
  expect(shown.body).toContain("lang=en");
});

test("transcript import unknown provider fails clearly", async () => {
  const root = setup();
  const audio = join(root, "meeting.m4a");
  writeFileSync(audio, "fake audio", "utf8");
  await expect(runTranscriptImport(root, audio, { provider: "missing" })).rejects.toThrow(/未知 transcript provider/);
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});

test("transcript import provider failure does not create transcript", async () => {
  const root = setup();
  const audio = join(root, "meeting.m4a");
  writeFileSync(audio, "fake audio", "utf8");
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      transcript: {
        defaultProvider: "failer",
        providers: {
          failer: { command: "printf 'bad provider' >&2; exit 7" },
        },
      },
    }),
    "utf8",
  );
  await expect(runTranscriptImport(root, audio, {})).rejects.toThrow(/bad provider/);
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});

test("transcript import empty stdout fails clearly", async () => {
  const root = setup();
  const audio = join(root, "meeting.m4a");
  writeFileSync(audio, "fake audio", "utf8");
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      transcript: {
        defaultProvider: "empty",
        providers: {
          empty: { command: "printf ''" },
        },
      },
    }),
    "utf8",
  );
  await expect(runTranscriptImport(root, audio, {})).rejects.toThrow(/stdout 為空/);
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});
```

- [ ] **Step 6: Run provider tests to verify failure**

Run:

```bash
bun test test/commands/transcript.test.ts --grep "transcript import"
```

Expected: FAIL because `src/commands/transcript.ts` does not export `runTranscriptImport` yet.

- [ ] **Step 7: Implement provider command rendering and import**

Add `TranscriptImportOpts`, provider helpers, and `runTranscriptImport` to `src/commands/transcript.ts`:

```ts
export interface TranscriptImportOpts {
  provider?: string;
  title?: string;
  language?: string;
  now?: () => string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function renderProviderCommand(command: string, values: { input: string; language: string }): string {
  return command
    .replaceAll("{input}", shellQuote(values.input))
    .replaceAll("{language}", shellQuote(values.language));
}

async function runProviderCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { stdout, stderr, code };
}

export async function runTranscriptImport(root: string, audioFile: string, opts: TranscriptImportOpts): Promise<string> {
  if (!audioFile) throw new Error("transcript import 需要 <audio-file>");
  if (!existsSync(audioFile)) throw new Error(`找不到 audio 檔案：${audioFile}`);
  const cfg = loadConfig(root);
  const providerName = opts.provider ?? cfg.transcript.defaultProvider;
  if (!providerName) throw new Error("未設定 transcript provider，請使用 --provider 或設定 transcript.defaultProvider");
  const provider = cfg.transcript.providers[providerName];
  if (!provider) throw new Error(`未知 transcript provider：${providerName}`);

  const language = opts.language?.trim() || cfg.transcript.defaultLanguage;
  const command = renderProviderCommand(provider.command, { input: audioFile, language });
  const result = await runProviderCommand(command);
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
    throw new Error(`transcript provider ${providerName} 執行失敗：${detail}`);
  }
  if (result.stdout.trim() === "") {
    throw new Error(`transcript provider ${providerName} stdout 為空`);
  }

  const transcript = createTranscript(root, {
    body: result.stdout,
    sourceFile: audioFile,
    title: opts.title,
    language,
    provider: providerName,
    now: opts.now,
  });
  writeTranscript(root, transcript);
  return `已建立 ${transcript.id}`;
}
```

- [ ] **Step 8: Run full transcript command tests**

Run:

```bash
bun test test/commands/transcript.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/commands/transcript.ts test/commands/transcript.test.ts
git commit -m "Add transcript command functions" -m "Constraint: Provider commands must be pluggable and stdout-based.\nRejected: Direct speech SDK integration | would add dependency and key-management scope to TaskCli.\nConfidence: high\nScope-risk: moderate\nDirective: Keep provider execution generic unless a later spec explicitly chooses built-in providers.\nTested: bun test test/commands/transcript.test.ts"
```

---

### Task 4: CLI routing and help text

**Files:**
- Modify: `src/cli.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Append to `test/cli.test.ts`:

```ts

test("transcript add/list/show 經 CLI 運作", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-tr-"));
  await run(root, ["init"]);
  const source = join(root, "memo.md");
  await Bun.write(source, "口頭記錄內容\n");

  const add = await run(root, ["transcript", "add", "--from-file", source, "--title", "口頭記錄"]);
  expect(add.code).toBe(0);
  expect(add.stdout).toContain("TR-001");

  const list = await run(root, ["transcript", "list", "--json"]);
  expect(list.code).toBe(0);
  expect(JSON.parse(list.stdout)[0]).toMatchObject({ id: "TR-001", title: "口頭記錄" });
  expect(JSON.parse(list.stdout)[0].body).toBeUndefined();

  const show = await run(root, ["transcript", "show", "TR-001", "--json"]);
  expect(show.code).toBe(0);
  expect(JSON.parse(show.stdout).body).toBe("口頭記錄內容\n");
});

test("transcript import 經 CLI 使用 fake provider", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-tr-import-"));
  await run(root, ["init"]);
  const audio = join(root, "meeting.m4a");
  await Bun.write(audio, "fake audio");
  await Bun.write(join(root, ".taskcli/config.json"), JSON.stringify({
    transcript: {
      defaultProvider: "fake",
      defaultLanguage: "zh-TW",
      providers: {
        fake: { command: "printf 'cli transcript for %s' {input}" },
      },
    },
  }));

  const imported = await run(root, ["transcript", "import", audio, "--title", "會議"]);
  expect(imported.code).toBe(0);
  expect(imported.stdout).toContain("TR-001");

  const show = await run(root, ["transcript", "show", "TR-001", "--json"]);
  expect(JSON.parse(show.stdout)).toMatchObject({ title: "會議", provider: "fake" });
  expect(JSON.parse(show.stdout).body).toContain("cli transcript for");
});

test("transcript rm 經 CLI 刪除", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-tr-rm-"));
  await run(root, ["init"]);
  const source = join(root, "memo.md");
  await Bun.write(source, "body");
  await run(root, ["transcript", "add", "--from-file", source]);

  const rm = await run(root, ["transcript", "rm", "TR-001"]);
  expect(rm.code).toBe(0);
  expect(rm.stdout).toContain("TR-001");

  const show = await run(root, ["transcript", "show", "TR-001"]);
  expect(show.code).not.toBe(0);
  expect(show.stderr).toContain("找不到 transcript");
});

test("transcript 缺少子指令顯示用法並非零退出", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-tr-none-"));
  await run(root, ["init"]);
  const res = await run(root, ["transcript"]);
  expect(res.code).not.toBe(0);
  expect(res.stderr.toLowerCase()).toContain("usage");
});

test("--help 含 transcript commands", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cli-help-tr-"));
  const res = await run(cwd, ["--help"]);
  expect(res.code).toBe(0);
  expect(res.stdout).toContain("transcript import");
  expect(res.stdout).toContain("transcript show");
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
bun test test/cli.test.ts --grep "transcript|help 含 transcript"
```

Expected: FAIL because `src/cli.ts` does not route `transcript`.

- [ ] **Step 3: Import transcript command functions in CLI**

Add this import near other command imports in `src/cli.ts`:

```ts
import {
  runTranscriptAdd,
  runTranscriptImport,
  runTranscriptList,
  runTranscriptRm,
  runTranscriptShow,
} from "./commands/transcript";
```

- [ ] **Step 4: Update usage text**

Add these lines to `USAGE` in `src/cli.ts` near the history/import commands:

```text
  transcript import <audio-file> [--provider --title --language]   provider command 轉錄音檔並存入 transcript inbox
  transcript add --from-file <file> [--title --language]           匯入既有文字稿
  transcript list [--json]          列出 transcript
  transcript show <id> [--json]     顯示 transcript
  transcript rm <id>                刪除 transcript
```

Add these examples to the `Examples:` block:

```text
  taskcli transcript add --from-file meeting.md --title "產品週會"
  taskcli transcript import meeting.m4a --provider local-whisper --language zh-TW
  taskcli transcript show TR-001 --json
```

- [ ] **Step 5: Add transcript command routing**

Add this `case` to the main `switch` in `src/cli.ts`, before `history` or before `import`:

```ts
      case "transcript": {
        const [sub, ...sr] = rest;
        if (sub === "add") {
          const { values } = parseArgs({
            args: sr,
            options: {
              "from-file": { type: "string" },
              title: { type: "string" },
              language: { type: "string" },
            },
            allowPositionals: true,
          });
          process.stdout.write(`${runTranscriptAdd(requireRoot(cwd), {
            fromFile: values["from-file"],
            title: values.title,
            language: values.language,
          })}\n`);
          return;
        }
        if (sub === "import") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: {
              provider: { type: "string" },
              title: { type: "string" },
              language: { type: "string" },
            },
            allowPositionals: true,
          });
          const audioFile = positionals[0];
          if (!audioFile) fail("transcript import 需要 <audio-file>");
          process.stdout.write(`${await runTranscriptImport(requireRoot(cwd), audioFile, {
            provider: values.provider,
            title: values.title,
            language: values.language,
          })}\n`);
          return;
        }
        if (sub === "list") {
          const { values } = parseArgs({
            args: sr,
            options: { json: { type: "boolean" } },
            allowPositionals: true,
          });
          process.stdout.write(`${runTranscriptList(requireRoot(cwd), { json: values.json })}\n`);
          return;
        }
        if (sub === "show") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: { json: { type: "boolean" } },
            allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("transcript show 需要 <id>");
          process.stdout.write(`${runTranscriptShow(requireRoot(cwd), id, { json: values.json })}\n`);
          return;
        }
        if (sub === "rm") {
          const { positionals } = parseArgs({ args: sr, options: {}, allowPositionals: true });
          const id = positionals[0];
          if (!id) fail("transcript rm 需要 <id>");
          process.stdout.write(`${runTranscriptRm(requireRoot(cwd), id)}\n`);
          return;
        }
        fail(`未知 transcript 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
```

- [ ] **Step 6: Run CLI transcript tests**

Run:

```bash
bun test test/cli.test.ts --grep "transcript|help 含 transcript"
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "Expose transcript inbox in the CLI" -m "Constraint: Transcript commands must feed the existing draft/review workflow without creating tasks.\nRejected: audio-to-task CLI shortcut | would skip review/finalize safety.\nConfidence: high\nScope-risk: narrow\nTested: bun test test/cli.test.ts --grep 'transcript|help 含 transcript'"
```

---

### Task 5: Documentation and full verification

**Files:**
- Modify: `README.md`
- No change: `CHANGELOG.md` in this plan. Release notes can be handled by a separate release task.

- [ ] **Step 1: Update README command overview**

In `README.md`, add this new section before `## task history`:

````md
## transcript inbox（語音 / 文字稿前置整理）

TaskCli 可以把會議錄音、口頭 memo 或外部工具產生的文字稿先存成 transcript record。Transcript 不是正式 task；agent 讀取 transcript 後，再整理成 `draft create` JSON，最後仍走 `review → finalize`。

```bash
# 匯入既有文字稿
taskcli transcript add --from-file meeting.md --title "產品週會"

# 透過 provider command 轉錄音檔
taskcli transcript import meeting.m4a --provider local-whisper --language zh-TW

# 給 agent 讀取
taskcli transcript list --json
taskcli transcript show TR-001 --json
```

Provider 設定放在 `.taskcli/config.json`：

```json
{
  "transcript": {
    "defaultProvider": "local-whisper",
    "defaultLanguage": "zh-TW",
    "providers": {
      "local-whisper": {
        "command": "whisper-cli {input} --language {language} --output -"
      }
    }
  }
}
```

Provider command 必須把文字稿輸出到 stdout。API key、模型安裝、雲端服務設定都由外部 command 或 script 負責。
````

- [ ] **Step 2: Update README command table**

Add these rows to the command table:

```md
| `transcript import <audio-file> [--provider --title --language]` | 使用設定的 provider command 轉錄音檔並存成 transcript |
| `transcript add --from-file <file> [--title --language]` | 匯入既有文字稿 |
| `transcript list/show/rm` | 列出、檢視、刪除 transcript |
```

- [ ] **Step 3: Run targeted transcript tests**

Run:

```bash
bun test test/model/transcript.test.ts test/storage/transcripts.test.ts test/commands/transcript.test.ts test/cli.test.ts --grep "transcript|help 含 transcript"
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 5: Run build**

Run:

```bash
bun run build
```

Expected: build succeeds and writes `dist/taskcli`.

- [ ] **Step 6: Inspect git diff for scope**

Run:

```bash
git diff --stat
git diff -- README.md src test
```

Expected: changes are limited to transcript model/storage/commands, config/init, CLI wiring, tests, and README. No draft/finalize/task behavior changes except `nextId` accepting `TR` and init creating `.taskcli/transcripts`.

- [ ] **Step 7: Commit Task 5**

```bash
git add README.md
git commit -m "Document transcript inbox workflow" -m "Constraint: Users need to understand transcripts are intake records, not approved tasks.\nRejected: Documenting direct task creation from audio | outside first-version scope.\nConfidence: high\nScope-risk: narrow\nTested: bun test; bun run build"
```

---

## Final Verification Checklist

Run these commands after all task commits:

```bash
bun test
bun run build
git status --short
```

Expected:

- `bun test` passes.
- `bun run build` succeeds.
- `git status --short` shows only intentional uncommitted files, if any.
- Existing draft/task/history workflows still pass their tests.
- Transcript import failures do not create `TR-001.md` partial records.

## Spec Coverage Self-Review

- Transcript inbox storage under `.taskcli/transcripts/`: covered by Tasks 1 and 2.
- `transcript import/add/list/show/rm`: covered by Tasks 3 and 4.
- Provider command config with `{input}` and `{language}`: covered by Tasks 2 and 3.
- No built-in provider SDKs or new dependencies: covered by Task 3 provider-command implementation and Task 5 docs.
- Agent collaboration via JSON reads and existing draft flow: covered by Task 5 README docs; no task-creation code is added.
- Error handling for missing files, unknown provider, provider failure, empty stdout, missing IDs: covered by Tasks 1 and 3 tests.
- Existing tests unaffected: covered by Task 5 full `bun test`.
