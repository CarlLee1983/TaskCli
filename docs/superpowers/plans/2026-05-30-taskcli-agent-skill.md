# TaskCli Agent Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 TaskCli 補上 agent skill（`skills/taskcli/SKILL.md`，編譯嵌入 binary）與兩個安裝子指令（`taskcli skill install`、`taskcli install-bin`），讓安裝者把 skill 與 binary 放到自選位置，並讓 Claude 能依 skill 引導完成「整理 → 審閱 → finalize → 追蹤」流程。

**Architecture:** 沿用既有分層。新增 `skills/taskcli/SKILL.md`（版控、`bun build --compile` 經 `import ... with { type: "text" }` 嵌入）、`src/commands/skill.ts`（installSkillTo + runSkillInstall）、`src/commands/installBin.ts`（copyBinaryTo + runInstallBin），並在 `src/cli.ts` 加分派與 USAGE。

**Tech Stack:** Bun、TypeScript（strict）、`bun test`、`node:fs`/`node:os`/`node:path`、Bun text import。

---

## File Structure

```
TaskCli/
  skills/taskcli/SKILL.md     # 新增：agent skill 來源（版控、編譯嵌入）
  src/commands/skill.ts       # 新增：installSkillTo / runSkillInstall / expandHome / SKILL_MD
  src/commands/installBin.ts  # 新增：copyBinaryTo / runInstallBin
  src/cli.ts                  # 修改：加 skill install / install-bin 分派 + USAGE
  test/commands/skill.test.ts       # 新增
  test/commands/installBin.test.ts  # 新增
  test/skill-content.test.ts        # 新增：SKILL.md frontmatter/內容檢查
```

**設計決定：**
- `installSkillTo(destBaseDir, content, force)` 與 `copyBinaryTo(srcPath, destDir)` 為純檔案操作核心，接受明確路徑參數，方便對暫存目錄測試。`runSkillInstall` / `runInstallBin` 是 CLI 包裝（負責預設值、`~` 展開、開發模式偵測），回傳要印出的字串。
- `~` 展開用 `os.homedir()`，集中在一個小 helper `expandHome`（定義在 `skill.ts`，`installBin.ts` 也 import 它）。
- skill 內容來源在 `skill.ts` 內以 `import SKILL_TEXT from "../../skills/taskcli/SKILL.md" with { type: "text" }` 取得並 re-export 為 `SKILL_MD`，編譯時打包。

---

## Task 1: skills/taskcli/SKILL.md

**Files:**
- Create: `skills/taskcli/SKILL.md`
- Test: `test/skill-content.test.ts`

- [ ] **Step 1: Write the failing test** — `test/skill-content.test.ts`

```typescript
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL = resolve(import.meta.dir, "../skills/taskcli/SKILL.md");
const md = () => readFileSync(SKILL, "utf8");

test("SKILL.md 有合法 frontmatter（name/description）", () => {
  const m = md().match(/^---\n([\s\S]*?)\n---\n/);
  expect(m).not.toBeNull();
  const fm = m![1]!;
  expect(fm).toContain("name: taskcli");
  expect(fm).toMatch(/description:\s*\S/);
});

test("SKILL.md 內文含關鍵指令字串", () => {
  const body = md();
  expect(body).toContain("draft create");
  expect(body).toContain("finalize");
  expect(body).toContain("--json");
  expect(body).toContain("review");
});

test("SKILL.md 說明 review 由使用者執行（避免 agent 前景阻塞）", () => {
  const body = md();
  expect(body).toMatch(/review[\s\S]*使用者|使用者[\s\S]*review/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/skill-content.test.ts`
Expected: FAIL（檔案不存在）。

- [ ] **Step 3: Write `skills/taskcli/SKILL.md`**

建立檔案，內容如下（注意：內文示範區塊用四個空白縮排呈現 shell/json，避免與本計畫的 fence 衝突；實際寫入時請用標準三反引號 code fence）：

````markdown
---
name: taskcli
description: 用 taskcli 管理「本專案的開發實作任務」。當使用者用口語或文字描述一批要做的開發工作（功能/修 bug/重構/文件/測試/雜項）、要求整理成 task 清單、或要追蹤管理既有 task（列出/開始/完成/修改）時使用。透過 taskcli CLI 在該 repo 的 .taskcli/ 建立與管理 task。
---

# TaskCli — 用 CLI 管理本專案的開發任務

把使用者口語或文字描述的開發工作，整理成結構化 task，經使用者在本地 HTML 審閱頁確認後正式建立，並追蹤管理。

CLI 純存取、不碰 LLM：自然語言理解與分類由你（agent）完成，再呼叫 `taskcli`。所有讀取型指令一律加 `--json` 方便解析。

## 前置檢查

1. 確認 PATH 有 `taskcli`（`taskcli --help`）。若無，請使用者執行 `taskcli install-bin` 或先 `bun run build`。
2. 確認當前 repo 有 `.taskcli/`。若沒有，先執行 `taskcli init`。

## 步驟 1：把描述拆成 task items

把使用者的描述拆成獨立的開發 task，每項判斷：

- `title`：一句話、動作導向（例：「實作登入 API」）。
- `type`：對齊 git commit type — `feature`（新功能）/ `fix`（修 bug）/ `refactor`（重構）/ `docs`（文件）/ `test`（測試）/ `chore`（雜項）。
- `priority`：`low` / `med`（預設）/ `high`。明顯緊急或擋路的給 `high`。
- `tags`：選填，領域標籤（例：`auth`、`api`）。

不確定 type/priority 時給合理預設即可，使用者會在審閱頁修改。

## 步驟 2：建立 draft

把整理結果以 JSON 從 stdin 餵給 CLI：

```bash
echo '{
  "source": "使用者的原始描述（保留供追溯）",
  "items": [
    { "title": "實作登入 API", "type": "feature", "priority": "med", "tags": ["auth"] },
    { "title": "修復 email 驗證", "type": "fix", "priority": "high", "tags": ["auth"] }
  ]
}' | taskcli draft create --stdin
```

輸出會給出 draft 編號（例：`D-001`）。

## 步驟 3：請使用者審閱（重要）

`taskcli review` 會啟動本地審閱頁並**持續阻塞直到 Ctrl+C**。**不要由你在前景執行它**，否則會卡住。改為請使用者自行執行（在 Claude Code 可用 `!` 前綴在 session 內跑）：

> 請執行 `! taskcli review D-001 --open`，在開啟的頁面勾選要納入的項目、調整 type/priority/標題、增刪項目，按「送出」後回我說一聲。

等使用者確認送出後再繼續。

## 步驟 4：finalize

```bash
taskcli finalize D-001
```

會把審閱頁勾選 include 的項目各生成一個正式 task（例：`T-001`、`T-002`）並刪除該 draft。向使用者回報生成的編號。

## 步驟 5：追蹤管理

| 使用者意圖 | 指令 |
|------------|------|
| 列出待辦 / 全部 | `taskcli list --json`（可加 `--status todo` `--type fix` `--priority high` `--tag auth`） |
| 看單一 task | `taskcli show T-001 --json` |
| 開始做 | `taskcli update T-001 --status in_progress` |
| 完成 | `taskcli done T-001` |
| 改欄位 | `taskcli update T-001 --title ... --priority high --add-tag x --rm-tag y` |
| 取消/刪除 | `taskcli rm T-001` |

## 錯誤處理

- 「找不到 .taskcli」：請使用者先 `taskcli init`。
- finalize 報「沒有 include 項目」：請使用者回審閱頁至少勾選一項再送出，或確認 draft 編號正確。
````

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/skill-content.test.ts`
Expected: PASS（3 個測試）。

- [ ] **Step 5: Commit**

```bash
git add skills/taskcli/SKILL.md test/skill-content.test.ts
git commit -m "feat: [taskcli] 新增 agent skill (SKILL.md)"
```

---

## Task 2: src/commands/skill.ts（skill install）

**Files:**
- Create: `src/commands/skill.ts`
- Test: `test/commands/skill.test.ts`

- [ ] **Step 1: Write the failing test** — `test/commands/skill.test.ts`

```typescript
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkillTo, SKILL_MD } from "../../src/commands/skill";

test("installSkillTo 寫到 <dest>/taskcli/SKILL.md 並回傳路徑", () => {
  const dest = mkdtempSync(join(tmpdir(), "sk-"));
  const out = installSkillTo(dest, "hello-skill", false);
  expect(out).toBe(join(dest, "taskcli", "SKILL.md"));
  expect(readFileSync(out, "utf8")).toBe("hello-skill");
});

test("已存在且無 force 時丟錯（含 --force 提示），且不覆寫", () => {
  const dest = mkdtempSync(join(tmpdir(), "sk-"));
  installSkillTo(dest, "v1", false);
  expect(() => installSkillTo(dest, "v2", false)).toThrow(/--force/);
  expect(readFileSync(join(dest, "taskcli", "SKILL.md"), "utf8")).toBe("v1");
});

test("force=true 覆寫既有檔", () => {
  const dest = mkdtempSync(join(tmpdir(), "sk-"));
  installSkillTo(dest, "v1", false);
  installSkillTo(dest, "v2", true);
  expect(readFileSync(join(dest, "taskcli", "SKILL.md"), "utf8")).toBe("v2");
});

test("SKILL_MD 是嵌入的真實 skill 內容（含 frontmatter name 與關鍵指令）", () => {
  expect(SKILL_MD).toContain("name: taskcli");
  expect(SKILL_MD).toContain("draft create");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/commands/skill.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: Implement `src/commands/skill.ts`**

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ensureDir, atomicWrite } from "../storage/io";
import SKILL_TEXT from "../../skills/taskcli/SKILL.md" with { type: "text" };

export const SKILL_MD: string = SKILL_TEXT;

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/** 把 skill 內容寫到 <destBaseDir>/taskcli/SKILL.md，回傳寫入路徑。 */
export function installSkillTo(destBaseDir: string, content: string, force: boolean): string {
  const dir = join(destBaseDir, "taskcli");
  const file = join(dir, "SKILL.md");
  if (existsSync(file) && !force) {
    throw new Error(`${file} 已存在，加 --force 覆寫`);
  }
  ensureDir(dir);
  atomicWrite(file, content);
  return file;
}

export interface SkillInstallOpts {
  dest?: string;   // 預設 ~/.claude/skills
  force?: boolean;
}

export function runSkillInstall(opts: SkillInstallOpts): string {
  const base = expandHome(opts.dest ?? "~/.claude/skills");
  const out = installSkillTo(base, SKILL_MD, opts.force ?? false);
  return `已安裝 skill 到 ${out}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/commands/skill.test.ts`
Expected: PASS（4 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/commands/skill.ts test/commands/skill.test.ts
git commit -m "feat: [taskcli] skill install 指令"
```

---

## Task 3: src/commands/installBin.ts（install-bin）

**Files:**
- Create: `src/commands/installBin.ts`
- Test: `test/commands/installBin.test.ts`

- [ ] **Step 1: Write the failing test** — `test/commands/installBin.test.ts`

```typescript
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyBinaryTo, runInstallBin } from "../../src/commands/installBin";

function fakeBin(): string {
  const dir = mkdtempSync(join(tmpdir(), "bin-src-"));
  const p = join(dir, "taskcli");
  writeFileSync(p, "#!/bin/sh\necho hi\n", "utf8");
  return p;
}

test("copyBinaryTo 複製到 dest 並設可執行位元，回傳目標路徑", () => {
  const src = fakeBin();
  const dest = mkdtempSync(join(tmpdir(), "bin-dst-"));
  const out = copyBinaryTo(src, dest);
  expect(out).toBe(join(dest, "taskcli"));
  expect(readFileSync(out, "utf8")).toBe("#!/bin/sh\necho hi\n");
  expect(statSync(out).mode & 0o100).toBe(0o100); // owner 可執行
});

test("copyBinaryTo 建立不存在的 dest 目錄", () => {
  const src = fakeBin();
  const base = mkdtempSync(join(tmpdir(), "bin-dst-"));
  const dest = join(base, "nested", "bin");
  const out = copyBinaryTo(src, dest);
  expect(existsSync(out)).toBe(true);
});

test("runInstallBin 在開發模式（execPath 指向 bun）丟出先 build 的提示", () => {
  const dest = mkdtempSync(join(tmpdir(), "bin-dst-"));
  expect(() => runInstallBin({ dest }, "/opt/homebrew/bin/bun")).toThrow(/build/);
});

test("runInstallBin 用編譯後 execPath 複製成功並回傳目標路徑訊息", () => {
  const src = fakeBin(); // 視為編譯後的 taskcli
  const dest = mkdtempSync(join(tmpdir(), "bin-dst-"));
  const msg = runInstallBin({ dest }, src);
  expect(msg).toContain(join(dest, "taskcli"));
  expect(existsSync(join(dest, "taskcli"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/commands/installBin.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: Implement `src/commands/installBin.ts`**

```typescript
import { copyFileSync, chmodSync } from "node:fs";
import { basename, join } from "node:path";
import { ensureDir } from "../storage/io";
import { expandHome } from "./skill";

/** 複製 binary 到 destDir（保持來源檔名），設 0o755，回傳目標路徑。 */
export function copyBinaryTo(srcPath: string, destDir: string): string {
  ensureDir(destDir);
  const out = join(destDir, basename(srcPath));
  copyFileSync(srcPath, out);
  chmodSync(out, 0o755);
  return out;
}

export interface InstallBinOpts {
  dest?: string;   // 預設 ~/.local/bin
}

function isCompiledBinary(execPath: string): boolean {
  // 開發模式以 `bun run` 執行時 execPath 為 bun 本身
  return basename(execPath) !== "bun";
}

export function runInstallBin(opts: InstallBinOpts, execPath: string): string {
  if (!isCompiledBinary(execPath)) {
    throw new Error(
      "偵測到以 bun 開發模式執行：請先 `bun run build`，再用編譯後的 dist/taskcli 執行 install-bin",
    );
  }
  const dest = expandHome(opts.dest ?? "~/.local/bin");
  const out = copyBinaryTo(execPath, dest);
  return `已安裝 binary 到 ${out}\n請確認 ${dest} 在你的 PATH（必要時加入 shell 設定）。`;
}
```

> 註：實作只用到 `copyFileSync`、`chmodSync`（不要 import `statSync`，那只在測試用，否則 strict 下未用匯入會被 noUnusedLocals 類規則或 review 挑出）。`basename(srcPath)` 保留來源檔名；編譯後 binary 名為 `taskcli`，測試假 binary 也命名 `taskcli`，故目標為 `<dest>/taskcli`。

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/commands/installBin.test.ts`
Expected: PASS（4 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/commands/installBin.ts test/commands/installBin.test.ts
git commit -m "feat: [taskcli] install-bin 指令"
```

---

## Task 4: cli.ts 分派 skill install / install-bin

**Files:**
- Modify: `src/cli.ts`（import 區、`USAGE` 字串、`switch (cmd)` 內 `default:` 之前）
- Test: `test/cli.test.ts`（新增 2 個 case，沿用既有 `run(cwd, args, stdin?)` helper 與頂部 import）

- [ ] **Step 1: Write the failing test** — 在 `test/cli.test.ts` 末尾新增（該檔頂部已 import `mkdtempSync`/`existsSync`、`tmpdir`、`join`、`resolve`）：

```typescript
test("skill install --dest <tmp> 寫出 SKILL.md", async () => {
  const dest = mkdtempSync(join(tmpdir(), "cli-skill-"));
  const cwd = mkdtempSync(join(tmpdir(), "cli-skill-cwd-"));
  const res = await run(cwd, ["skill", "install", "--dest", dest]);
  expect(res.code).toBe(0);
  expect(existsSync(join(dest, "taskcli", "SKILL.md"))).toBe(true);
});

test("install-bin 開發模式給先 build 提示並非零退出", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cli-bin-"));
  const res = await run(cwd, ["install-bin"]);
  // 透過 `bun run` 跑，execPath 為 bun → 應提示先 build
  expect(res.code).not.toBe(0);
  expect(res.stderr).toContain("build");
});
```

> 若 `test/cli.test.ts` 頂部未 import `existsSync`，在其既有 `node:fs` import 補上 `existsSync`（與 `mkdtempSync` 同一行）。不更動既有測試本體。

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli.test.ts`
Expected: FAIL（`skill`/`install-bin` 走到 default → 兩個新測試失敗）。

- [ ] **Step 3a: Modify `src/cli.ts` — 加 import**

在 `import { startReviewServer } from "./review/server";`（第 8 行）之後加入：

```typescript
import { runSkillInstall } from "./commands/skill";
import { runInstallBin } from "./commands/installBin";
```

- [ ] **Step 3b: Modify `src/cli.ts` — 加 USAGE 條目**

在 `USAGE` 字串中 `  rm <id>                             刪除 task`（第 23 行）之後、結尾反引號（第 24 行 `` `; ``）之前，加入兩行：

```
  skill install [--dest <dir>] [--force]       安裝 agent skill
  install-bin [--dest <dir>]          把 taskcli 複製到 PATH 目錄
```

- [ ] **Step 3c: Modify `src/cli.ts` — 加兩個 case**

在 `switch (cmd)` 內、`default:`（第 162 行附近）之前，加入：

```typescript
      case "skill": {
        const [sub, ...sr] = rest;
        if (sub === "install") {
          const { values } = parseArgs({
            args: sr, options: { dest: { type: "string" }, force: { type: "boolean" } },
            allowPositionals: true,
          });
          process.stdout.write(`${runSkillInstall({ dest: values.dest, force: values.force })}\n`);
          return;
        }
        fail(`未知 skill 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
      case "install-bin": {
        const { values } = parseArgs({
          args: rest, options: { dest: { type: "string" } }, allowPositionals: true,
        });
        process.stdout.write(`${runInstallBin({ dest: values.dest }, process.execPath)}\n`);
        return;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cli.test.ts`
Expected: PASS（既有 + 2 新測試）。

- [ ] **Step 5: Run full suite + type check**

Run: `bun test && bunx tsc --noEmit`
Expected: 全部 PASS；tsc exit 0。

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: [taskcli] cli 分派 skill install / install-bin"
```

---

## Task 5: 建置驗證、冒煙測試與 README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 確認編譯把 SKILL.md 嵌入並可寫出**

Run:
```bash
cd /Users/carl/Dev/CMG/TaskCli && bun run build && \
  D=$(mktemp -d) && ./dist/taskcli skill install --dest "$D" && \
  head -3 "$D/taskcli/SKILL.md"
```
Expected: 印出「已安裝 skill 到 …」，且 `head` 顯示 `---` 與 `name: taskcli`（證明 skill 已嵌入編譯後 binary）。

- [ ] **Step 2: 冒煙測試 install-bin（編譯後）**

Run:
```bash
cd /Users/carl/Dev/CMG/TaskCli && D=$(mktemp -d) && \
  ./dist/taskcli install-bin --dest "$D" && test -x "$D/taskcli" && echo "BIN_OK"
```
Expected: 印出安裝訊息與 `BIN_OK`。

- [ ] **Step 3: 更新 README.md — 在「指令一覽」表後、結尾「設計與計畫見」段之前插入一節**

```markdown
## 給 AI agent 使用（skill）

taskcli 內附一個 Claude Code skill，讓 agent 把你的口語/文字整理成 task、引導你在審閱頁確認後建立並追蹤。

安裝（兩者都用編譯後的 binary 執行）：

```bash
taskcli install-bin                 # 把 taskcli 複製到 ~/.local/bin（確認在 PATH）
taskcli skill install               # 把 skill 複製到 ~/.claude/skills/taskcli/
taskcli skill install --dest .claude/skills   # 或裝到某專案
```

裝好後，在該專案對 Claude 說「幫我把這些要做的事整理成 task」即可觸發。
```

- [ ] **Step 4: 全測試 + 型別檢查**

Run: `bun test && bunx tsc --noEmit`
Expected: 全部 PASS；tsc exit 0。

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: [taskcli] README 補 skill 安裝說明"
```

---

## Self-Review 結果

**1. Spec 覆蓋檢查：**
- §2 散布/嵌入模型（SKILL.md 編譯嵌入）→ Task 2（`import ... with { type: "text" }`）+ Task 5 Step 1 驗證 ✓
- §3 互動流程（init/拆 task/draft/審閱交接/finalize/追蹤）→ Task 1 SKILL.md 內文 ✓
- §4 skill 檔案（frontmatter + 七段內文 + --json 慣例）→ Task 1 ✓
- §5 安裝子指令（skill install --dest/--force 預設 ~/.claude/skills；install-bin --dest 預設 ~/.local/bin；開發模式提示；~ 展開）→ Task 2、3、4 ✓
- §6 架構（skill.ts/installBin.ts/cli.ts + 測試）→ File Structure 與各 Task ✓
- §7 錯誤處理（已存在需 --force、開發模式提示、atomicWrite/ensureDir）→ Task 2、3 ✓
- §8 測試策略（installSkillTo/copyBinaryTo/SKILL 內容/CLI 分派）→ Task 1–4 ✓
- §9 排除項（跨平台編譯/自動改 PATH/多檔 skill/draft CLI 編輯）→ 未納入 ✓

**2. Placeholder 掃描：** 無 TBD/TODO；所有 code step 均含完整程式碼。✓

**3. 型別一致性：** `installSkillTo(destBaseDir, content, force)`、`runSkillInstall({dest,force})`、`expandHome`、`SKILL_MD`、`copyBinaryTo(srcPath, destDir)`、`runInstallBin(opts, execPath)` 在各 Task 命名一致；cli.ts 以 `process.execPath` 傳入 `runInstallBin`、`values.dest/force` 對應 opts。Task 3 明示實作不 import `statSync`（僅測試用）。✓
