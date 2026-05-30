# TaskCli Agent Skill 設計文件

- **日期**：2026-05-30
- **狀態**：已確認，待寫實作計畫
- **作者**：Carl + Claude
- **前置**：依賴已完成的 TaskCli v1（見 `2026-05-30-taskcli-design.md`）

## 1. 目標與動機

為 TaskCli 補上「agent 用的 skill」，串起最初的核心訴求：使用者用口語或文字描述一批開發工作，Claude（agent）整理成 task draft、引導使用者在本地 HTML 審閱頁確認後 finalize，並負責後續追蹤管理。

這一輪交付兩件事：

1. **agent skill**（`skills/taskcli/SKILL.md`）：教 Claude 何時與如何使用 taskcli CLI。
2. **兩個安裝子指令**：`taskcli skill install` 與 `taskcli install-bin`，讓安裝 CLI 的人把 skill 與 binary 放到自己選的位置。

## 2. 散布與安裝模型

- skill 原始檔放在 TaskCli repo 的 `skills/taskcli/SKILL.md`，隨程式碼版控（唯一真實來源）。
- skill 內容於**編譯時嵌入 binary**：`src/commands/skill.ts` 以 `import SKILL_MD from "../../skills/taskcli/SKILL.md" with { type: "text" }` 載入，`bun build --compile` 會打包進單一執行檔，因此 binary 可獨立散布並寫出 skill。
- 安裝者用 `taskcli skill install` 把 skill 複製到自己選的 skills 目錄（個人 `~/.claude/skills/` 或某專案 `.claude/skills/`），用 `taskcli install-bin` 把 binary 放上 PATH。

## 3. 互動流程（skill 教 agent 的行為）

```
使用者（語音/文字）描述要做的開發任務
   │
agent 確保 .taskcli/ 存在（沒有就 taskcli init）
   │
agent 把內容拆成 dev task items：
   每項判斷 title / type(feature|fix|refactor|docs|test|chore) / priority(low|med|high) / tags
   │
agent: echo '<json>' | taskcli draft create --stdin   → 取得 D-001
   │
agent 請使用者審閱：請使用者執行 `! taskcli review D-001 --open`（在 session 內跑），
   使用者在瀏覽器勾選/改 type/增刪項目/送出
   │
使用者回一句「好了 / 確認」
   │
agent: taskcli finalize D-001   → 生成 T-001…，回報結果
   │
後續追蹤：使用者說「列出待辦 / T-001 開始做 / T-001 完成」
   → agent 對應 taskcli list --json / update --status in_progress / done
```

**關鍵約束**：`taskcli review` 會阻塞直到 Ctrl+C，所以 **agent 不在前景自己跑 server**。它請使用者用 `!` 前綴或自己的終端機跑 review，審閱送出後使用者說一聲，agent 再 finalize。

## 4. skill 檔案（`skills/taskcli/SKILL.md`）

單一自足檔案。frontmatter：

```yaml
---
name: taskcli
description: 用 taskcli 管理「本專案的開發實作任務」。當使用者用口語或文字描述一批要做的開發工作（功能/修 bug/重構/文件/測試/雜項）、要求整理成 task 清單、或要追蹤管理既有 task（列出/開始/完成/修改）時使用。透過 taskcli CLI 在該 repo 的 .taskcli/ 建立與管理 task。
---
```

內文涵蓋：

1. **前置檢查**：先確認 PATH 有 `taskcli`；確認當前 repo 有 `.taskcli/`，沒有就 `taskcli init`。
2. **拆 task 與分類**：如何把口語拆成獨立 items，如何判斷 type（對齊 git commit type）與 priority。
3. **建立 draft**：`echo '<json>' | taskcli draft create --stdin` 的 JSON 結構與範例。
4. **審閱交接話術**：請使用者執行 `! taskcli review D-001 --open`，等使用者確認送出後再繼續（明確說明 agent 不要自己前景跑 review）。
5. **finalize**：`taskcli finalize D-001`，回報生成的 task 編號。
6. **追蹤管理指令對照表**：列出/顯示/開始/完成/改欄位/刪除 → 對應 taskcli 指令。
7. **錯誤處理**：找不到 `.taskcli`（提示 init）、finalize 無 include 項目（請使用者回審閱頁勾選）。

**慣例**：所有讀取型操作一律加 `--json` 方便 agent 解析。

draft JSON 範例（skill 內示範給 agent）：

```json
{
  "source": "我想做登入跟註冊，順便修個 email 驗證的 bug",
  "items": [
    { "title": "實作登入 API", "type": "feature", "priority": "med", "tags": ["auth"] },
    { "title": "實作註冊 API", "type": "feature", "priority": "med", "tags": ["auth"] },
    { "title": "修復 email 驗證", "type": "fix", "priority": "high", "tags": ["auth"] }
  ]
}
```

## 5. 安裝子指令

| 指令 | 行為 |
|------|------|
| `taskcli skill install [--dest <dir>] [--force]` | 把嵌入的 SKILL.md 寫到 `<dest>/taskcli/SKILL.md`，預設 dest = `~/.claude/skills`。目標已存在時需 `--force` 才覆寫，否則丟出可行動錯誤。 |
| `taskcli install-bin [--dest <dir>]` | 把目前執行中的 binary 複製到 `<dest>`（預設 `~/.local/bin`），設可執行位元。提醒使用者確認該目錄在 PATH。 |

- skill 內容來源：編譯時嵌入的 `SKILL_MD` 字串。
- install-bin 來源：目前執行檔路徑 `process.execPath`。若以 `bun run`（開發模式，execPath 指向 bun 本身）執行，給明確提示「請先 `bun run build`，用編譯後的 `dist/taskcli` 執行此指令」，不複製 bun。
- `~` 展開為 `os.homedir()`。

## 6. 架構（沿用既有分層，多小檔、高內聚）

- `skills/taskcli/SKILL.md` — skill 來源（版控、編譯嵌入）
- `src/commands/skill.ts` — `runSkillInstall(opts)`；可測核心 `installSkillTo(destBaseDir, content, force)` 回傳寫入路徑
- `src/commands/installBin.ts` — `runInstallBin(opts, execPath)`；可測核心 `copyBinaryTo(srcPath, destDir)` 回傳目標路徑
- `src/cli.ts` — 新增 `skill install`、`install-bin` 分派與 USAGE 條目
- 對應測試：`test/commands/skill.test.ts`、`test/commands/installBin.test.ts`

家目錄展開等小工具可放入既有 `src/storage/paths.ts` 或就地處理（視實作最簡者）。

## 7. 錯誤處理

- `skill install` 目標已存在且未給 `--force`：丟出含「加 --force 覆寫」提示的錯誤，不靜默覆蓋。
- `install-bin` 在開發模式（execPath 非編譯 binary）：丟出提示先 build，不複製錯誤檔。
- 寫檔沿用 `atomicWrite`／建立目錄沿用 `ensureDir`。
- 錯誤訊息對使用者安全、可行動。

## 8. 測試策略（維持 80%+，全綠）

- **installSkillTo**：寫入暫存 dest → 驗證 `<dest>/taskcli/SKILL.md` 內容等於來源；已存在無 `--force` 丟錯；`--force` 覆寫成功。
- **copyBinaryTo**：以暫存假 binary 為來源複製到暫存 dest → 驗證內容相同且具可執行位元。
- **SKILL.md 內容檢查**：合法 frontmatter（含 `name:`、`description:`）；內文含關鍵指令字串（`draft create`、`finalize`、`--json`）。
- **CLI 分派**（沿用 e2e 風格，選擇性）：`taskcli skill install --dest <tmp>` 成功寫出檔案、退出碼 0。
- 維持 `bun test` 與 `bunx tsc --noEmit`（strict）全綠。

## 9. 明確排除（這輪不做，留待後續）

- ❌ 跨平台 binary 編譯（`--target=bun-linux-x64` 等）
- ❌ 自動把目錄加入 PATH（只提醒，不改 shell 設定）
- ❌ skill 拆成多檔／reference（先單一 SKILL.md）
- ❌ draft 的 CLI 編輯指令（審閱改在 HTML 頁完成）
- ❌ 與外部 PM 軟體整合（延續 v1 排除）
