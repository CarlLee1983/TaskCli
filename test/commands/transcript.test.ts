import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import {
  runTranscriptAdd,
  runTranscriptImport,
  runTranscriptList,
  runTranscriptRm,
  runTranscriptShow,
} from "../../src/commands/transcript";
import { transcriptPath } from "../../src/storage/transcripts";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "tr-cmd-"));
  runInit(root);
  return root;
}

test("transcript add --from-file 建立 TR-001", () => {
  const root = setup();
  const source = join(root, "memo.md");
  writeFileSync(source, "記得整理 onboarding 流程\n", "utf8");
  const out = runTranscriptAdd(root, {
    fromFile: source,
    title: "語音備忘",
    language: "zh-TW",
    now: () => "2026-06-01T10:00:00+08:00",
  });
  expect(out).toContain("TR-001");
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(true);
  const shown = JSON.parse(runTranscriptShow(root, "TR-001", { json: true }));
  expect(shown).toMatchObject({
    id: "TR-001",
    title: "語音備忘",
    source_file: source,
    language: "zh-TW",
    drafts: [],
    tasks: [],
    body: "記得整理 onboarding 流程\n",
  });
});

test("transcript add 未提供 title 時用檔名", () => {
  const root = setup();
  const source = join(root, "quick-note.txt");
  writeFileSync(source, "quick note", "utf8");
  runTranscriptAdd(root, {
    fromFile: source,
    now: () => "2026-06-01T10:00:00+08:00",
  });
  const shown = JSON.parse(runTranscriptShow(root, "TR-001", { json: true }));
  expect(shown.title).toBe("quick-note");
  expect(shown.language).toBe("zh-TW");
});

test("transcript list human 與 json output", () => {
  const root = setup();
  const a = join(root, "a.md");
  const b = join(root, "b.md");
  writeFileSync(a, "alpha", "utf8");
  writeFileSync(b, "beta", "utf8");
  runTranscriptAdd(root, { fromFile: a, title: "Alpha", now: () => "2026-06-01T10:00:00+08:00" });
  runTranscriptAdd(root, { fromFile: b, title: "Beta", now: () => "2026-06-01T10:01:00+08:00" });

  expect(runTranscriptList(root, {})).toContain("TR-001  Alpha");
  const parsed = JSON.parse(runTranscriptList(root, { json: true }));
  expect(parsed.map((t: { id: string; title: string }) => [t.id, t.title])).toEqual([
    ["TR-001", "Alpha"],
    ["TR-002", "Beta"],
  ]);
  expect(parsed[0].body).toBeUndefined();
});

test("transcript show human output returns markdown", () => {
  const root = setup();
  const source = join(root, "memo.md");
  writeFileSync(source, "body text", "utf8");
  runTranscriptAdd(root, { fromFile: source, title: "Memo", now: () => "2026-06-01T10:00:00+08:00" });
  const out = runTranscriptShow(root, "TR-001", {});
  expect(out).toContain('id: "TR-001"');
  expect(out).toContain("body text");
});

test("transcript rm 刪除 transcript", () => {
  const root = setup();
  const source = join(root, "memo.md");
  writeFileSync(source, "body", "utf8");
  runTranscriptAdd(root, { fromFile: source, now: () => "2026-06-01T10:00:00+08:00" });
  expect(runTranscriptRm(root, "TR-001")).toContain("TR-001");
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});

test("transcript import 使用 fake provider stdout 建立 transcript", async () => {
  const root = setup();
  const audio = join(root, "meeting.m4a");
  writeFileSync(audio, "fake audio", "utf8");
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      defaultType: "feature",
      defaultPriority: "med",
      transcript: {
        defaultProvider: "fake",
        defaultLanguage: "zh-TW",
        providers: {
          fake: { command: "printf '轉錄 {language} %s\\n' {input}" },
        },
      },
    }),
    "utf8",
  );

  const out = await runTranscriptImport(root, audio, {
    title: "會議錄音",
    now: () => "2026-06-01T10:00:00+08:00",
  });
  expect(out).toContain("TR-001");
  const shown = JSON.parse(runTranscriptShow(root, "TR-001", { json: true }));
  expect(shown).toMatchObject({
    id: "TR-001",
    title: "會議錄音",
    source_file: audio,
    language: "zh-TW",
    provider: "fake",
  });
  expect(shown.body).toContain("轉錄 zh-TW");
  expect(shown.body).toContain(audio);
});

test("transcript import 可用指定 provider 與 language", async () => {
  const root = setup();
  const audio = join(root, "memo.wav");
  writeFileSync(audio, "fake audio", "utf8");
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      transcript: {
        defaultProvider: "unused",
        defaultLanguage: "zh-TW",
        providers: {
          alt: { command: "printf 'lang=%s file=%s' {language} {input}" },
        },
      },
    }),
    "utf8",
  );

  await runTranscriptImport(root, audio, {
    provider: "alt",
    language: "en",
    now: () => "2026-06-01T10:00:00+08:00",
  });
  const shown = JSON.parse(runTranscriptShow(root, "TR-001", { json: true }));
  expect(shown.provider).toBe("alt");
  expect(shown.language).toBe("en");
  expect(shown.body).toContain("lang=en");
});

test("transcript import unknown provider fails clearly", async () => {
  const root = setup();
  const audio = join(root, "meeting.m4a");
  writeFileSync(audio, "fake audio", "utf8");
  await expect(runTranscriptImport(root, audio, { provider: "missing" })).rejects.toThrow(/未知 transcript provider/);
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});

test("transcript import provider failure does not create transcript", async () => {
  const root = setup();
  const audio = join(root, "meeting.m4a");
  writeFileSync(audio, "fake audio", "utf8");
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      transcript: {
        defaultProvider: "failer",
        providers: {
          failer: { command: "printf 'bad provider' >&2; exit 7" },
        },
      },
    }),
    "utf8",
  );
  await expect(runTranscriptImport(root, audio, {})).rejects.toThrow(/bad provider/);
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});

test("transcript import empty stdout fails clearly", async () => {
  const root = setup();
  const audio = join(root, "meeting.m4a");
  writeFileSync(audio, "fake audio", "utf8");
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({
      transcript: {
        defaultProvider: "empty",
        providers: {
          empty: { command: "printf ''" },
        },
      },
    }),
    "utf8",
  );
  await expect(runTranscriptImport(root, audio, {})).rejects.toThrow(/stdout 為空/);
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});
