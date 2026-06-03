# TaskCli Slack 整合實作計畫（Phase 1：純文字 slash command）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `taskcli slack` 指令，以 Slack Socket Mode 啟動一個前景常駐 bot，讓使用者從 Slack 用 `/task` slash command 對單一固定 repo 的 `.taskcli/` 做讀取（list/next/show）、建立（add）、改狀態（wip/done）。

**Architecture:** bot 是 taskCli 的第三種前端，行程內直接呼叫既有 `src/commands/tasks.ts` 的 `runList`/`runNext`/`runShow`/`runAdd`/`runUpdate`/`runDone`（核心邏輯零改動）。新增 `src/slack/` 模組，把「解析、授權、動作分派、格式化」拆成純函式（可單元測試），Bolt/Socket 連線集中在極薄的 `bot.ts`（不寫單元測試）。`src/commands/slack.ts` 負責載入設定與啟動，`cli.ts` 新增 `case "slack"`。

**Tech Stack:** Bun、TypeScript、`@slack/bolt`（Socket Mode）、`bun:test`。

---

## 重要前提（實作前必讀）

- **command 函式吃的是 repo root（含 `.taskcli/` 的目錄），不是 `.taskcli/` 本身。** 它們內部用 `tasksDir(root)` 等推導路徑。因此 bot 設定檔的 `repoPath` 指的是「repo 根目錄」，bot 用 `findRoot(repoPath)` 驗證並取得 root。
- **token 只走 env var**（`SLACK_BOT_TOKEN`、`SLACK_APP_TOKEN`），絕不寫進設定檔、不進 git。
- `@slack/bolt` 只被 `src/slack/bot.ts` 與（間接）`src/commands/slack.ts` import；其他純函式模組不 import 它，故在依賴安裝前（Task 1～4）那些測試也能跑。

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `src/slack/config.ts`（新增） | 解析 / 驗證 bot 設定檔、讀 env token、把 `repoPath` 解析成 repo root |
| `src/slack/auth.ts`（新增） | user ID allowlist 檢查（純函式） |
| `src/slack/router.ts`（新增） | 解析 `/task <sub> <args>` → `ParsedCommand`（純函式）＋ help 文字 |
| `src/slack/actions.ts`（新增） | `ParsedCommand` → 呼叫對應 command 函式，回傳結果字串 |
| `src/slack/format.ts`（新增） | 結果字串 → Slack 訊息（phase 1：code block；phase 2 的接縫） |
| `src/slack/bot.ts`（新增） | Bolt App、Socket Mode、`/task` handler（極薄、不寫單元測試） |
| `src/commands/slack.ts`（新增） | 載入設定 → 啟動 bot 的串接進入點 |
| `src/cli.ts`（修改） | 新增 `case "slack"` 與 USAGE 一行 |
| `test/slack/config.test.ts` 等（新增） | 各純函式單元測試＋ runSlack/CLI 邊界測試 |
| `README.md`、`CHANGELOG.md`（修改） | 文件 |

---

## Task 1: 安裝 `@slack/bolt` 依賴

**Files:**
- Modify: `package.json`（新增 dependency）

- [ ] **Step 1: 安裝依賴**

Run:
```bash
bun add @slack/bolt
```
Expected: `package.json` 出現 `"dependencies": { "@slack/bolt": "^x.y.z" }`，`bun.lock` 更新。

- [ ] **Step 2: 確認可被 import（冒煙測試）**

Run:
```bash
bun -e "import bolt from '@slack/bolt'; console.log(typeof bolt.App)"
```
Expected: 輸出 `function`。

- [ ] **Step 3: 確認既有測試仍綠**

Run: `bun test`
Expected: 全部 PASS（新增依賴不影響既有功能）。

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: [taskcli] 新增 @slack/bolt 依賴"
```

---

## Task 2: `src/slack/auth.ts` — allowlist 檢查

**Files:**
- Create: `src/slack/auth.ts`
- Test: `test/slack/auth.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `test/slack/auth.test.ts`:
```ts
import { expect, test } from "bun:test";
import { isAllowed } from "../../src/slack/auth";

test("在清單內回 true", () => {
  expect(isAllowed("U1", ["U1", "U2"])).toBe(true);
});

test("不在清單內回 false", () => {
  expect(isAllowed("U9", ["U1", "U2"])).toBe(false);
});

test("空清單一律 false", () => {
  expect(isAllowed("U1", [])).toBe(false);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/slack/auth.test.ts`
Expected: FAIL（找不到模組 `../../src/slack/auth`）。

- [ ] **Step 3: 寫最小實作**

Create `src/slack/auth.ts`:
```ts
/** 檢查 Slack user ID 是否在允許清單內。 */
export function isAllowed(userId: string, allowedUserIds: string[]): boolean {
  return allowedUserIds.includes(userId);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/slack/auth.test.ts`
Expected: PASS（3 個）。

- [ ] **Step 5: Commit**

```bash
git add src/slack/auth.ts test/slack/auth.test.ts
git commit -m "feat: [taskcli] slack auth allowlist 檢查"
```

---

## Task 3: `src/slack/router.ts` — 解析 slash command

**Files:**
- Create: `src/slack/router.ts`
- Test: `test/slack/router.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `test/slack/router.test.ts`:
```ts
import { expect, test } from "bun:test";
import { parseCommand } from "../../src/slack/router";

test("空字串與 help 都回 help", () => {
  expect(parseCommand("")).toEqual({ action: "help" });
  expect(parseCommand("help")).toEqual({ action: "help" });
});

test("list 帶可選 status", () => {
  expect(parseCommand("list")).toEqual({ action: "list", status: undefined });
  expect(parseCommand("list todo")).toEqual({ action: "list", status: "todo" });
});

test("next", () => {
  expect(parseCommand("next")).toEqual({ action: "next" });
});

test("show/wip/done 需要合法 ID", () => {
  expect(parseCommand("show T-001")).toEqual({ action: "show", id: "T-001" });
  expect(parseCommand("wip T-12")).toEqual({ action: "wip", id: "T-12" });
  expect(parseCommand("done T-3")).toEqual({ action: "done", id: "T-3" });
  expect(parseCommand("done")).toEqual({ action: "error", message: "done 需要合法 task ID（如 T-001）" });
  expect(parseCommand("show X1")).toEqual({ action: "error", message: "show 需要合法 task ID（如 T-001）" });
});

test("add 解析 #type 與 !priority，其餘併為標題", () => {
  expect(parseCommand("add 修 README #docs !high")).toEqual({
    action: "add", title: "修 README", type: "docs", priority: "high",
  });
  expect(parseCommand("add 只有標題")).toEqual({
    action: "add", title: "只有標題", type: undefined, priority: undefined,
  });
  expect(parseCommand("add #docs !high")).toEqual({ action: "error", message: "add 需要非空白標題" });
});

test("未知子指令回 error", () => {
  expect(parseCommand("foo bar")).toEqual({ action: "error", message: "未知子指令：foo" });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/slack/router.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫最小實作**

Create `src/slack/router.ts`:
```ts
export type ParsedCommand =
  | { action: "list"; status?: string }
  | { action: "next" }
  | { action: "show"; id: string }
  | { action: "add"; title: string; type?: string; priority?: string }
  | { action: "wip"; id: string }
  | { action: "done"; id: string }
  | { action: "help" }
  | { action: "error"; message: string };

/** 純文字 help（不含 markdown backtick，方便整段包進 code block）。 */
export const SLACK_HELP = [
  "可用指令：",
  "  /task list [status]                  列出 task",
  "  /task next                           下一個可執行 task",
  "  /task show T-001                     顯示 task",
  "  /task add 標題 [#type] [!priority]   建立 task",
  "  /task wip T-001                      標記進行中",
  "  /task done T-001                     標記完成",
].join("\n");

const ID_RE = /^T-\d+$/;

/** 解析 slash command 的 text 部分（不含前綴 "/task"）。 */
export function parseCommand(text: string): ParsedCommand {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const sub = tokens[0];
  const rest = tokens.slice(1);
  if (!sub || sub === "help") return { action: "help" };

  switch (sub) {
    case "list":
      return { action: "list", status: rest[0] };
    case "next":
      return { action: "next" };
    case "show":
    case "wip":
    case "done": {
      const id = rest[0];
      if (!id || !ID_RE.test(id)) {
        return { action: "error", message: `${sub} 需要合法 task ID（如 T-001）` };
      }
      return { action: sub, id };
    }
    case "add": {
      let type: string | undefined;
      let priority: string | undefined;
      const titleParts: string[] = [];
      for (const tok of rest) {
        if (tok.startsWith("#")) type = tok.slice(1);
        else if (tok.startsWith("!")) priority = tok.slice(1);
        else titleParts.push(tok);
      }
      const title = titleParts.join(" ").trim();
      if (!title) return { action: "error", message: "add 需要非空白標題" };
      return { action: "add", title, type, priority };
    }
    default:
      return { action: "error", message: `未知子指令：${sub}` };
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/slack/router.test.ts`
Expected: PASS（全部）。

- [ ] **Step 5: Commit**

```bash
git add src/slack/router.ts test/slack/router.test.ts
git commit -m "feat: [taskcli] slack slash command 解析器"
```

---

## Task 4: `src/slack/format.ts` — 結果包成 Slack 訊息

**Files:**
- Create: `src/slack/format.ts`
- Test: `test/slack/format.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `test/slack/format.test.ts`:
```ts
import { expect, test } from "bun:test";
import { formatResult } from "../../src/slack/format";

test("把結果包進三引號 code block", () => {
  expect(formatResult("T-001  [todo]  hello")).toBe("```\nT-001  [todo]  hello\n```");
});

test("多行結果保留換行", () => {
  expect(formatResult("a\nb")).toBe("```\na\nb\n```");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/slack/format.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫最小實作**

Create `src/slack/format.ts`:
```ts
/**
 * 把動作結果字串包成 Slack 訊息。
 * Phase 1：用三引號 code block 取得等寬排版（task 列表對齊好讀）。
 * Phase 2 會在此改吐 Block Kit；呼叫端契約不變。
 */
export function formatResult(text: string): string {
  return "```\n" + text + "\n```";
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/slack/format.test.ts`
Expected: PASS（2 個）。

- [ ] **Step 5: Commit**

```bash
git add src/slack/format.ts test/slack/format.test.ts
git commit -m "feat: [taskcli] slack 結果格式化（code block）"
```

---

## Task 5: `src/slack/actions.ts` — 分派到 command 函式

**Files:**
- Create: `src/slack/actions.ts`
- Test: `test/slack/actions.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `test/slack/actions.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { runAction } from "../../src/slack/actions";

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "slack-act-"));
  runInit(root);
  return root;
}

const NOW = () => "2026-06-03T00:00:00.000Z";

test("help / error 直接回字串", () => {
  const root = freshRoot();
  expect(runAction(root, { action: "help" })).toContain("可用指令");
  expect(runAction(root, { action: "error", message: "壞掉了" })).toBe("壞掉了");
});

test("add 建立 task，list/show 看得到，done 改狀態", () => {
  const root = freshRoot();
  const added = runAction(root, { action: "add", title: "登入 API", type: "feature", priority: "high" }, { now: NOW });
  expect(added).toContain("T-001");

  expect(runAction(root, { action: "list" })).toContain("T-001");
  expect(runAction(root, { action: "show", id: "T-001" })).toContain("登入 API");

  expect(runAction(root, { action: "wip", id: "T-001" }, { now: NOW })).toContain("T-001");
  expect(runAction(root, { action: "done", id: "T-001" }, { now: NOW })).toContain("T-001");
  expect(runAction(root, { action: "show", id: "T-001" })).toContain("done");
});

test("next 在無可執行 task 時回提示", () => {
  const root = freshRoot();
  expect(runAction(root, { action: "next" })).toContain("沒有可執行");
});

test("未知 ID 由底層函式 throw（交給呼叫端 catch）", () => {
  const root = freshRoot();
  expect(() => runAction(root, { action: "show", id: "T-999" })).toThrow();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/slack/actions.test.ts`
Expected: FAIL（找不到模組 `../../src/slack/actions`）。

- [ ] **Step 3: 寫最小實作**

Create `src/slack/actions.ts`:
```ts
import type { ParsedCommand } from "./router";
import { SLACK_HELP } from "./router";
import { runList, runNext, runShow, runAdd, runUpdate, runDone } from "../commands/tasks";
import type { TaskStatus } from "../model/types";

export interface ActionDeps {
  now?: () => string;
}

/**
 * 把解析後的指令分派到既有 command 函式，回傳人讀字串。
 * 底層函式可能 throw（如 ID 不存在、enum 非法）；由呼叫端（bot.ts）catch 後回友善訊息。
 */
export function runAction(root: string, cmd: ParsedCommand, deps: ActionDeps = {}): string {
  switch (cmd.action) {
    case "help":
      return SLACK_HELP;
    case "error":
      return cmd.message;
    case "list":
      return runList(root, { status: cmd.status as TaskStatus | undefined });
    case "next":
      return runNext(root, {});
    case "show":
      return runShow(root, cmd.id, {});
    case "add":
      return runAdd(root, cmd.title, { type: cmd.type, priority: cmd.priority, now: deps.now });
    case "wip":
      return runUpdate(root, cmd.id, { status: "in_progress", now: deps.now });
    case "done":
      return runDone(root, cmd.id, { now: deps.now });
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/slack/actions.test.ts`
Expected: PASS（全部）。

- [ ] **Step 5: Commit**

```bash
git add src/slack/actions.ts test/slack/actions.test.ts
git commit -m "feat: [taskcli] slack 動作分派至 command 層"
```

---

## Task 6: `src/slack/config.ts` — 設定檔 / token / repo root

**Files:**
- Create: `src/slack/config.ts`
- Test: `test/slack/config.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `test/slack/config.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import {
  defaultConfigPath, parseSlackConfig, loadSlackTokens, resolveRepoRoot,
} from "../../src/slack/config";

test("defaultConfigPath 指向 ~/.config/taskcli/slack.json", () => {
  expect(defaultConfigPath("/home/carl")).toBe("/home/carl/.config/taskcli/slack.json");
});

test("parseSlackConfig 接受合法設定", () => {
  const cfg = parseSlackConfig(JSON.stringify({ repoPath: "/x", allowedUserIds: ["U1"] }));
  expect(cfg).toEqual({ repoPath: "/x", allowedUserIds: ["U1"] });
});

test("parseSlackConfig 拒絕非法 JSON / 缺欄位 / 空 allowlist", () => {
  expect(() => parseSlackConfig("{")).toThrow("不是合法 JSON");
  expect(() => parseSlackConfig(JSON.stringify({ allowedUserIds: ["U1"] }))).toThrow("repoPath");
  expect(() => parseSlackConfig(JSON.stringify({ repoPath: "/x", allowedUserIds: [] }))).toThrow("allowedUserIds");
  expect(() => parseSlackConfig(JSON.stringify({ repoPath: "/x", allowedUserIds: [123] }))).toThrow("allowedUserIds");
});

test("loadSlackTokens 缺 env 時報錯，齊全時回 token", () => {
  expect(() => loadSlackTokens({})).toThrow("SLACK_BOT_TOKEN");
  expect(() => loadSlackTokens({ SLACK_BOT_TOKEN: "b" })).toThrow("SLACK_APP_TOKEN");
  expect(loadSlackTokens({ SLACK_BOT_TOKEN: "b", SLACK_APP_TOKEN: "a" }))
    .toEqual({ botToken: "b", appToken: "a" });
});

test("resolveRepoRoot 在含 .taskcli 的目錄回 root，否則報錯", () => {
  const root = mkdtempSync(join(tmpdir(), "slack-cfg-"));
  runInit(root);
  expect(resolveRepoRoot({ repoPath: root, allowedUserIds: ["U1"] })).toBe(root);
  const bare = mkdtempSync(join(tmpdir(), "slack-bare-"));
  expect(() => resolveRepoRoot({ repoPath: bare, allowedUserIds: ["U1"] })).toThrow("有效的 .taskcli");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/slack/config.test.ts`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫最小實作**

Create `src/slack/config.ts`:
```ts
import { homedir } from "node:os";
import { join } from "node:path";
import { findRoot } from "../storage/paths";

export interface SlackBotConfig {
  repoPath: string;        // repo 根目錄（含 .taskcli/ 的目錄）
  allowedUserIds: string[];
}

export interface SlackTokens {
  botToken: string;
  appToken: string;
}

/** 預設設定檔路徑：~/.config/taskcli/slack.json。 */
export function defaultConfigPath(home: string = homedir()): string {
  return join(home, ".config", "taskcli", "slack.json");
}

/** 解析並驗證設定檔內容（不碰檔案系統）。 */
export function parseSlackConfig(raw: string): SlackBotConfig {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("slack 設定檔不是合法 JSON");
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("slack 設定檔需為物件");
  }
  const o = data as Record<string, unknown>;
  if (typeof o.repoPath !== "string" || o.repoPath.trim() === "") {
    throw new Error("slack 設定檔需要非空字串欄位 repoPath");
  }
  if (
    !Array.isArray(o.allowedUserIds) ||
    o.allowedUserIds.length === 0 ||
    !o.allowedUserIds.every((x) => typeof x === "string" && x.trim() !== "")
  ) {
    throw new Error("slack 設定檔需要非空字串陣列欄位 allowedUserIds");
  }
  return { repoPath: o.repoPath, allowedUserIds: o.allowedUserIds as string[] };
}

/** 從環境變數讀 token，缺任一即 throw。 */
export function loadSlackTokens(env: Record<string, string | undefined>): SlackTokens {
  const botToken = env.SLACK_BOT_TOKEN;
  if (!botToken) throw new Error("缺少環境變數 SLACK_BOT_TOKEN");
  const appToken = env.SLACK_APP_TOKEN;
  if (!appToken) throw new Error("缺少環境變數 SLACK_APP_TOKEN");
  return { botToken, appToken };
}

/** 把設定的 repoPath 解析成 repo root（驗證 .taskcli 存在）。 */
export function resolveRepoRoot(cfg: SlackBotConfig): string {
  const root = findRoot(cfg.repoPath);
  if (!root) {
    throw new Error(`repoPath 不是有效的 .taskcli 工作區：${cfg.repoPath}`);
  }
  return root;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test test/slack/config.test.ts`
Expected: PASS（全部）。

- [ ] **Step 5: Commit**

```bash
git add src/slack/config.ts test/slack/config.test.ts
git commit -m "feat: [taskcli] slack 設定檔 / token / repo root 載入"
```

---

## Task 7: `src/slack/bot.ts` — Bolt / Socket Mode wiring

**Files:**
- Create: `src/slack/bot.ts`

無單元測試（純外部 I/O wiring，極薄）。手動驗證在 Task 9。

- [ ] **Step 1: 寫實作**

Create `src/slack/bot.ts`:
```ts
import bolt from "@slack/bolt";
import { parseCommand } from "./router";
import { runAction } from "./actions";
import { isAllowed } from "./auth";
import { formatResult } from "./format";

const { App } = bolt;

export interface BotOptions {
  botToken: string;
  appToken: string;
  root: string;
  allowedUserIds: string[];
}

/** 啟動 Socket Mode bot，註冊 /task handler。此函式不會 return（app.start 後常駐）。 */
export async function startBot(opts: BotOptions): Promise<void> {
  const app = new App({
    token: opts.botToken,
    appToken: opts.appToken,
    socketMode: true,
  });

  app.command("/task", async ({ command, ack, respond }) => {
    await ack();
    if (!isAllowed(command.user_id, opts.allowedUserIds)) {
      await respond({ response_type: "ephemeral", text: "無權限：你的 Slack user ID 不在允許清單內。" });
      return;
    }
    try {
      const result = runAction(opts.root, parseCommand(command.text ?? ""));
      await respond({ response_type: "ephemeral", text: formatResult(result) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 完整錯誤只記在本機 log，回 Slack 的是 taskcli 既有的 user-safe 訊息
      console.error("[taskcli slack] action 失敗：", e);
      await respond({ response_type: "ephemeral", text: `執行失敗：${msg}` });
    }
  });

  await app.start();
  console.log("⚡ taskcli Slack bot 已啟動（Socket Mode）。按 Ctrl+C 結束。");
}
```

- [ ] **Step 2: 確認可編譯（type check 無誤）**

Run: `bunx tsc --noEmit`
Expected: 無與 `src/slack/bot.ts` 相關的型別錯誤。（若 `import bolt from "@slack/bolt"` 的 default import 報錯，改用 `import * as bolt from "@slack/bolt"` 後重跑。）

- [ ] **Step 3: Commit**

```bash
git add src/slack/bot.ts
git commit -m "feat: [taskcli] slack Bolt/Socket Mode bot wiring"
```

---

## Task 8: `src/commands/slack.ts` + `cli.ts` 串接

**Files:**
- Create: `src/commands/slack.ts`
- Modify: `src/cli.ts`（import、USAGE、`case "slack"`）
- Test: `test/slack/runSlack.test.ts`、`test/slack/cli-slack.test.ts`

- [ ] **Step 1: 寫失敗測試（runSlack 邊界）**

Create `test/slack/runSlack.test.ts`:
```ts
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSlack } from "../../src/commands/slack";

test("找不到設定檔時報友善錯誤（不連線）", async () => {
  await expect(runSlack({ configPath: "/nonexistent/slack.json" }, {}))
    .rejects.toThrow("找不到 slack 設定檔");
});

test("設定檔合法但缺 token 時報錯（不連線）", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slack-run-"));
  const cfgPath = join(dir, "slack.json");
  writeFileSync(cfgPath, JSON.stringify({ repoPath: dir, allowedUserIds: ["U1"] }));
  // env 不含 SLACK_*，應在連線前就因缺 token 而 throw
  await expect(runSlack({ configPath: cfgPath }, {})).rejects.toThrow("SLACK_BOT_TOKEN");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test test/slack/runSlack.test.ts`
Expected: FAIL（找不到模組 `../../src/commands/slack`）。

- [ ] **Step 3: 寫 runSlack 實作**

Create `src/commands/slack.ts`:
```ts
import { readFileSync } from "node:fs";
import {
  defaultConfigPath, parseSlackConfig, loadSlackTokens, resolveRepoRoot,
} from "../slack/config";
import { startBot } from "../slack/bot";

export interface RunSlackOpts {
  configPath?: string;
}

/**
 * 串接：讀設定檔 → 驗證 → 讀 token → 解析 repo root → 啟動 bot。
 * 任一前置驗證失敗都會在連線前 throw，並帶可行動的訊息。
 */
export async function runSlack(
  opts: RunSlackOpts,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const path = opts.configPath ?? defaultConfigPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`找不到 slack 設定檔：${path}（建立後再啟動）`);
  }
  const cfg = parseSlackConfig(raw);
  const tokens = loadSlackTokens(env);
  const root = resolveRepoRoot(cfg);
  await startBot({ ...tokens, root, allowedUserIds: cfg.allowedUserIds });
}
```

- [ ] **Step 4: 跑 runSlack 測試確認通過**

Run: `bun test test/slack/runSlack.test.ts`
Expected: PASS（2 個；皆在連線前 throw，不會 hang）。

- [ ] **Step 5: 在 `cli.ts` 接上指令**

在 `src/cli.ts` 既有 import 區（`runDoctor` import 之後）新增：
```ts
import { runSlack } from "./commands/slack";
```

在 `USAGE` 字串中，`doctor` 那一行之後新增一行：
```
  slack [--config <path>]             啟動 Slack Socket Mode bot（前景常駐）
```

在 `switch (cmd)` 中，`case "doctor"` 區塊之後新增：
```ts
      case "slack": {
        const { values } = parseArgs({
          args: rest,
          options: { config: { type: "string" } },
          allowPositionals: true,
        });
        await runSlack({ configPath: values.config });
        return;
      }
```

- [ ] **Step 6: 寫 CLI 邊界測試**

Create `test/slack/cli-slack.test.ts`:
```ts
import { expect, test } from "bun:test";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/cli.ts");

test("taskcli slack --config <不存在> 報友善錯誤並非零退出", async () => {
  const proc = Bun.spawn(["bun", "run", CLI, "slack", "--config", "/nonexistent/slack.json"], {
    stdout: "pipe", stderr: "pipe",
    env: { PATH: process.env.PATH ?? "" },  // 不帶 SLACK_* token
  });
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  expect(code).not.toBe(0);
  expect(stderr).toContain("找不到 slack 設定檔");
});

test("USAGE 顯示 slack 指令", async () => {
  const proc = Bun.spawn(["bun", "run", CLI, "--help"], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  expect(stdout).toContain("slack");
});
```

- [ ] **Step 7: 跑 CLI 測試確認通過**

Run: `bun test test/slack/cli-slack.test.ts`
Expected: PASS（2 個）。

- [ ] **Step 8: 跑全套測試確認無回歸**

Run: `bun test`
Expected: 全部 PASS。

- [ ] **Step 9: Commit**

```bash
git add src/commands/slack.ts src/cli.ts test/slack/runSlack.test.ts test/slack/cli-slack.test.ts
git commit -m "feat: [taskcli] CLI 串接 slack 指令"
```

---

## Task 9: 文件、編譯驗證、手動冒煙

**Files:**
- Modify: `README.md`、`CHANGELOG.md`

- [ ] **Step 1: 更新 README**

在 `README.md` 的「功能範圍」清單中新增一條：
```markdown
- `slack`：以 Slack Socket Mode 啟動前景常駐 bot，從 Slack 用 `/task` slash command 對單一固定 repo 的 `.taskcli/` 做 list/next/show/add/wip/done（個人本機、user allowlist 授權；token 走 env var）。
```

並新增一節說明設定與啟動：
````markdown
## Slack 整合（個人本機 bot）

```bash
# 設定檔：~/.config/taskcli/slack.json（repoPath 為含 .taskcli 的 repo 根目錄）
# { "repoPath": "/Users/you/Dev/your-repo", "allowedUserIds": ["U0XXXXXXX"] }

export SLACK_BOT_TOKEN=xoxb-...   # scopes: commands, chat:write, users:read
export SLACK_APP_TOKEN=xapp-...   # scope: connections:write（Socket Mode）

taskcli slack                     # 前景啟動，Ctrl+C 結束
```

Slack 內可用：`/task list [status]`、`/task next`、`/task show T-001`、
`/task add 標題 [#type] [!priority]`、`/task wip T-001`、`/task done T-001`、`/task help`。
````

- [ ] **Step 2: 更新 CHANGELOG**

在 `CHANGELOG.md` 最新版本區塊新增條目（沿用既有格式）：
```markdown
- feat: 新增 `taskcli slack` 指令，以 Slack Socket Mode 啟動個人本機 bot，支援從 Slack 操作 list/next/show/add/wip/done（user allowlist 授權、token 走 env var）。
```

- [ ] **Step 3: 編譯單一執行檔，確認 @slack/bolt 可被打包**

Run: `bun run build`
Expected: 產出 `dist/taskcli` 無錯誤。

- [ ] **Step 4: 冒煙——無設定檔時 binary 報友善錯誤**

Run: `./dist/taskcli slack --config /nonexistent/slack.json; echo "exit=$?"`
Expected: 印出含「找不到 slack 設定檔」的訊息，`exit=1`。

- [ ] **Step 5: （需要真實 Slack app 時的手動驗證，選做）**

前置：在 Slack 建立 app、開 Socket Mode、加 `/task` slash command、取得兩個 token、把自己的 user ID 放進 `allowedUserIds`。
```bash
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_APP_TOKEN=xapp-...
taskcli slack --config ~/.config/taskcli/slack.json
```
在 Slack 輸入 `/task help`、`/task add 測試 #chore`、`/task list`、`/task done T-001` 驗證往返。

- [ ] **Step 6: 跑全套測試最終確認**

Run: `bun test`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: [taskcli] 補 slack 指令說明與 CHANGELOG"
```

---

## 完成準則

- `bun test` 全綠，新增 `test/slack/*` 涵蓋 auth / router / format / actions / config / runSlack / CLI 邊界。
- `bun run build` 成功打包含 `@slack/bolt` 的單一執行檔。
- `taskcli slack` 在設定 / token 任一缺失時，於連線前給出可行動錯誤訊息。
- 互動層（router/actions/format）與核心 command 函式分離，Phase 2 加 Block Kit 按鈕時不需改 Phase 1 的契約。
