# TaskCli v0.2.0 自用體驗優化設計文件

- **日期**：2026-05-30
- **狀態**：已規劃，待實作
- **對應任務**：T-007, T-008, T-009, T-010, T-011, T-012

## 1. 目標

v0.1.0 已完成 `draft → review → finalize → track` 閉環，但日常自用時仍有三個摩擦點：單一臨時任務需要走 draft/review、task 變多後查找不夠快、建立後補內容不夠順。v0.2.0 聚焦 CLI ergonomics，讓 TaskCli 成為每天開發時可快速記錄、定位、挑選下一件工作的工具。

## 2. 範圍

### 必做

1. `taskcli add <title>`：快速建立單一正式 task，不經 draft/review。
2. `taskcli list` 強化：支援 `--query`、`--sort`、`--desc`、`--limit`。
3. `taskcli update` 強化：支援 `--body`、`--body-file`。
4. `taskcli next`：依可執行性與優先序列出下一批 task。
5. `taskcli --version` 與 help examples。
6. README / release backlog / tests 更新。

### 非目標

- 不做 Linear/Jira。
- 不做雙向同步或 GitHub Projects。
- 不改現有 task frontmatter 格式。
- 不新增執行期 dependency。
- 不做互動式 TUI。

## 3. 現有程式依據

- CLI 分派集中在 `src/cli.ts:15-32` 與 `src/cli.ts:43-230`。
- task 指令核心集中在 `src/commands/tasks.ts:13-89`。
- task list/filter 儲存在 `src/storage/tasks.ts:35-50`。
- task schema 位於 `src/model/types.ts:10-25`，已支援 v0.2.0 需要的欄位。
- config 預設值可由 `src/storage/config.ts:12-29` 讀取。
- tests 已有 command 層與 CLI 層範例：`test/commands/tasks.test.ts:25-120`、`test/cli.test.ts:19-104`。

## 4. 命令設計

### 4.1 `taskcli add <title>`

範例：

```bash
taskcli add "補 README 範例" --type docs --priority med --tag docs --body "補 quick add 用法"
taskcli add "修登入 bug" --tag auth --due 2026-06-15 --assignee carl --estimate 2h --add-dep T-001
```

規則：

- title 必填，來自第一個 positional。
- `type` / `priority` 未提供時用 `.taskcli/config.json` 的 default。
- 支援 `--tag` 單值、`--body`、`--body-file`、`--due`、`--assignee`、`--estimate`、`--add-dep`。
- 建立後回傳 `已建立 T-013`。
- `--json` 回傳完整 task JSON。

### 4.2 `taskcli list` 強化

範例：

```bash
taskcli list --query review --sort priority --desc --limit 5
taskcli list --status todo --query github --json
```

規則：

- `--query` case-insensitive 搜尋 `id/title/body/tags/source`。
- `--sort` 允許 `id|updated|priority|status|title`，預設 `id`。
- `--desc` 反向排序。
- `--limit n` 限制輸出筆數；`n` 必須為正整數。
- `--json` 輸出套用同一組 filter/sort/limit 後的陣列。

### 4.3 `taskcli update` body 支援

範例：

```bash
taskcli update T-010 --body "新增驗收條件"
taskcli update T-010 --body-file /tmp/body.md
```

規則：

- `--body` 直接覆寫 body，可用空字串清空。
- `--body-file` 讀檔覆寫 body。
- 同時提供 `--body` 與 `--body-file` 時報錯，避免來源不明。

### 4.4 `taskcli next`

範例：

```bash
taskcli next
taskcli next --limit 3 --json
```

規則：

- 預設候選：`todo` 與 `in_progress`。
- 排除有未完成 dependency 的 task；`depends_on` 中任何 task 不是 `done`，即視為 blocked。
- 排序：`in_progress` 優先於 `todo`，再依 priority `high > med > low`，再依 id。
- 預設 limit=1；可用 `--limit n`。

### 4.5 `--version` 與 help examples

- `taskcli --version` 印出 `0.2.0` 或目前 package version。
- `--help` 保留簡潔 usage，追加 Examples 區塊。
- 版本來源可先用 build-time text import package.json；若 Bun compile 有疑慮，退而在 `src/cli.ts` 定義單一常數並於版本 bump 時更新。

## 5. 資料相容性

所有功能只新增命令與查詢/排序邏輯，不改 task frontmatter schema。既有 `.taskcli/tasks/*.md` 可直接讀取。`add` 產生的 task 使用現有 `Task` 型別與 `writeTask`。

## 6. 測試策略

- command tests：新增 add/list/next/update body 的純函式測試。
- CLI tests：驗證 `add`、list 新 flags、`next`、`--version` 的端到端行為。
- regression：現有 110 個 tests 必須維持全綠。
- build smoke：`bun run build` 與 `./dist/taskcli --help`。

## 7. 建議實作順序

1. T-007 quick add：產生大量後續手動測試價值最高。
2. T-008 list 強化：支撐 task 變多後的日常查找。
3. T-010 update body：補內容與驗收條件。
4. T-009 next：依賴 list/sort 經驗與 dependency 判斷。
5. T-011 version/help：收尾體驗與文件。
