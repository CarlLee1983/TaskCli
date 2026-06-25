---
name: taskcli
description: Manage "this project's development implementation tasks" with taskcli. Use when the user describes a batch of development work in natural language or text (feature/bug fix/refactor/docs/test/chore), asks to organize it into a task list, or wants to track and manage existing tasks (list/start/complete/edit). Creates and manages tasks under the repo's .taskcli/ via the taskcli CLI.
---

# TaskCli — Manage this project's development tasks via CLI

Turn the user's spoken or written description of development work into structured tasks, formally create them after the user confirms in a local HTML review page, and track and manage them afterward.

The CLI is storage-only and never touches an LLM: natural-language understanding and classification are done by you (the agent), then you call `taskcli`. Always add `--json` to read-type commands for easy parsing.

## Preflight checks

1. Confirm `taskcli` is on PATH (`taskcli --help`). If not, ask the user to run `taskcli install-bin`, or `bun run build` first.
2. Confirm the current repo has a `.taskcli/` directory. If not, run `taskcli init` first.

## Step 1: Break the description into task items

Split the user's description into independent development tasks. For each, decide:

- `title`: a single, action-oriented sentence (e.g. "Implement login API").
- `type`: aligned with git commit types — `feature` (new feature) / `fix` (bug fix) / `refactor` / `docs` / `test` / `chore` (miscellaneous).
- `priority`: `low` / `med` (default) / `high`. Give `high` to anything clearly urgent or blocking.
- `tags`: optional domain tags (e.g. `auth`, `api`).

When unsure about type/priority, use a reasonable default — the user can adjust it on the review page.

## Step 2: Create a draft

Feed the organized result to the CLI as JSON via stdin:

```bash
echo '{
  "source": "the user's original description (kept for traceability)",
  "items": [
    { "title": "Implement login API", "type": "feature", "priority": "med", "tags": ["auth"] },
    { "title": "Fix email verification", "type": "fix", "priority": "high", "tags": ["auth"] }
  ]
}' | taskcli draft create --stdin
```

The output gives a draft id (e.g. `D-001`).

## Step 3: Ask the user to review (important)

`taskcli review` launches a local review page and **blocks until the user clicks "Submit"** (the server auto-closes and exits after submission; can also be aborted with Ctrl+C). **Do not run it in the foreground yourself**, or you'll hang waiting for the user. Instead, ask the user to run it themselves (in Claude Code they can use the `!` prefix to run it within the session):

> Please run `! taskcli review D-001 --open`. On the page that opens, check the items to include, adjust type/priority/title, add or remove items, click "Submit", then let me know.

Wait until the user confirms submission before continuing.

## Step 4: Finalize

```bash
taskcli finalize D-001
```

This generates one formal task for each item marked "include" on the review page (e.g. `T-001`, `T-002`) and deletes that draft. Report the generated ids to the user.

## Step 5: Track and manage

| User intent | Command |
|-------------|---------|
| List todo / all | `taskcli list --json` (optionally `--status todo` `--type fix` `--priority high` `--tag auth`) |
| Show a single task | `taskcli show T-001 --json` |
| Start working | `taskcli update T-001 --status in_progress` |
| Complete | `taskcli done T-001` |
| Edit fields | `taskcli update T-001 --title ... --priority high --add-tag x --rm-tag y` |
| Set schedule/assignee/estimate/dependency | `taskcli update T-001 --due 2026-06-15 --assignee carl --estimate 3d --add-dep T-002` (`--rm-dep` to remove; pass an empty string to a scalar to clear it) |
| Cancel/delete | `taskcli rm T-001` |

## Import from GitHub Issues

When the user wants to turn GitHub issues into tasks, ask them to run `taskcli import github` (or assemble the command for them):

- By default imports the current repo's open issues; you can add `--repo owner/repo`, `--state all`, `--label bug`, `--limit 50`, or pass `<n>` to import a single issue.
- Recommend a `--dry-run` preview before the real import.
- Sources are identified by `source: github:owner/repo#<n>`, so re-running updates rather than recreates (one-way import; overwrites local status with the issue's status).
- After importing, track them with `list` / `show` / `update` as usual.

## Error handling

- "Cannot find .taskcli": ask the user to run `taskcli init` first.
- finalize reports "no included items": ask the user to go back to the review page, check at least one item, and submit again, or verify the draft id is correct.
