# TaskCli 設計文件

- **日期**：2026-05-30
- **狀態**：已確認，待寫實作計畫
- **作者**：Carl + Claude

## 1. 目標與動機

打造一個獨立的 CLI 工具 **TaskCli**，讓 AI agent（透過 skill，後續版本）或人，在任何專案 repo 裡建立、確認與追蹤 task。

核心使用情境：

1. 使用者用語音或文字隨口描述要做的事。
2. Claude（agent）理解、整理成一份結構化 **draft**（含 task type 等），呼叫 CLI 寫入。
3. CLI 在本地起一個小型 web server，**不耗 token、純本地**生成 HTML 審閱頁，讓使用者確認、修改、增刪。
4. 送出後 draft 被回寫，再由人或 agent 把確認好的 draft 正式生成 task list。
5. 後續用 CLI 指令追蹤管理 task。

記錄存在該 repo 的 `.taskcli/` 資料夾。後續再考慮與成熟專案管理軟體整合。

## 2. 職責邊界（重要原則）

- **CLI 純存取**：只做結構化 CRUD、draft 管理、本地 HTML 審閱 server。**不碰 LLM、不需 API key、可離線**。
- **agent 出腦**：語音/文字理解、整理成 draft、判斷 task type，全交給 Claude。
- **語音不進 CLI**：語音由 Claude Code 既有語音輸入轉文字，CLI 永遠只收文字／結構化資料，從不處理音訊。
- **人與 agent 同一套指令**：所有指令人可手打、agent 也可透過 Bash 呼叫，行為一致。

## 3. 技術棧

- **Bun + TypeScript**，`tsconfig` 對齊 CmgClaw 生態（`target: ESNext`、`module: ESNext`、`moduleResolution: bundler`、`strict: true`、`types: ["bun-types"]`）。
- 可 `bun run` 開發，亦可 `bun build --compile` 產出單一執行檔丟到任何電腦。
- 測試用 `bun test`。
- 零（或極少）外部執行期依賴；HTTP server 用內建 `Bun.serve`。

## 4. `.taskcli` 目錄結構（每個 repo 一份）

```
.taskcli/
  config.json          # 選用：預設 task type 清單、port 等
  drafts/
    D-001.json         # 草稿（結構化、可被 web 表單回寫）
  tasks/
    T-001.md           # 正式 task：YAML frontmatter + Markdown 內文
    T-002.md
```

- **draft 用 JSON**：要被本地 web 表單即時回寫，JSON 最直接。
- **正式 task 用 Markdown**：人可讀、git diff 乾淨、agent 好處理，符合既有 Obsidian/superpowers 習慣。
- **list 直接掃 `tasks/` 目錄**解析 frontmatter（數百筆內效能無虞，v1 不做 index 快取）。
- **ID 規則**：`T-001`、`D-001` 流水號，從現存檔案推導最大值 +1（不另存 counter，避免不同步）。

## 5. 核心資料模型（精簡實用組）

### 5.1 正式 task（Markdown + frontmatter）

```yaml
---
id: T-001
title: 實作登入 API
type: feature        # feature | fix | refactor | docs | test | chore
status: todo         # todo | in_progress | done | cancelled
priority: med        # low | med | high
tags: [auth, api]
created: 2026-05-30T10:00:00+08:00
updated: 2026-05-30T10:00:00+08:00
---

（task 描述、驗收條件等自由內文）
```

欄位定義：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | string | `T-NNN` 流水號 |
| `title` | string | 一句話標題 |
| `type` | enum | `feature` / `fix` / `refactor` / `docs` / `test` / `chore`（對齊 git commit type） |
| `status` | enum | `todo` / `in_progress` / `done` / `cancelled` |
| `priority` | enum | `low` / `med` / `high` |
| `tags` | string[] | 自由標籤 |
| `created` | ISO 8601 | 建立時間（含 +08:00） |
| `updated` | ISO 8601 | 最後更新時間 |

> `type`/`priority` 預設值可由 `.taskcli/config.json` 覆寫；列舉值固定。

### 5.2 draft（JSON，一批待確認 task 的容器）

```json
{
  "id": "D-001",
  "source": "我想做登入跟註冊，順便修個 bug",
  "createdAt": "2026-05-30T10:00:00+08:00",
  "items": [
    { "title": "實作登入 API", "type": "feature", "priority": "med", "tags": ["auth"], "body": "", "include": true },
    { "title": "修復註冊 email 驗證", "type": "fix", "priority": "high", "tags": [], "body": "", "include": true }
  ]
}
```

- `source`：原始輸入文字（保留供追溯）。
- `items[].include`：審閱時可勾選/取消，`finalize` 只生成 `include=true` 的項目。

## 6. 工作流程與資料流

```
語音/文字
   │ (Claude 理解、整理、判斷 type)
   ▼
taskcli draft create   ←─ agent 餵結構化 items（或人手打簡易版）
   │  寫 .taskcli/drafts/D-001.json
   ▼
taskcli review D-001   ←─ 起本地 web server (localhost only)
   │  瀏覽器：勾選/取消、改 title/type/priority/tags、增刪項目
   │  按「送出」→ POST 回 CLI → 回寫 D-001.json
   ▼
taskcli finalize D-001 ←─ 人或 agent 皆可
   │  把 include=true 的 items 各生成一個 T-xxx.md
   ▼
.taskcli/tasks/*.md  →  taskcli list / show / update / done / rm 追蹤管理
```

## 7. v1 指令清單

| 指令 | 說明 |
|------|------|
| `taskcli init` | 在當前 repo 建 `.taskcli/` 骨架與 config |
| `taskcli draft create [--from-json <file> \| --stdin]` | 建 draft（agent 餵 JSON；人也可互動式簡建） |
| `taskcli draft list` / `taskcli draft show <id>` | 看 draft |
| `taskcli review <draft-id> [--port <n>] [--open]` | 起本地 web server 審閱／編輯／送出 |
| `taskcli finalize <draft-id>` | draft → 正式 task（生成 `.md`） |
| `taskcli list [--type --status --priority --tag]` | 列出 task（可篩選） |
| `taskcli show <id>` | 顯示單一 task |
| `taskcli update <id> [--status --priority --title --tag]` | 改欄位 |
| `taskcli done <id>` | 快捷把 status 設 done |
| `taskcli rm <id>` | 刪除（或標 cancelled） |

- 所有讀取型指令支援 `--json` 旗標，方便 agent 解析。
- 找不到 `.taskcli/` 時給明確提示請先 `init`。

## 8. 本地 HTML 審閱 server

- `taskcli review <id>` 啟動 **localhost-only** 的 `Bun.serve` HTTP server，預設隨機可用 port，自動印出網址（`--open` 可自動開瀏覽器）。
- 單一頁面（HTML/CSS/JS 內嵌，**純本地產生、不耗 token**）：渲染 draft items 成可編輯表單，支援勾選 `include`、改欄位、增刪列。
- 按「送出」→ `POST /save` 回寫 draft JSON → 頁面顯示完成、server 自動關閉。
- 安全：只綁 `127.0.0.1`、用完即關、不對外暴露。

## 9. 架構分層（多小檔、高內聚低耦合）

建議模組邊界（每個檔案單一職責、可獨立測試）：

- `storage/` — `.taskcli` 路徑解析、讀寫、ID 推導。
- `model/` — task / draft 型別、列舉、frontmatter 序列化與反序列化。
- `commands/` — 每個 CLI 子指令一個檔。
- `review/` — web server 與內嵌 HTML 頁。
- `cli.ts` — 參數解析與指令分派（入口）。

## 10. 錯誤處理

- 在邊界驗證輸入（draft JSON schema、列舉值、ID 格式）；內部呼叫信任。
- 找不到資源（draft/task ID 不存在）給可行動的錯誤訊息，非 stack trace。
- 寫檔採「先寫暫存再 rename」避免半寫壞檔。
- 不吞錯；錯誤訊息對使用者安全、細節進 stderr。

## 11. 測試策略（目標 80%+ 涵蓋率）

- **單元測試**：ID 推導、frontmatter 讀寫、draft↔task 轉換、list 篩選邏輯。
- **整合測試**：暫存目錄跑完整 `init → draft → finalize → list → update` 流程，斷言檔案內容。
- **server 測試**：對 `Bun.serve` 發 `GET /` 與 `POST /save`，斷言回寫正確。

## 12. 明確排除（v1 不做，留待後續）

- ❌ agent 用的 **skill**（CLI 先穩，skill 之後薄薄一層接上）
- ❌ 與成熟專案管理軟體（Jira / Linear / GitHub Issues）整合
- ❌ task 依賴關係、期限、assignee、工時（schema 之後擴充）
- ❌ 多人協作／衝突合併、index 快取

## 13. 後續版本方向（非 v1 承諾）

1. **agent skill**：教 Claude 何時把語音/文字轉 draft、何時起 review、何時 finalize。
2. schema 擴充：`due` / `depends_on` / `assignee` / `estimate`。
3. 外部整合：匯出/同步到 GitHub Issues 等。
