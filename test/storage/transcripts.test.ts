import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import {
  deleteTranscript,
  listTranscriptIds,
  listTranscripts,
  readTranscript,
  transcriptPath,
  writeTranscript,
} from "../../src/storage/transcripts";
import type { Transcript } from "../../src/model/transcript";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "tr-store-"));
  runInit(root);
  return root;
}

function transcript(id: string, over: Partial<Transcript> = {}): Transcript {
  return {
    id,
    title: `錄音 ${id}`,
    source_file: `/tmp/${id}.m4a`,
    language: "zh-TW",
    provider: "fake",
    created: "2026-06-01T10:00:00+08:00",
    updated: "2026-06-01T10:00:00+08:00",
    drafts: [],
    tasks: [],
    body: "文字稿",
    ...over,
  };
}

test("write/read transcript", () => {
  const root = setup();
  writeTranscript(root, transcript("TR-001", { title: "會議" }));
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(true);
  expect(readTranscript(root, "TR-001").title).toBe("會議");
});

test("listTranscriptIds 依 id 排序", () => {
  const root = setup();
  writeTranscript(root, transcript("TR-002"));
  writeTranscript(root, transcript("TR-001"));
  expect(listTranscriptIds(root)).toEqual(["TR-001", "TR-002"]);
  expect(listTranscripts(root).map((t) => t.id)).toEqual(["TR-001", "TR-002"]);
});

test("deleteTranscript 刪除 transcript 檔案", () => {
  const root = setup();
  writeTranscript(root, transcript("TR-001"));
  deleteTranscript(root, "TR-001");
  expect(existsSync(transcriptPath(root, "TR-001"))).toBe(false);
});

test("read/delete 找不到 transcript 時丟錯", () => {
  const root = setup();
  expect(() => readTranscript(root, "TR-999")).toThrow(/找不到 transcript/);
  expect(() => deleteTranscript(root, "TR-999")).toThrow(/找不到 transcript/);
});
