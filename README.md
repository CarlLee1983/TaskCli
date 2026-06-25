# TaskCli

**目前版本：v0.5.0**

在任何 repo 的 `.taskcli/` 資料夾中，以「draft → 本地 HTML 審閱 → 正式 task」流程建立並追蹤 task 的 CLI 工具。CLI 純存取、不碰 LLM；自然語言整理交給 AI agent。

## 安裝

從 npm 全域安裝（一般使用者，需 Node >= 20）：

```bash
npm i -g @carllee1983/taskcli
taskcli --version
```

### 從原始碼編譯（開發者，需 Bun）

```bash
bun install
bun run build        # 產出 Node bundle dist/cli.js（npm 發佈用 bin）
bun run compile      # 產出單一原生執行檔 dist/taskcli（install-bin 用）
```

開發時可直接 `bun run src/cli.ts <command>`。

## 功能範圍

本機 task 管理 CLI，目前已完成：

- `.taskcli/` 初始化與設定檔建立。
- `draft → review → finalize` 任務建立流程，含本地 HTML review server（送出後自動關閉）。
- task 的快速建立（`add`）、列出 / 搜尋 / 排序、檢視、更新、完成、刪除，以及 `next` 可執行排序。
- schema 欄位：`due`、`depends_on`、`assignee`、`estimate`、`source`。
- task history：append-only JSONL sidecar、`history add/list/view` 與只讀 HTML timeline。
- transcript inbox：`transcript import/add/list/show/rm`，以 provider command 轉錄音檔或匯入文字稿。
- GitHub Issues 單向匯入與 `source` upsert。
- `doctor`：檢查 `.taskcli/` 工作區健康度（task 完整性、相依關係、目錄與設定、sidecar 一致性），`--fix` 安全修復、`--json` 供 agent 取用，發現 error 時 exit code 為 1。
- `slack`：以 Slack Socket Mode 啟動前景常駐 bot，從 Slack 用 `/task` slash command 對單一固定 repo 的 `.taskcli/` 做 list/next/show/add/wip/done（個人本機、user allowlist 授權；token 走 env var）。
- `install-bin` 與 `skill install`，方便安裝 binary 與 agent skill。

完整版本紀錄見 [`CHANGELOG.md`](CHANGELOG.md)；各版交付說明見 [`docs/releases/`](docs/releases/)。

## 流程

```bash
taskcli init                          # 在當前 repo 建 .taskcli/
echo '{"source":"做登入","items":[{"title":"登入 API","type":"feature"}]}' \
  | taskcli draft create --stdin      # 建 draft（agent 通常餵這段 JSON）
taskcli review D-001 --open           # 開瀏覽器審閱、修改、送出
taskcli finalize D-001                # 生成正式 task
taskcli list                          # 追蹤
taskcli update T-001 --status in_progress
taskcli done T-001
taskcli doctor                        # 診斷 .taskcli 工作區
taskcli doctor --fix                  # 安全自動修復
```

## Slack 整合（個人本機 bot）

```bash
# 設定檔：~/.config/taskcli/slack.json（repoPath 為含 .taskcli 的 repo 根目錄）
# { "repoPath": "/Users/you/Dev/your-repo", "allowedUserIds": ["U0XXXXXXX"] }

export SLACK_BOT_TOKEN=xoxb-...   # scopes: commands, chat:write, users:read
export SLACK_APP_TOKEN=xapp-...   # scope: connections:write（Socket Mode）

taskcli slack                     # 前景啟動，Ctrl+C 結束
```

Slack 內可用：`/task list [status]`、`/task next`、`/task show T-001`、
`/task add 標題 [#type] [!priority]`、`/task wip T-001`、`/task done T-001`、`/task help`。

## task 結構（`.taskcli/tasks/T-001.md`）

```yaml
---
id: "T-001"
title: "實作登入 API"
type: "feature"      # feature|fix|refactor|docs|test|chore
status: "todo"       # todo|in_progress|done|cancelled
priority: "med"      # low|med|high
tags: ["auth"]
# 以下皆選填，未設定時不輸出
due: "2026-06-15"          # 截止日 YYYY-MM-DD
assignee: "carl"           # 負責人
estimate: "3d"             # 工時估計（自由字串，如 2h/3d/5pt）
depends_on: ["T-002"]      # 相依 task ID（T-NNN）
created: "2026-05-30T10:00:00+08:00"
updated: "2026-05-30T10:00:00+08:00"
---

描述內文
```

## transcript inbox（語音 / 文字稿前置整理）

TaskCli 可以把會議錄音、口頭 memo 或外部工具產生的文字稿先存成 transcript record。Transcript 不是正式 task；agent 讀取 transcript 後，再整理成 `draft create` JSON，最後仍走 `review → finalize`。

```bash
# 匯入既有文字稿
taskcli transcript add --from-file meeting.md --title "產品週會"

# 透過 provider command 轉錄音檔
taskcli transcript import meeting.m4a --provider local-whisper --language zh-TW

# 給 agent 讀取
taskcli transcript list --json
taskcli transcript show TR-001 --json
```

Provider 設定放在 `.taskcli/config.json`：

```json
{
  "transcript": {
    "defaultProvider": "local-whisper",
    "defaultLanguage": "zh-TW",
    "providers": {
      "local-whisper": {
        "command": "whisper-cli {input} --language {language} --output -"
      }
    }
  }
}
```

Provider command 必須把文字稿輸出到 stdout。API key、模型安裝、雲端服務設定都由外部 command 或 script 負責。

## task history（`.taskcli/history/T-001.jsonl`）

TaskCli 可為每個 task 保留 append-only 開發歷程，不改動 task markdown 本體：

````jsonl
{"id":"E-001","task_id":"T-001","type":"source","created":"2026-05-30T10:00:00+08:00","title":"Agent plan","body":"由 agent plan 拆出此 task"}
{"id":"E-002","task_id":"T-001","type":"status_change","created":"2026-05-30T10:30:00+08:00","title":"todo -> in_progress","body":"","meta":{"from":"todo","to":"in_progress"}}
{"id":"E-003","task_id":"T-001","type":"verification","created":"2026-05-30T11:00:00+08:00","author":"agent","body":"bun test passed"}
````

手動可追加 `note`、`decision`、`verification`、`source`。`status_change` 由 `update --status` / `done` 自動產生。

## 指令一覽

| 指令 | 說明 |
|------|------|
| `init` | 建立 `.taskcli/` 骨架 |
| `draft create --stdin\|--from-json <f>` | 建立 draft |
| `draft list / show <id>` | 檢視 draft |
| `review <id> [--port n] [--open]` | 本地審閱 server |
| `finalize <id>` | draft → tasks |
| `list [--type --status --priority --tag --query --sort --desc --limit --json]` | 列出 / 搜尋 / 排序 task |
| `add <title> [--type --priority --tag --body --json]` | 快速建立單一正式 task |
| `show <id> [--json]` / `done <id>` / `rm <id>` | 管理 task |
| `merge <source> --into <target> [--json]` | 合併重複 task：重接入向相依、聯集來源 tags/depends_on、記 history note 後刪除來源 |
| `next [--limit n --json]` | 顯示下一個可執行 task |
| `history add <task-id> --type note\|decision\|verification\|source [--title --body --body-file --author]` | 追加 task 開發歷程 |
| `history list <task-id> [--json]` | 列出 task 歷程 |
| `history view <task-id> [--port n] [--open]` | 啟動單一 task 只讀歷程頁 |
| `transcript import <audio-file> [--provider --title --language]` | 使用設定的 provider command 轉錄音檔並存成 transcript |
| `transcript add --from-file <file> [--title --language]` | 匯入既有文字稿 |
| `transcript list/show/rm` | 列出、檢視、刪除 transcript |
| `import github [<n>] [--repo --state --label --limit --dry-run]` | 從 GitHub Issues 匯入 |
| `update <id> [--title --type --status --priority --add-tag --rm-tag` `--body --body-file --due YYYY-MM-DD --assignee --estimate --add-dep T-NNN --rm-dep T-NNN]` | 改欄位（scalar 給空字串可清除） |
| `--version` | 顯示版本 |

讀取型指令支援 `--json`，方便 agent 解析。

常用補充：

```bash
taskcli add "補 README 範例" --tag docs --body "補 quick add 用法"
taskcli list --status todo --query github --sort priority --desc --limit 5
taskcli next --limit 3
taskcli update T-001 --body "驗收條件..."      # 直接覆寫 task 內文
taskcli update T-001 --body-file notes.md      # 從檔案讀取 task 內文
taskcli update T-001 --due "" --assignee "" --estimate ""  # 清除 scalar 選填欄位
taskcli history add T-001 --type decision --title "採 sidecar JSONL" --body "保持 task markdown 相容"
taskcli history add T-001 --type verification --author agent --body "bun test passed"
taskcli history view T-001 --open
taskcli merge T-005 --into T-002              # 把重複的 T-005 併入 T-002
```

## 從 GitHub Issues 匯入

需先安裝 GitHub CLI 並 `gh auth login`。

```bash
# 匯入目前 repo 的 open issues（dry-run 先預覽）
taskcli import github --dry-run
taskcli import github

# 指定 repo / 範圍
taskcli import github --repo owner/repo --state all --label bug --limit 50

# 只匯入單一 issue
taskcli import github 42
```

以 `source: github:owner/repo#<n>` 辨識來源，重跑時更新既有 task 而非重建。
注意：import 為單向，re-import 會以 issue 狀態覆寫本地 status。

## 給 AI agent 使用（skill）

taskcli 內附一個 Claude Code skill，讓 agent 把你的口語/文字整理成 task、引導你在審閱頁確認後建立並追蹤。skill 內容已嵌進 CLI，npm 全域安裝後即可直接安裝：

```bash
taskcli skill install               # 把 skill 複製到 ~/.claude/skills/taskcli/
taskcli skill install --dest .claude/skills   # 或裝到某專案
```

裝好後，在該專案對 Claude 說「幫我把這些要做的事整理成 task」即可觸發。

> 不想裝 Node、想用單一原生執行檔的離線情境，可改用 `bun run compile` 產出的 `dist/taskcli`，並以 `taskcli install-bin` 複製到 `~/.local/bin`（須在 PATH）。一般使用者用上面的 `npm i -g` 即可，不需要 `install-bin`。

設計與計畫見 `docs/superpowers/`。

## License

MIT，見 [`LICENSE`](LICENSE)。
