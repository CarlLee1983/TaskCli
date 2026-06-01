# TaskCli Transcript Inbox Design

## Goal

Add a Transcript Inbox to TaskCli so meeting recordings, voice memos, and externally captured audio can be turned into durable text records before an agent整理 them into TaskCli drafts.

This feature is intentionally a pre-task intake layer. Audio or transcript input does not create formal tasks directly.

## Product Boundary

TaskCli remains a local task storage and review tool:

- TaskCli manages transcript records under `.taskcli/`.
- TaskCli may invoke a configured transcription provider command.
- TaskCli does not perform LLM task decomposition.
- Agents read transcripts, clarify intent, and create draft JSON through the existing `draft create` flow.
- Formal tasks still require `review` and `finalize`.

Target flow:

```text
audio file / external transcript
  -> taskcli transcript import/add
  -> .taskcli/transcripts/TR-001.md
  -> agent整理 / clarification / draft JSON
  -> taskcli draft create --stdin
  -> taskcli review
  -> taskcli finalize
```

## Commands

Add a new `transcript` command group.

```bash
taskcli transcript import <audio-file> [--provider <name>] [--title <title>] [--language zh-TW]
taskcli transcript add --from-file <txt-or-md> [--title <title>] [--language zh-TW]
taskcli transcript list [--json]
taskcli transcript show <id> [--json]
taskcli transcript rm <id>
```

### `transcript import`

Imports an audio file by invoking a configured provider command. The provider must write transcript text to stdout. On success, TaskCli stores the text as a transcript markdown file. On failure, TaskCli prints a clear error and does not create a transcript.

### `transcript add`

Imports an already-created text or markdown transcript. This supports workflows where an agent, phone app, cloud service, or local tool performs transcription outside TaskCli.

### `transcript list` / `show`

Expose stable human-readable and JSON output so agents can discover and read transcript records reliably.

### `transcript rm`

Deletes an incorrect or unwanted transcript record. This is intentionally separate from task deletion because transcripts are not tasks.

## Storage Format

Transcripts are stored under:

```text
.taskcli/transcripts/TR-001.md
```

Each transcript is markdown with YAML frontmatter:

```yaml
---
id: "TR-001"
title: "產品週會錄音"
source_file: "/path/to/meeting.m4a"
language: "zh-TW"
provider: "local-whisper"
created: "2026-06-01T10:00:00+08:00"
updated: "2026-06-01T10:00:00+08:00"
drafts: []
tasks: []
---

今天主要討論三件事...
```

Field rules:

- `id`: generated `TR-NNN` identifier.
- `title`: user-provided title or derived from the input filename.
- `source_file`: original input path for both `import` and `add`; for `add`, this is the text or markdown file path.
- `language`: requested transcript language, defaulting to project config or `zh-TW`.
- `provider`: provider name for `import`; omitted for plain `add` unless provided later.
- `drafts` / `tasks`: reserved traceability fields. The first version writes empty arrays and does not update them automatically.

## Provider Configuration

Extend `.taskcli/config.json` with transcript provider configuration:

```json
{
  "transcript": {
    "defaultProvider": "local-whisper",
    "providers": {
      "local-whisper": {
        "command": "whisper-cli {input} --language {language} --output -"
      },
      "cloud-small": {
        "command": "my-transcribe-script {input} --language {language}"
      }
    }
  }
}
```

Provider rules:

- `{input}` is replaced with the audio file path.
- `{language}` is replaced with the requested or default language.
- The command must write final transcript text to stdout.
- Stderr is preserved for diagnostics.
- API keys and model-specific setup are owned by the external command or script, not by TaskCli.
- The first implementation should avoid hardcoded provider SDKs or new package dependencies.

This keeps local models, cloud speech-to-text services, and custom scripts interchangeable without changing TaskCli internals.

## Agent Collaboration Contract

Agents should treat transcripts as raw intake records, not approved task definitions.

Recommended agent flow:

```bash
taskcli transcript list --json
taskcli transcript show TR-001 --json
```

The agent then:

1. Summarizes the transcript.
2. Identifies action items and ambiguities.
3. Asks clarifying questions when needed.
4. Produces draft JSON for existing `taskcli draft create --stdin`.
5. Sends the user through review/finalize before task creation.

TaskCli should not infer priorities, owners, dependencies, or acceptance criteria from the transcript by itself.

## Error Handling

Expected failures:

- TaskCli project is not initialized.
- Audio file or transcript file does not exist.
- Provider name is unknown.
- Provider command is not configured.
- Provider command exits non-zero.
- Provider command exits successfully but stdout is empty.
- Transcript ID does not exist for `show` or `rm`.

Failure behavior:

- Print a concise user-facing error.
- Do not create partial transcript records.
- Include provider stderr when useful.
- Keep JSON output stable for successful read commands.

## Testing Scope

Add tests for:

- `transcript add --from-file` creates `TR-001.md`.
- `transcript import` works with a fake provider command that writes known stdout.
- `transcript list --json` returns stable transcript metadata.
- `transcript show --json` returns metadata and body.
- Unknown provider fails clearly.
- Provider command failure does not create a transcript.
- Empty provider stdout fails clearly.
- Existing draft/task/history tests remain unchanged.

## Non-Goals For First Version

- Built-in OpenAI, Whisper, whisper.cpp, MLX, or other provider SDK integration.
- Direct audio recording from the CLI.
- Speaker diarization.
- Automatic task creation from audio.
- Automatic draft/task back-reference updates.
- Long-running meeting chunking or resumable transcription.
- Web UI for transcript review.

These can be added later once the transcript inbox model proves useful.

## Design Rationale

The provider-command design gives TaskCli a small, testable integration surface while supporting both local and cloud small-model transcription. It preserves the existing architecture: TaskCli owns durable project data and reviewable workflows; agents own natural-language understanding and task decomposition.
