# TaskCli — GitHub Issues 匯入（T-004 第一階段）設計

- **日期**：2026-05-30
- **對應 task**：T-004「整合外部 issue tracker（Jira / Linear / GitHub Issues）」
- **範圍**：第一階段只做 **GitHub Issues → 單向匯入**。Jira / Linear 留待後續，介面預留擴充空間但本階段不實作。

## 1. 目標與非目標

### 目標
- 提供 `taskcli import github` 指令，把 GitHub repo 的 issue 匯入為 `.taskcli/tasks/*.md`。
- 重用使用者既有的 `gh` CLI 認證，binary 本身不接觸 token、不新增網路 SDK 依賴。
- 重跑冪等：以 `source` 欄位辨識來源，已匯入的 issue 更新而非重建。
- 維持本專案核心原則：CLI 純存取、不碰 LLM；除 `import` 外所有指令仍可離線運作。

### 非目標（本階段）
- 匯出（task → tracker）與雙向同步。
- Jira / Linear 實作。
- 衝突解決 / 三方合併。
- GitHub issue 的 comments、milestone、project 欄位。

## 2. 核心決策

| 面向 | 決策 |
|------|------|
| 目標 tracker | GitHub Issues |
| 同步方向 | 單向匯入（tracker → task） |
| 認證 / 網路 | 重用 `gh` CLI（透過子行程呼叫） |
| 重複處理 | 新增 `source` 欄位 + upsert |
| 欄位對映 | 標準對映 |
| 篩選範圍 | 預設 `--state open`，旗標可覆寫 |
| 預覽 | 提供 `--dry-run` |

## 3. 指令介面

```
taskcli import github [<issue-number>] \
  [--repo owner/repo] [--state open|closed|all] \
  [--label <name>] [--limit <n>] [--dry-run]
```

- 不帶 `<issue-number>`：批次匯入，預設 `--state open`。
- 帶 `<issue-number>`：只匯入單一 issue（忽略 `--state`/`--label`/`--limit`）。
- `--repo` 省略時由 `gh` 自動從 cwd 的 git remote 推導；帶值則覆寫。
- `--state` 預設 `open`，可為 `open` / `closed` / `all`。
- `--label` 只匯入含該 label 的 issue（可省略）。
- `--limit` 上限筆數，省略時用 `gh` 預設（30）。
- `--dry-run`：只印「會新建 / 會更新」摘要，不寫任何檔案。

非零退出條件：找不到 `.taskcli/`（`requireRoot`）、`gh` 未安裝、`gh` 未登入或回傳錯誤、無法推導 repo。

## 4. 架構（網路邊界隔離）

唯一碰網路 / 子行程的程式碼集中在 `github.ts`，其餘皆純函式、可離線測試。

| 模組 | 職責 | 純度 |
|------|------|------|
| `src/integrations/github.ts` | `gh` CLI 薄包裝。對外 `fetchIssues(opts)` / `fetchIssue(number, opts)`，回傳正規化的 `GithubIssue[]`。內含純函式 `buildGhArgs(opts)` 與 `parseIssuesJson(raw)` 以利測試；spawn 部分保持極薄 | 唯一網路 / IO 邊界 |
| `src/integrations/issueMapping.ts` | `issueToTask(issue, cfg, existing?)` 純對映函式 | 純 |
| `src/commands/import.ts` | `runImport(root, opts, deps)` 編排層；`deps.fetchIssues` 與 `deps.now` 可注入 | 純（注入 fake） |
| `src/model/types.ts` | 新增選填 `source?: string` | 純 |
| `src/model/frontmatter.ts` | `source` 的序列化 / 解析（與 due/assignee 同模式，僅有值時輸出，向後相容） | 純 |
| `src/cli.ts` | 分派 `import github` 子指令，組 `deps` 後呼叫 `runImport` | 薄 |

### 型別

```ts
// github.ts
export interface GithubIssue {
  number: number;
  title: string;
  body: string;          // 可能為空字串
  state: "open" | "closed"; // parseIssuesJson 統一轉小寫
  labels: string[];      // label.name 攤平
  assignees: string[];   // assignee.login 攤平
  repo: string;          // "owner/repo"，由 fetch 層解析或 gh 推導後回填
}

export interface FetchOpts {
  repo?: string;
  state?: "open" | "closed" | "all";
  label?: string;
  limit?: number;
}
```

### gh 呼叫

- 批次：`gh issue list --repo <R> --state <S> [--label <L>] [--limit <N>] --json number,title,body,state,labels,assignees`
- 單一：`gh issue view <number> --repo <R> --json number,title,body,state,labels,assignees`
- repo 推導：`--repo` 省略時，先 `gh repo view --json nameWithOwner -q .nameWithOwner` 取得，失敗則報「無法推導 repo，請用 --repo 指定」。

## 5. 欄位對映（標準）

| GitHub issue | task 欄位 | 規則 |
|---|---|---|
| title | title | 原樣 |
| body | body | 原樣（空 issue body → 空字串） |
| state | status | `open`→`todo`、`closed`→`done` |
| labels[].name | tags | 經 `parseTags` 去重 / 淨化 |
| assignees[0].login | assignee | 取第一位；無則不設 |
| number + repo | **source** | `github:<owner>/<repo>#<number>` |
| —（無對應） | type | `loadConfig().defaultType` |
| —（無對應） | priority | `loadConfig().defaultPriority` |

`due` / `depends_on` / `estimate`：本階段不從 GitHub 帶入；upsert 既有 task 時保留原值。

## 6. Upsert 邏輯

```
existing = listTasks(root)
for issue in fetched:
  src = "github:<repo>#<number>"
  match = existing.find(t => t.source === src)
  if match:
    更新 match 的映射欄位（title/body/status/tags/assignee/source）
    保留 match.id、created、type、priority、due、depends_on、estimate
    updated = now
    （計入「更新」）
  else:
    id = nextId("T", 既有 + 本批新建)
    新建 task：映射欄位 + type/priority 用 config 預設 + created = updated = now
    （計入「新建」）
  dry-run：不寫檔，只累計摘要
寫檔（非 dry-run）
回傳摘要字串：「新建 N 個、更新 M 個：T-00X, ...」
```

冪等性：第二次以相同條件執行，所有 issue 都命中 `source` → 全部走更新分支，不產生新 `T-NNN`。

## 7. 已知取捨

1. **import 覆寫本地 status**：tracker 為真相來源。re-import 會以 issue 的 open/closed 覆寫本地對該 task 的 status 修改。符合「單向匯入」語意，文件與指令說明會註明。
2. **單值 assignee**：GitHub 可多 assignee，task.assignee 為單值，只取第一位。
3. **可離線原則**：`import` 是唯一需要網路 / `gh` 的指令；缺 `gh` 或無網路時僅 `import` 失敗並給明確提示，其餘指令不受影響。

## 8. 測試策略（TDD）

- **`issueToTask`（純）**：各欄位對映正確；state→status；labels→tags 去重；assignee 取首位；source 格式；type/priority 取自 config；upsert 既有 task 保留 id/created/未映射欄位。
- **`buildGhArgs` / `parseIssuesJson`（純）**：旗標→gh 參數正確；JSON→`GithubIssue[]` 正規化（labels/assignees 攤平、state 轉小寫）。
- **`runImport`（注入 fake `fetchIssues` + `now`）**：新建 vs 更新分支；冪等（重跑無重複 id）；`--dry-run` 不寫檔且摘要正確；filter opts 正確傳入 `fetchIssues`。
- **`frontmatter`**：含 / 不含 `source` 的序列化與往返解析；舊 task（無 source）相容。
- **不打真實網路 / gh**：`github.ts` 的 spawn 薄層不做單元測試，邏輯都抽到純函式。
- 目標維持 tsc strict 全綠、整體測試全綠、覆蓋率 ≥ 80%。

## 9. 對既有程式的影響

- `model/types.ts`、`model/frontmatter.ts`：新增 `source` 欄位（與 T-002 同模式，低風險、向後相容）。
- `cli.ts`：新增 `import` case 與 USAGE 一行。
- 新增 `src/integrations/`、`src/commands/import.ts` 及對應測試。
- README 與 `skills/taskcli/SKILL.md` 補充 `import` 用法。
- 不更動既有指令行為。
