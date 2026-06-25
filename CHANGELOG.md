# Changelog

所有重要變更會記錄在此檔。

## [Unreleased]

## v0.5.1 - 2026-06-25 - npm 發佈與 Node 相容化

### Added

- 新增 `taskcli merge <source> --into <target> [--json]`：合併重複 task——將指向來源的相依重接到目標、聯集來源的 `tags`/`depends_on`、於目標 history 記一筆 note，再刪除來源與其 sidecar；會拒絕造成循環相依的合併。
- `skills/taskcli/SKILL.md` 新增「建立前語意防重」步驟與「事後合併重複」清理指引。

### Changed

- **發佈到 npm**：套件改名為 scoped `@carllee1983/taskcli` 並移除 `private`；`bin` 改指向 `bun build --target node` 產出的 Node bundle `dist/cli.js`（`src/cli.ts` shebang 改為 `#!/usr/bin/env node`），一般使用者可用 Node（>= 20）`npm i -g @carllee1983/taskcli` 安裝。
- `package.json` 補 `description`/`repository`/`homepage`/`bugs`/`keywords`/`author`/`engines`/`publishConfig`，`files` 白名單收斂至 `dist/cli.js` 與文件（tarball 由 163 檔降至 5 檔）；新增 `build`（node bundle）、`compile`（原生 binary）、`prepublishOnly` scripts。
- **Node 相容化**：新增 `src/util/http.ts`（`node:http` 取代 `Bun.serve`）與 `src/util/runtime.ts`（`readStdin`/`readTextFile`/`openUrl` 取代 `Bun.stdin`/`Bun.file`/`Bun.spawn`）；review/history server 改 async、cli.ts 對應加 `await`；transcript provider 改 `node:child_process`、github 整合改 node API。修正 0.5.0 在 node 下噴 `Bun is not defined` 的問題。

### Fixed

- `taskcli skill install` 文件更正：skill 內容已嵌進 CLI，npm 全域安裝後即可直接安裝，不再需要編譯後 binary。

## v0.5.0 - 2026-06-25 - Doctor & Slack integration

### Added

- 新增 `taskcli doctor [--fix] [--json]`：診斷 `.taskcli/` 工作區（task 完整性、相依關係含循環偵測、目錄與設定、sidecar 一致性）。`--fix` 只做無損安全修復（補目錄、移除懸空 `depends_on`、修正檔名與 id 不符），`--json` 輸出結構化 `DoctorReport`；發現 error 時 exit code 為 1。
- 新增 `taskcli slack`：以 Slack Socket Mode 啟動個人本機常駐 bot，從 Slack 用 `/task` slash command 操作單一固定 repo 的 `.taskcli/`（list/next/show/add/wip/done），以 user allowlist 授權、token 走 env var（`SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN`）。
- 新增 `LICENSE`（MIT），`package.json` 補 `license` 欄位。

### Changed

- `skills/taskcli/SKILL.md` 全文改為英文（agent 觸發用），`test/skill-content.test.ts` 斷言對齊英文內容。

### Docs

- 新增 `AGENTS.md` 開發指引。
- 新增 `docs/superpowers/specs/2026-06-02-taskcli-doctor-design.md` 設計與 `docs/superpowers/plans/2026-06-02-taskcli-doctor.md` 實作計畫。
- 新增 `docs/superpowers/specs/2026-06-03-taskcli-slack-integration-design.md` 設計與 `docs/superpowers/plans/2026-06-03-taskcli-slack-integration.md` 實作計畫。

## v0.4.0 - Transcript inbox

### Added

- 新增 transcript inbox 儲存層（`.taskcli/transcripts/<TR-NNN>.md`），與 task/draft 分離。
- 新增 `taskcli transcript add/list/show/rm`，匯入與管理文字稿。
- 新增 `taskcli transcript import`，以設定的 provider command（`{input}`/`{language}` 樣板、stdout 取文字稿）轉錄音檔。
- `config`/`init` 支援 `transcript.defaultProvider`、`defaultLanguage` 與 `providers` 設定。

### Docs

- README 補上 transcript inbox 區段、指令一覽與範例。
- 新增 `docs/superpowers/plans/2026-06-01-taskcli-transcript-inbox.md` 實作計畫。

## v0.3.0 - Task history

### Added

- 新增 per-task append-only history JSONL sidecar（`.taskcli/history/<task-id>.jsonl`）。
- 新增 `taskcli history add/list/view`。
- `update --status` / `done` 在狀態實際改變時自動記錄 `status_change`。
- 新增只讀 HTML task timeline view（`history view`）。

### Docs

- 新增 `docs/releases/v0.3.0-task-history.md` 交付說明。
- README 補上 task history 區段、指令一覽與範例。

## v0.2.0 - Unreleased

### Added

- 新增 `taskcli add`，可不經 draft/review 快速建立單一正式 task。
- 強化 `taskcli list`，支援 `--query`、`--sort`、`--desc`、`--limit`。
- 新增 `taskcli update --body/--body-file`，可從 CLI 更新 task 內文。
- 新增 `taskcli next`，依狀態、priority 與 dependency 顯示下一個可執行 task。
- 新增 `taskcli --version` 與 help examples。

## v0.1.0 - 2026-05-30

### Added

- 建立 TaskCli Bun + TypeScript CLI 專案骨架與單一 binary build 流程。
- 新增 `.taskcli/` 初始化、config fallback 與 task/draft 檔案儲存層。
- 新增 draft 流程：`draft create`、`draft list`、`draft show`。
- 新增本地 HTML review server：可審閱、修改、送出 draft；成功送出後 CLI 自動關閉 server。
- 新增 `finalize`，將 include=true 的 draft items 轉成正式 task。
- 新增 task 管理：`list`、`show`、`update`、`done`、`rm`，讀取型指令支援 `--json`。
- schema 支援 `due`、`depends_on`、`assignee`、`estimate`、`source`。
- 新增 GitHub Issues 匯入：`import github` 支援 repo/state/label/limit/dry-run 與單一 issue 匯入。
- 新增 agent skill 來源檔與 `skill install`。
- 新增 `install-bin`，可將編譯後 binary 安裝到 `~/.local/bin` 或指定目錄。

### Fixed

- 修復 review page 內嵌 JSON/HTML 轉義問題，避免 `</script>` 或特殊字元破壞頁面與按鈕行為。
- 強化 `install-bin` 對 Bun 編譯 binary 的判斷，涵蓋 POSIX `/\$bunfs/`、Windows `B:\~BUN\` 與 Bun 被改名情境。

### Verified

- `bun test`：110 pass / 0 fail。
- Git 工作樹在補文件前為乾淨狀態；所有 `.taskcli/tasks/T-001` 至 `T-006` 均為 `done`。
