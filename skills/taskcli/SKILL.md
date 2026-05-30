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

`taskcli review` 會啟動本地審閱頁並**阻塞直到使用者按「送出」**（送出後 server 會自動關閉並退出；也可按 Ctrl+C 中止）。**不要由你在前景執行它**，否則會卡住等使用者操作。改為請使用者自行執行（在 Claude Code 可用 `!` 前綴在 session 內跑）：

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
| 設排程/負責人/估時/相依 | `taskcli update T-001 --due 2026-06-15 --assignee carl --estimate 3d --add-dep T-002`（`--rm-dep` 移除；scalar 給空字串可清除） |
| 取消/刪除 | `taskcli rm T-001` |

## 從 GitHub Issues 匯入

當使用者想把 GitHub issue 轉成 task 時，請使用者執行 `taskcli import github`（或代為組指令）：

- 預設匯入目前 repo 的 open issues；可加 `--repo owner/repo`、`--state all`、`--label bug`、`--limit 50`，或帶 `<n>` 只匯入單一 issue。
- 建議先 `--dry-run` 預覽再實際匯入。
- 以 `source: github:owner/repo#<n>` 辨識來源，重跑為更新而非重建（單向匯入，會以 issue 狀態覆寫本地 status）。
- 匯入後照常用 `list` / `show` / `update` 追蹤。

## 錯誤處理

- 「找不到 .taskcli」：請使用者先 `taskcli init`。
- finalize 報「沒有 include 項目」：請使用者回審閱頁至少勾選一項再送出，或確認 draft 編號正確。
