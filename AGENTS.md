# AGENTS.md — TaskCli

給在此 codebase 工作的 AI agent 的指引。人類導向的使用說明見 [`README.md`](README.md)；本檔聚焦「如何安全地開發與修改本專案」。

## 專案是什麼

在任意 repo 的 `.taskcli/` 目錄中，以 **draft → 本地 HTML 審閱 → 正式 task** 流程建立並追蹤開發任務的 CLI。

核心原則：**CLI 純存取、不碰 LLM**。自然語言理解與分類由 agent（呼叫端）完成，CLI 只負責讀寫 `.taskcli/` 內的檔案。修改時請維持這條界線——不要在 CLI 內加入任何網路 LLM 呼叫。

## 技術棧

- **Runtime**：Bun（非 Node）。入口 `src/cli.ts` 以 `#!/usr/bin/env bun` 執行。
- **語言**：TypeScript，`strict: true` + `noUncheckedIndexedAccess`。ESM（`"type": "module"`）。
- **唯一執行期相依**：`@slack/bolt`（僅 `slack` 指令用到）。其餘走 Bun 內建 API（`Bun.file`、`Bun.spawn`、`Bun.serve`、`Bun.stdin`）。
- **儲存格式**：task 為 Markdown + YAML frontmatter；history 為 append-only JSONL sidecar；設定為 JSON。

## 常用指令

```bash
bun install              # 安裝相依
bun run src/cli.ts <cmd> # 開發時直接跑 CLI（等同 bun run dev）
bun test                 # 跑全部測試（test/ 對應 src/ 結構）
bun test test/storage    # 跑單一目錄
bun run build            # 編譯單一執行檔 dist/taskcli
```

- 提交前一律 `bun test` 確認綠燈（test timeout 10s，見 `bunfig.toml`）。
- 沒有獨立 lint/format step；依賴 TS strict 與既有風格。

## 程式碼結構

```
src/
  cli.ts            指令解析與分派（node:util parseArgs），所有指令的單一入口
  commands/         每個 CLI 指令一檔，匯出 run* 函式，回傳「要印給使用者的字串」
  storage/          .taskcli 讀寫：paths/io/ids/tasks/drafts/history/transcripts/config
  model/            純資料：types、frontmatter 解析、clock（時間注入）、transcript
  review/           draft 審閱用本地 HTTP server + HTML page
  history/          只讀 history timeline server + page
  integrations/     github（透過 gh CLI）、issueMapping
  slack/            Socket Mode bot：bot/router/actions/format/auth/config
  doctor/           工作區健康檢查：checks/fixes/report/types
test/               鏡像 src/ 結構，逐模組測試
skills/taskcli/     附帶的 Claude Code skill（SKILL.md，全英文）
docs/               releases/ 與 superpowers/ 設計筆記
```

分層慣例：`cli.ts` 只做參數解析 → 呼叫 `commands/*` → `commands/*` 編排 `storage/` 與 `model/`。**新指令請照這條鏈路加**，不要在 `cli.ts` 內塞商業邏輯。

## 慣例與不變量（修改時務必遵守）

- **不可變更既有資料格式**：task frontmatter 欄位、id 格式（`T-NNN` / `D-NNN` / `E-NNN` / `TR-NNN`）、JSONL event schema 已對外。新增欄位要選填且未設定時不輸出（見 README task 結構）。
- **immutable 風格**：回傳新值，不原地 mutate 輸入物件（符合 repo 與全域 coding-style）。
- **指令函式回傳字串、不直接 `console.log`**：由 `cli.ts` 統一 `process.stdout.write`。錯誤用 `throw new Error(msg)`，`cli.ts` 的 try/catch 會轉成 stderr + exit 1。
- **讀取型指令一律支援 `--json`**：給 agent 解析用；新讀取指令請比照。
- **時間經 `model/clock.ts` 注入**，不要在邏輯內直接 `new Date()`，以利測試與可重現。
- **阻塞型指令**（`review`、`history view`、`slack`）會常駐前景等待。寫測試或自動化時不要在前景同步呼叫它們而卡死。
- **secrets 走 env var**：Slack 用 `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN`，絕不寫死或 log。
- **GitHub 匯入依賴外部 `gh` CLI**（需先 `gh auth login`），為單向 upsert（以 issue 狀態覆寫本地 status）。

## 開發流程

1. 改動 `commands/` 或 `storage/` 時，**先在 `test/` 對應檔補/改測試**（repo 採 TDD，目標 80%+）。
2. `bun test` 綠燈後再視需要 `bun run build` 驗證可編譯成 binary。
3. 動到對外行為時，同步更新 `README.md`、`CHANGELOG.md`，以及 `cli.ts` 內的 `USAGE` 字串。
4. 動到 skill 行為時，更新 `skills/taskcli/SKILL.md`（有 `test/skill-content.test.ts` 會檢查內容）。

## 語言

程式碼註解與文件預設使用繁體中文（台灣用語）；`skills/taskcli/SKILL.md` 為英文（agent 觸發用）。Git commit 遵循 `type: [scope] subject` 格式（scope 通常為 `taskcli`）。
