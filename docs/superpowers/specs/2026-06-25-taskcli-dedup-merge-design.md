# TaskCli 重複工作管理：建立防重 + `merge` 合併

- **日期**：2026-06-25
- **狀態**：設計定案，待實作
- **適用版本**：v0.5.0 之後（預計併入下一版）

## 背景與目標

TaskCli 的核心價值是「使用者貼一批內容給 agent → agent 拆解分類 → `draft → review → finalize` 建立 task → 之後 `list/update/done/next` 管理進度」。

實際使用後浮現一個缺口：**重複工作**。同一件事可能在不同批次被重複建立，或庫裡累積久了出現語意重疊的 task。需要兩個能力：

1. **建立時防重**：貼新批次時，提醒哪幾項其實已存在。
2. **事後清理**：把已存在的重複 task 安全地合併。

## 設計原則（不可違反）

- **CLI 純存取、不碰 LLM**：語意「是否重複」的判斷只有 agent 做得到，必須留在 agent 端。CLI 只負責「好取用」與「結構性清理動作」。
- **不破壞既有資料格式**：task frontmatter 欄位、id 格式、history JSONL schema 維持不變。
- **immutable 風格、指令回傳字串、讀取型支援 `--json`**：與既有慣例一致。

## 分工總覽

| 能力 | 負責方 | 產出 |
| --- | --- | --- |
| 建立時防重（語意比對、提醒、裁示） | agent（SKILL.md 行為） | 改 `skills/taskcli/SKILL.md`，無程式碼 |
| 撈既有 task 候選 | CLI（既有） | `list --json`、`--query`，無需新增 |
| 事後合併重複 task | CLI（新增） | `taskcli merge` 指令 |

`merge` 不可取代之處在於 `rm` 做不到的**結構性處理**：重接相依、避免關聯默默遺失。body 等需要判斷的編輯性內容由 agent 在對話中以 `update` 處理，不歸 `merge`。

## 第 1 部分：`merge` 指令（CLI）

### 語法

```bash
taskcli merge <source-id> --into <target-id> [--json]
# 例：taskcli merge T-005 --into T-002
```

語意：「`T-005` 是重複，併進 `T-002` 後刪除 `T-005`」。

### 行為（結構最小集）

1. **重接入向相依**：所有 `depends_on` 含 `source` 的 task，將該項改為 `target`，消除刪除後的懸空相依。
2. **聯集 source 的關聯到 target**：將 `source` 自身的 `depends_on` 與 `tags` 聯集併入 `target`（去重）。
3. **記錄**：在 `target` 的 history sidecar 追加一筆 `note` 事件，`title` 為 `merged from <source>`。
4. **刪除** `source` 的 task 檔與其 history sidecar。
5. 受影響的 task（`target` 與被重接的 task）`updated` 時間戳更新，時間一律經 `model/clock.ts` 注入。
6. **不動** `target` 的 `body` / `title` / `priority` / `status`。

### 邊界與防呆

- `source` 不存在、`target` 不存在、或 `source === target` → 報錯，exit code 1。
- **去除自我相依**：重接後若 `target` 的 `depends_on` 含 `target` 自身（例如 `target` 原本 `depends_on source`），移除該自我相依。
- **相依去重**：重接後某 task 的 `depends_on` 若同時含 `target` 與原 `source`（重接前），收斂為單一 `target`；其餘重複亦去重。
- **循環防護**：若合併會造成循環相依（與 `doctor` 的循環定義一致），拒絕並提示，不寫入任何變更。
- 預設**硬刪** source（非軟標記 cancelled）。
- 輸出回報併入結果與重接數量，例如：`已將 T-005 併入 T-002，重接 N 個相依`。`--json` 輸出結構化結果（target id、deleted source id、重接的 task id 清單）。

### 原子性

合併涉及多檔寫入（target、被重接的多個 task、刪除 source）。實作須先在記憶體算出所有變更並完成校驗（含循環檢查）後再落盤，避免中途失敗留下半套狀態。

### 程式結構

- 新增 `src/commands/merge.ts`，匯出 `runMerge(root, { source, target, json })`，回傳要印出的字串。
- `src/cli.ts` 新增 `merge` case，以 `parseArgs` 解析 `--into`（string，必填）與 `--json`。
- 重用 `storage/tasks`（讀寫 task）、`storage/history`（追加事件）、`model/clock`（時間）、既有相依/循環判定邏輯（與 `doctor` 共用或抽出共用函式，避免重複實作循環偵測）。

## 第 2 部分：建立時防重（SKILL.md，無程式碼）

在 `skills/taskcli/SKILL.md` 的 Step 1（拆解）與 Step 2（建立 draft）之間插入新步驟：

**New step: Check for duplicates before creating**

- 建立前先 `taskcli list --json` 拉既有 task（量大時用 `--query <keyword>` 縮小候選）。
- 對「這次要建的每一項」與既有 task 做**語意比對**（不只字面相似）。
- 發現疑似重複時，先列給使用者：`new item X` 疑似等於 `T-002 (existing)`，並提供三個選項：
  1. **Skip**（不建這一項）
  2. **Create anyway**（確認是不同的事）
  3. **Update existing**（用 `update T-002` 把新資訊併入既有）
- 使用者裁示後才繼續 `draft create` / `finalize`。
- 同一批內部也去重（同批出現語意相同的兩句）。

並在 Step 5（追蹤管理）補一段**事後清理**指引：

- 需要時 `taskcli list --json` 全掃，找語意重疊的群組列給使用者確認。
- 確認重複後：先把保留件用 `update` 補齊有用內容，再 `taskcli merge <dup> --into <keeper>` 清掉重複件。

SKILL.md 為英文；`test/skill-content.test.ts` 會同步新增斷言（內容須出現 `merge` 與 duplicate-checking 相關字串）。

## 測試策略（TDD）

先寫測試再實作。

- `test/commands/merge.test.ts`：
  - 基本併入（source 刪除、target 保留）。
  - 入向相依重接（依賴 source 的 task 改依賴 target）。
  - source 自身 `depends_on` / `tags` 聯集併入 target 並去重。
  - 重接後自我相依移除。
  - 重接後相依去重。
  - 會造成循環相依時拒絕、且不寫入任何變更。
  - source 不存在 / target 不存在 / `source === target` 報錯。
  - target history 寫入 `merged from <source>` note。
  - source 的 history sidecar 一併刪除。
  - `--json` 輸出結構正確。
- `test/cli.test.ts` 或 `test/commands/merge.test.ts`：`cli.ts` 分派與 `--into` 解析的整合測試。
- `test/skill-content.test.ts`：補英文斷言。

維持 repo 既有的 80%+ 覆蓋目標。

## 文件

- `README.md`：指令一覽與範例加入 `merge`。
- `CHANGELOG.md`：`[Unreleased]` 記一筆 Added。
- `cli.ts` 的 `USAGE` 字串加入 `merge`。
- `skills/taskcli/SKILL.md`：如上述新增步驟。

## 非目標

- 不在 CLI 內做任何語意相似度計算或 LLM 呼叫。
- 不做字面相似度掃描指令（`dupes`）——本次採「純 agent 判斷」路線，字面粗篩非必要。
- 不做軟刪除 / 回收桶；`merge` 直接硬刪 source。
- 不改既有 `.taskcli/` 檔案格式。
- 不處理跨 repo 的重複。
