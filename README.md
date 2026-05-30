# TaskCli

**目前版本：v0.1.0（初步可交付版）**

在任何 repo 的 `.taskcli/` 資料夾中，以「draft → 本地 HTML 審閱 → 正式 task」流程建立並追蹤 task 的 CLI 工具。CLI 純存取、不碰 LLM；自然語言整理交給 AI agent。

## 安裝 / 編譯

```bash
bun install
bun run build        # 產出單一執行檔 dist/taskcli
```

開發時可直接 `bun run src/cli.ts <command>`。

## v0.1.0 範圍

此版本定位為本機 task 管理 CLI 的初版，已完成：

- `.taskcli/` 初始化與設定檔建立。
- `draft → review → finalize` 任務建立流程。
- task 的列出、檢視、更新、完成、刪除。
- schema 欄位：`due`、`depends_on`、`assignee`、`estimate`、`source`。
- 本地 HTML review server，送出後自動關閉。
- GitHub Issues 單向匯入與 `source` upsert。
- `install-bin` 與 `skill install`，方便安裝 binary 與 agent skill。

版本紀錄見 [`CHANGELOG.md`](CHANGELOG.md)，本版交付說明見 [`docs/releases/v0.1.0.md`](docs/releases/v0.1.0.md)。

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
```

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

## 指令一覽

| 指令 | 說明 |
|------|------|
| `init` | 建立 `.taskcli/` 骨架 |
| `draft create --stdin\|--from-json <f>` | 建立 draft |
| `draft list / show <id>` | 檢視 draft |
| `review <id> [--port n] [--open]` | 本地審閱 server |
| `finalize <id>` | draft → tasks |
| `list [--type --status --priority --tag --json]` | 列出 task |
| `show <id> [--json]` / `done <id>` / `rm <id>` | 管理 task |
| `import github [<n>] [--repo --state --label --limit --dry-run]` | 從 GitHub Issues 匯入 |
| `update <id> [--title --type --status --priority --add-tag --rm-tag` `--due YYYY-MM-DD --assignee --estimate --add-dep T-NNN --rm-dep T-NNN]` | 改欄位（scalar 給空字串可清除） |

讀取型指令支援 `--json`，方便 agent 解析。

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

taskcli 內附一個 Claude Code skill，讓 agent 把你的口語/文字整理成 task、引導你在審閱頁確認後建立並追蹤。

安裝（兩者都用編譯後的 binary 執行）：

```bash
taskcli install-bin                 # 把 taskcli 複製到 ~/.local/bin（確認在 PATH）
taskcli skill install               # 把 skill 複製到 ~/.claude/skills/taskcli/
taskcli skill install --dest .claude/skills   # 或裝到某專案
```

裝好後，在該專案對 Claude 說「幫我把這些要做的事整理成 task」即可觸發。

設計與計畫見 `docs/superpowers/`。
