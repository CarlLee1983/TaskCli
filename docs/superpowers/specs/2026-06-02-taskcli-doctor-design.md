# TaskCli `doctor` 指令設計

- 日期：2026-06-02
- 狀態：已核可，待實作
- 範圍：新增 `taskcli doctor` 指令，診斷 `.taskcli/` 工作區的健康度與資料完整性，並支援 `--fix` 安全修復。

## 目標

提供單一指令檢查 `.taskcli/` 工作區的常見問題（壞掉的 frontmatter、懸空 / 循環相依、ID 不一致、設定檔錯誤、sidecar 不一致），並能以 `--fix` 自動修復「無損且語意明確」的問題。輸出分級（error / warn / ok），支援 `--json` 供 agent 取用，並以 exit code 反映健康度供 CI 使用。

CLI 維持「純存取、不碰 LLM」原則：doctor 只讀寫 `.taskcli/` 內的結構化資料，不做自然語言處理。

## 非目標

- 不自動修復需要人工判斷的問題（重複 ID、循環相依、設定檔錯誤、壞掉無法解析的檔案、孤兒 sidecar）。
- 不刪除任何使用者內容（doctor `--fix` 只新增目錄或移除已失效的相依條目，不刪檔）。
- 不做跨 repo / 遠端檢查。

## 架構（方案 A：集中式 doctor 模組）

診斷邏輯（純函式）與輸出 / exit code（副作用）分離，每類檢查獨立可測。

```
src/doctor/
  types.ts      # Finding / CheckResult / DoctorReport / FixOutcome 型別
  checks.ts     # 純函式：root → DoctorReport（不碰 stdout、不改檔）
  fixes.ts      # DoctorReport → 套用安全修復 → FixOutcome[]（受控副作用）
  report.ts     # DoctorReport / FixOutcome[] → 人讀文字 / JSON 字串
src/commands/doctor.ts  # 串接：跑檢查 →（可選 fix）→ 產出輸出 + exit code
test/doctor/*.test.ts
```

`cli.ts` 新增 `case "doctor"`，解析 `--fix` / `--json`，呼叫 `runDoctor(root, opts)`。`runDoctor` 回傳 `{ output: string; exitCode: number }`，由 `main()` 負責 `process.stdout.write(output)` 與（必要時）`process.exit(exitCode)`。

### 重用既有程式

- `requireRoot` / 各 `*Dir(root)` path 函式（`src/storage/paths.ts`）。
- `parseTask`（`src/model/frontmatter.ts`）— 解析單一 task 原始內容並沿用其錯誤訊息。
- `parseDependsOn` / enum 常數（`src/model/types.ts`）。
- `listHistoryEvents`（沿用其 `檔:行` 錯誤訊息）、`listTranscriptIds` / `parseTranscript`。
- 寫入一律走既有 `atomicWrite` / `ensureDir` / `writeTask`，維持原子寫入。

**重要實作注意**：`listTasks()` 會在第一個壞掉的 frontmatter 直接 throw，因此 doctor 不可使用它。`checks.ts` 必須以 `listTaskIds` 取得檔名後，**逐檔讀原始內容並個別 `try/catch`**，才能回報「哪一個檔壞了」而非整批失敗。

## 資料結構

```ts
type Severity = "error" | "warn";

interface Finding {
  code: string;       // 穩定機器碼，如 "task.parse_failed"
  severity: Severity;
  target: string;     // 對象，如 "T-003" / ".taskcli/config.json"
  message: string;    // 繁中人讀說明
  fixable: boolean;   // 是否有對應 --fix 修復
}

interface CheckResult { name: string; findings: Finding[]; }

interface DoctorReport {
  ok: boolean;        // errorCount === 0
  errorCount: number;
  warnCount: number;
  checks: CheckResult[];
}

interface FixOutcome { code: string; target: string; action: string; applied: boolean; }
```

## 檢查清單（四群組）

### layout（目錄與設定）

| code | 嚴重度 | 可 fix | 條件 | fix 動作 |
|------|--------|--------|------|----------|
| `layout.missing_dir` | warn | 是 | `tasks/`、`drafts/`、`transcripts/` 任一缺漏（`history/` 為 lazy，不檢查） | `ensureDir` 建回空目錄 |
| `layout.config_unparsable` | error | 否 | `config.json` 存在但無法 `JSON.parse` | — |
| `layout.config_invalid_enum` | warn | 否 | `defaultType` / `defaultPriority` 不在合法 enum | — |

### tasks（Task 檔完整性）

逐檔讀原始內容、個別 catch。

| code | 嚴重度 | 可 fix | 條件 | fix 動作 |
|------|--------|--------|------|----------|
| `task.parse_failed` | error | 否 | frontmatter 解析失敗（含缺必填、enum 非法；沿用 `parseTask` 訊息） | — |
| `task.id_mismatch` | error | 是 | 檔名 `T-003.md` 與 frontmatter `id` 不符 | 以檔名為準改寫 frontmatter id（**僅當該檔名 id 未被其他檔佔用**） |
| `task.duplicate_id` | error | 否 | 兩個檔案宣告同一 id | — |

### deps（相依關係）

| code | 嚴重度 | 可 fix | 條件 | fix 動作 |
|------|--------|--------|------|----------|
| `dep.dangling` | error | 是 | `depends_on` 指向不存在的 task | 從 `depends_on` 移除該 id |
| `dep.cycle` | error | 否 | 偵測到循環相依 | — |
| `dep.on_cancelled` | warn | 否 | 相依於 `cancelled` 的 task | — |

`dep.cycle` 回報整條環，訊息形如 `T-001 → T-002 → T-001`。循環偵測使用 DFS（白 / 灰 / 黑著色）；只在能解析成功的 task 之間建圖（壞掉的 task 已由 `task.parse_failed` 回報）。懸空相依的邊不納入建圖。

### sidecars（Sidecar 一致性）

| code | 嚴重度 | 可 fix | 條件 | fix 動作 |
|------|--------|--------|------|----------|
| `history.parse_failed` | error | 否 | 某 `*.jsonl` 行無法解析（沿用 `listHistoryEvents` 的 `檔:行` 訊息） | — |
| `history.orphan` | warn | 否 | `history/T-099.jsonl` 對應的 task 不存在 | — （保守：不刪資料，僅回報） |
| `transcript.parse_failed` | error | 否 | 某 transcript `.md` 解析失敗 | — |

## `--fix` 安全規則

`--fix` 只做「無損且語意明確」的修復，絕不刪除使用者內容。可自動修復項僅三類：

| code | 修復動作 | 為何安全 |
|------|---------|---------|
| `layout.missing_dir` | 建立空目錄 | 純補骨架 |
| `dep.dangling` | 從 `depends_on` 移除不存在的 id | 該相依本就無效 |
| `task.id_mismatch` | 以檔名為準改寫 frontmatter id（僅當該檔名 id 未被其他檔佔用） | 檔名是檔案系統事實 |

**不自動修復**：`duplicate_id`、`cycle`、`config_*`、`history.orphan`、任何 `parse_failed`。加 `--fix` 時這些只回報、不動作。

### `--fix` 流程

1. 跑一次檢查得到 `DoctorReport`。
2. 對 `fixable` 的 findings 套用對應修復（走 `writeTask` / `atomicWrite` / `ensureDir`），收集 `FixOutcome[]`。
3. **重跑一次檢查**，得到修復後的 `DoctorReport`。
4. 輸出修復後的報告 + 已套用的 `FixOutcome[]`。
5. exit code 以**修復後**的 report 為準。

## 輸出與 exit code

### 人讀（預設）

分級、emoji 前綴、群組標題。範例：

```
🔎 taskcli doctor

▎tasks
  ✖ T-003  frontmatter 解析失敗：欄位 status 不合法：blocked
  ✖ T-007  檔名與 id 不符（id=T-008）  [可 --fix]

▎deps
  ✖ T-001  懸空相依 T-099  [可 --fix]
  ⚠ T-002  相依於已取消的 T-005

摘要：2 error、1 warn。有可自動修復項，可執行 `taskcli doctor --fix`。
```

全過時：`✅ 一切正常（12 tasks、0 問題）`。

`--fix` 模式額外列出已套用的修復（`FixOutcome.action`），再接修復後的報告與摘要。

### `--json`

直接輸出 `DoctorReport`；`--fix` 模式下另加 `fixes: FixOutcome[]` 欄位。

### exit code

- `errorCount > 0` → `1`
- 否則 → `0`（純 warn 也回 0）
- `--fix` 後以修復後的 report 為準。

doctor 需自己的 exit code 邏輯，不沿用 `main()` 既有的 `fail()` → `exit(1)`。

## 測試策略（TDD）

- 每個 check 純函式獨立單測：建臨時 `.taskcli` 夾具，塞入壞 task / 懸空相依 / 循環 / 壞 jsonl / id 不符 / 重複 id / 壞 config，斷言對應 `Finding`。
- `fixes`：測「修復後重跑為乾淨」與「不該 fix 的項目原封不動（檔案內容不變）」。`task.id_mismatch` 在目標 id 已被佔用時不修復。
- `report`：測人讀文字與 JSON 格式、摘要計數、exit code 映射。
- `cli.test.ts`：end-to-end 補 exit code、`--json`、`--fix` 三條路徑。

## CLI / 文件

- `cli.ts` USAGE 新增：`doctor [--fix] [--json]    檢查 .taskcli 工作區健康度`。
- README「功能範圍」與 CHANGELOG 補一條（實作完成後）。
