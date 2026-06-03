# TaskCli Slack 整合設計（個人本機雙向 bot）

- 日期：2026-06-03
- 狀態：已核可，待實作
- 範圍：新增 `taskcli slack` 指令，以 Slack Socket Mode 啟動一個前景常駐 bot，讓使用者從 Slack 對「單一固定」`.taskcli/` 工作區做讀取、建立、改狀態三類操作。

## 目標

讓使用者不必切回終端機，就能從 Slack 用 slash command 對本機某個固定 repo 的 `.taskcli/` 做最常用的 task 操作：

- **讀**：`list` / `next` / `show`
- **建**：`add`
- **改狀態**：`wip`（in_progress）/ `done`

bot 是 taskCli 的第三種前端（既有 CLI、HTML review server 之外），透過行程內呼叫既有 command/storage 函式運作，**核心邏輯零改動**。維持 CLI「純存取、不碰 LLM」原則：bot 只讀寫 `.taskcli/` 內的結構化資料。

## 非目標

- 不做 draft → review → finalize 流程（牽涉本地 HTML review server，放進 Slack 體驗尷尬）。
- 不做團隊共用伺服器 / 多人授權 / 公開 HTTPS endpoint（採 Socket Mode，無公開入口）。
- 不做多 repo 路由（先做單一固定 repo；未來擴成「一張 channel→path 映射表」即可）。
- 不做出站變動通知（task 變動主動推播 channel）——本次聚焦入站操作。
- Phase 1 不做 Block Kit 互動按鈕（見下方 Phase 規劃，phase 2 再疊上）。

## 運作環境與關鍵取捨

- **個人本機、單一使用者**：bot 跑在使用者的 Mac 上，操作本機一個固定 repo 的 `.taskcli/`。
- **Slack Socket Mode**：bot 以 WebSocket 主動外連 Slack，**不需要公開網址 / ngrok / webhook 入口**，無 SSRF 或 webhook 偽造面，契合 security 紅線（不開公網入口）。
- **行程內直接呼叫**：bot 與 CLI 同一 codebase、同一 Bun runtime，直接 import command/storage 函式拿型別化資料，不必解析 stdout。
- **依賴**：新增 `@slack/bolt`（官方框架，內建 Socket Mode、slash command、Block Kit、interactivity）。只影響 bot 這條路徑，CLI 核心維持零 runtime 依賴。

## 架構（方案 A：獨立 slack 模組、bot 為第三前端）

```
Slack workspace
   │ (slash command；phase 2 再加 button)  ── Socket Mode WebSocket ──┐
   ▼                                                                   ▼
src/slack/
  bot.ts        # Bolt App 建立、Socket Mode 啟動、註冊 /task handler（極薄、不放邏輯）
  config.ts     # 讀 bot 設定（repoPath、allowedUserIds）+ 啟動前驗證
  auth.ts       # user ID allowlist 檢查（純函式）
  router.ts     # 解析 "/task <sub> <args>" → { action, args }（純函式）
  actions.ts    # 薄層：呼叫 runList/runNext/runShow/runAdd/runUpdate/runDone(root, ...)
  format.ts     # 結果 → Slack 訊息（phase 1 文字 code block；phase 2 Block Kit）
src/commands/slack.ts  # 串接：載入 config → 啟動 bot（由 cli.ts 的 case "slack" 呼叫）
test/slack/*.test.ts
```

`cli.ts` 新增 `case "slack"`，解析 `--config <path>`，呼叫啟動函式。

### 重用既有程式

- command 層（皆吃 `root` 並回傳格式化字串）：`runList` / `runNext` / `runShow` / `runAdd` / `runUpdate` / `runDone`（`src/commands/tasks.ts`）。
- storage 層（phase 2 渲染 Block Kit 用結構化資料）：`listTasks(root)`（`src/storage/tasks.ts`）。
- `loadConfig` / `ResolvedConfig`（`src/storage/config.ts`）依需要沿用。

## 設定與啟動

bot 設定不放進 `.taskcli/`（那是 task 資料），放使用者層級設定檔，token 走 env var：

```jsonc
// ~/.config/taskcli/slack.json
{
  "repoPath": "/Users/carl/Dev/CMG/TaskCli/.taskcli",  // 單一固定 repo 的 .taskcli 路徑
  "allowedUserIds": ["U0XXXXXXX"]                        // 允許操作的 Slack user ID（你個人）
}
```

```bash
# token 只走 env，不進檔案、不進 git
export SLACK_BOT_TOKEN=xoxb-...   # Bot Token，OAuth scopes: commands, chat:write, users:read
export SLACK_APP_TOKEN=xapp-...   # App-Level Token，scope: connections:write（Socket Mode 用）

taskcli slack                              # 前景啟動，Ctrl-C 結束
taskcli slack --config ~/path/slack.json   # 指定設定檔（可選，預設 ~/.config/taskcli/slack.json）
```

啟動前驗證（fail loudly，任一缺即印清楚錯誤並 exit 非 0）：

- `SLACK_BOT_TOKEN`、`SLACK_APP_TOKEN` 兩個 env 皆存在。
- `repoPath` 存在且為合法 `.taskcli` 目錄。
- `allowedUserIds` 非空陣列。

## 指令對應（Phase 1：純文字）

| Slack 指令 | bot 呼叫 | 回覆 |
|---|---|---|
| `/task list [status]` | `runList(root, {status})` | 字串包成 Slack code block |
| `/task next` | `runNext(root, {})` | 同上 |
| `/task show T-001` | `runShow(root, "T-001", {})` | 同上 |
| `/task add 標題 [#type] [!priority]` | `runAdd(root, title, opts)` | 回新建 ID |
| `/task wip T-001` | `runUpdate(root, id, {status:"in_progress"})` | 回確認 |
| `/task done T-001` | `runDone(root, id, {})` | 回確認 |
| `/task help` | —（router 內建 usage） | 列出可用子指令 |

- 回覆預設 **ephemeral**（只有觸發者看得到，不洗版），契合「個人本機」。
- `add` 的 `#type` / `!priority` 為可選 token，缺省時由 `.taskcli` config 的 default 帶入（沿用 `runAdd` 既有行為）。

## 錯誤處理（於邊界處理，符合 coding-style）

- **權限**：非 allowlist user → 立即 ephemeral 回「無權限」，不執行任何 action。
- **解析錯誤**：未知子指令 / 缺參數 → 回該指令 usage，不丟 stack trace。
- **action 錯誤**：核心函式 throw（如 `T-999` 不存在）→ catch 後回友善訊息；原始錯誤只記在 bot 本機 log，不外洩到 Slack（不洩漏路徑等敏感資訊）。
- **Socket 斷線**：Bolt 內建自動重連，`bot.ts` 不自行處理。

## 安全

- token 僅來自 env var，絕不寫入 `slack.json`、不進 git。
- `slack.json` 不含密鑰，但仍建議放 `~/.config` 而非 repo。
- allowlist 是唯一授權閘；Socket Mode 無公開入口，無 webhook 偽造 / SSRF 面。

## Phase 規劃

- **Phase 1（本次）**：Socket Mode + slash command 純文字，讀 / 建 / 改狀態三類動作可用。
- **Phase 2（之後）**：`format.ts` 改吐 Block Kit，`list` 改用結構化 `listTasks(root)` 渲染每列帶「進行中 / 完成」按鈕；`actions.ts` 新增 interactive payload handler。**核心邏輯與 phase 1 不動**，僅擴互動層。互動層自一開始就與核心分離，確保 phase 2 不需回頭改 router/actions 的契約。

## 測試（純函式優先，目標 80%）

- `router.ts` 解析：`/task add ...`、`/task done T-1`、未知子指令、缺參數、`#type`/`!priority` token → 純函式單元測試（不碰 Slack）。
- `auth.ts` allowlist：在清單內 / 不在 / 空清單 → 單元測試。
- `config.ts` 驗證：缺 token、repoPath 不存在 / 非 `.taskcli`、allowlist 空 → 單元測試。
- `format.ts`：給定 `runList` 字串 / `Task[]` → 預期 Slack 訊息結構 → 單元測試。
- `actions.ts`：沿用既有依賴注入（如 `runDone` 的 `now`）對暫存 `.taskcli` 跑整合測試。
- **不測** Bolt / Socket 連線本身（外部 I/O）；`bot.ts` 維持極薄、不放邏輯，故不需單元測試。
