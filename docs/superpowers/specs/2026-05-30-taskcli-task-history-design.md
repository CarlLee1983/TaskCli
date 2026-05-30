# TaskCli Task History 設計文件

- **日期**：2026-05-30
- **狀態**：已確認，待使用者審閱
- **作者**：Carl + Codex
- **範圍**：Task-centric 開發歷程承接與單一 task HTML 歷程檢視

## 1. 目標與動機

TaskCli 目前已能把開發工作整理成 task，並以 `.taskcli/tasks/*.md` 追蹤狀態。下一步目標是讓 TaskCli 成為專案本地的「開發工作事項與開發歷程承接層」：不綁定 Superpowers、Claude、GitHub、Slack 或任何特定來源，而是能承接任意上游產生的工作脈絡、決策、驗證與來源摘要。

本設計採 **task-centric**：Task 仍是核心資料單位；歷程圍繞單一 task append-only 累積。第一版提供 CLI 寫入與只讀 HTML 檢視，讓開發者能方便檢示某個 task 的開發歷史。

## 2. 範圍

### 必做

1. 新增每 task sidecar history 檔：`.taskcli/history/T-001.jsonl`。
2. 新增 history event 模型與讀寫儲存層。
3. 新增 `taskcli history add <task-id>`，用 CLI 追加歷程事件。
4. 新增 `taskcli history list <task-id> [--json]`，列出單一 task 歷程。
5. 新增 `taskcli history view <task-id> [--port n] [--open]`，啟動只讀 HTML server 顯示 task summary + timeline。
6. `taskcli update --status ...` 與 `taskcli done` 在狀態實際變更時自動追加 `status_change` event。
7. 補 README、usage 與測試。

### 非目標

- 不做 project-wide dashboard。
- 不做瀏覽器內編輯、新增或刪除 history。
- 不追蹤所有欄位 diff；第一版只自動記錄 status change。
- 不做 Markdown renderer；HTML 第一版以安全純文字保留換行顯示 `body`。
- 不綁定任何特定 agent / Superpowers / GitHub / Slack 資料格式。
- 不改現有 task markdown frontmatter schema。

## 3. 現有程式依據

- CLI 分派集中在 `src/cli.ts`，已有 `review` server 與多個 task 子指令模式可沿用。
- task command 核心位於 `src/commands/tasks.ts`，`runUpdate` / `runDone` 是狀態變更自動寫 event 的整合點。
- task 儲存層位於 `src/storage/tasks.ts`，可新增平行的 history 儲存層。
- HTML review renderer/server 位於 `src/review/page.ts` 與 `src/review/server.ts`，history view 可採相同 Bun.serve 風格，但為只讀 server。
- task schema 位於 `src/model/types.ts`，可新增 history event type，不需改現有 `Task` frontmatter。

## 4. 資料模型

新增 `TaskHistoryEvent`：

```ts
export const TASK_HISTORY_EVENT_TYPES = [
  "note",
  "decision",
  "status_change",
  "verification",
  "source",
] as const;

export type TaskHistoryEventType = (typeof TASK_HISTORY_EVENT_TYPES)[number];

export interface TaskHistoryEvent {
  id: string;        // E-001，在單一 task history 內遞增
  task_id: string;   // T-001
  type: TaskHistoryEventType;
  created: string;   // ISO 8601 含 offset
  author?: string;
  title?: string;
  body: string;
  meta?: Record<string, string>;
}
```

首批事件語意：

| type | 用途 |
|------|------|
| `note` | 一般補充、觀察、上下文 |
| `decision` | 決策與理由 |
| `status_change` | task 狀態變更，例如 `todo -> in_progress` |
| `verification` | 測試、typecheck、build、手動驗證等證據 |
| `source` | 外部或上游來源摘要，例如 agent plan、issue、review comment、Slack 討論 |

### 儲存格式

每個 task 一個 append-only JSONL sidecar：

```text
.taskcli/history/T-001.jsonl
```

每行一筆 `TaskHistoryEvent` JSON。此格式保持：

- 易 append、易解析。
- 不擾動現有 `.taskcli/tasks/T-001.md`。
- 方便 agent 或其他工具透過 CLI 寫入穩定格式。

### ID 規則

- 單一 task history 內遞增：`E-001`、`E-002`、`E-003`。
- 下一個 ID 由現有 history 檔中最大 `E-NNN` 推得。
- 若 history 檔不存在，第一筆為 `E-001`。

### 刪除策略

第一版 `taskcli rm T-001` 不自動刪除 `.taskcli/history/T-001.jsonl`，以避免誤刪歷程。`history view/list/add` 仍要求 task 存在；若 task 不存在，回報可行動錯誤。

## 5. CLI 設計

### 5.1 `taskcli history add`

範例：

```bash
taskcli history add T-001 --type note --body "補充觀察"
taskcli history add T-001 --type decision --title "採 sidecar JSONL" --body-file decision.md
taskcli history add T-001 --type verification --author agent --body "bun test passed"
taskcli history add T-001 --type source --title "來自 review comment" --body "摘要..."
```

規則：

- `task-id` 必須存在。
- `--type` 必填，允許 `note|decision|verification|source`。
- 使用者不可直接用此指令新增 `status_change`；狀態歷程由 `update --status` / `done` 自動產生，避免手動偽造狀態軌跡。
- `--body` 與 `--body-file` 不可同時使用。
- 若沒有 `--body` / `--body-file`，則必須至少提供 `--title`。
- `--author` 選填，空字串不輸出。
- 建立後印出：`已新增 T-001 history E-001`。

### 5.2 `taskcli history list`

範例：

```bash
taskcli history list T-001
taskcli history list T-001 --json
```

規則：

- `task-id` 必須存在。
- 預設文字輸出：`created [type] title/body 摘要`。
- `--json` 輸出完整 event 陣列。
- 無歷程時輸出：`（尚無 history）`。

### 5.3 `taskcli history view`

範例：

```bash
taskcli history view T-001
taskcli history view T-001 --port 4123 --open
```

規則：

- `task-id` 必須存在。
- 啟動本地只讀 HTML server。
- `--open` 以系統瀏覽器打開。
- 此 server 不等待 submit，也不自動關閉；使用者按 Ctrl+C 結束。
- 輸出 URL 與關閉提示。

### 5.4 自動 `status_change` event

`taskcli update T-001 --status in_progress` 與 `taskcli done T-001` 若狀態實際變更，自動 append：

```json
{
  "id": "E-002",
  "task_id": "T-001",
  "type": "status_change",
  "created": "2026-05-30T14:10:00+08:00",
  "title": "todo -> in_progress",
  "body": "",
  "meta": { "from": "todo", "to": "in_progress" }
}
```

若 `--status` 設成原本狀態，不追加事件。

## 6. HTML history view 設計

`taskcli history view T-001 --open` 顯示單一 task 的只讀歷程頁。

頁面內容：

1. **頁首**：`T-001 title`、status、type、priority、tags、source。
2. **摘要區**：created、updated、due、assignee、estimate、depends_on。
3. **task body**：現有 task markdown body，以安全純文字區塊呈現。
4. **timeline**：依建立順序列出所有 history events。
   - 顯示時間、type badge、author、title。
   - `body` 以 escaped pre-wrap 顯示，保留換行。
   - `status_change` 顯示 `from -> to`，並可用不同 badge 樣式突出。
5. **空狀態**：若無 history，顯示「尚無歷程」與可用指令：

```bash
taskcli history add T-001 --type note --body "..."
```

第一版不提供頁面內新增/編輯，讓資料入口保持 CLI 單一來源。

## 7. 架構與檔案

建議新增：

- `src/storage/history.ts`
  - `historyPath(root, taskId)`
  - `listHistoryEvents(root, taskId)`
  - `appendHistoryEvent(root, event)`
  - `nextHistoryEventId(events)`
- `src/commands/history.ts`
  - `runHistoryAdd(root, taskId, opts)`
  - `runHistoryList(root, taskId, opts)`
- `src/history/page.ts`
  - `renderTaskHistoryPage(task, events)`
- `src/history/server.ts`
  - `startHistoryServer(root, taskId, opts)`
- `src/model/types.ts`
  - history event constants / type / interface / parser helpers
- `src/cli.ts`
  - `history add/list/view` 分派與 usage 更新

既有修改：

- `src/commands/tasks.ts`
  - `runUpdate` 在 status 真的變更時呼叫 history append。
  - `runDone` 沿用 `runUpdate`，自然產生 `status_change`。

## 8. 錯誤處理

- 找不到 task：沿用 `readTask` 的 `找不到 task：T-001`。
- `history add` 缺 `--type`：回報 `history add 需要 --type`。
- 非法 type：回報允許值。
- `--body` 與 `--body-file` 同時提供：回報二選一錯誤。
- body/title 都空：回報至少需提供 `--title` 或 `--body`。
- JSONL 中若有壞行：第一版讀取時丟出含檔案與行號的錯誤，不靜默略過。

## 9. 測試策略

### 單元 / command tests

- `appendHistoryEvent` 建立 `.taskcli/history/T-001.jsonl` 並 append JSONL。
- `listHistoryEvents` 依原始順序讀回事件。
- `nextHistoryEventId` 從空檔得到 `E-001`，從既有事件得到下一號。
- `runHistoryAdd` 驗證 type/body-file/body/title/author 行為。
- `runHistoryList --json` 輸出可 parse 的完整 event 陣列。
- `runHistoryList` 無事件時輸出空狀態。
- `runUpdate --status` 狀態變更時追加 `status_change`。
- `runUpdate --status` 未變更時不追加。
- `runDone` 追加 `status_change`。

### HTML / server tests

- `renderTaskHistoryPage` escape task title/body/history body，避免 HTML 注入。
- timeline 顯示 `status_change` 的 from/to。
- 空 history 顯示提示指令。
- `startHistoryServer` GET `/` 回傳 HTML；未知路徑 404。

### CLI tests

- `taskcli history add T-001 --type note --body ...` 成功。
- `taskcli history list T-001 --json` 成功。
- `taskcli history view T-001 --port 0` 可啟動並回傳 URL（測試可直接呼叫 server 層以避免卡住 CLI）。
- `taskcli --help` 包含 history usage。

### Regression

- `bun test` 全綠。
- `bunx tsc --noEmit` 全綠。
- `bun run build` 成功。

## 10. 建議實作順序

1. 新增 history event type 與 storage 層，先用測試鎖定 JSONL 行為。
2. 實作 `history add/list` command 與 CLI 分派。
3. 在 `runUpdate` / `runDone` 接入自動 `status_change`。
4. 實作 HTML renderer/server 與 `history view` 分派。
5. 更新 README / usage / release docs。
6. 跑完整測試、typecheck、build。

## 11. 後續延伸

- Project-wide history dashboard：依 task/status/source/tag/filter 檢視全專案事件。
- 更多自動事件：title/type/priority/body/tags diff。
- commit/PR linking：透過 `source` 或 event `meta` 連到 commit / PR。
- HTML 內新增 note：需重新評估瀏覽器寫入流程與資料入口一致性。
- 匯入器：從 agent plan、review comment、Slack 討論等轉成 `source` / `note` events。
