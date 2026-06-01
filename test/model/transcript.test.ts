import { expect, test } from "bun:test";
import { parseTranscript, serializeTranscript } from "../../src/model/transcript";
import type { Transcript } from "../../src/model/transcript";

function transcript(over: Partial<Transcript> = {}): Transcript {
  return {
    id: "TR-001",
    title: "產品週會錄音",
    source_file: "/tmp/meeting.m4a",
    language: "zh-TW",
    provider: "local-whisper",
    created: "2026-06-01T10:00:00+08:00",
    updated: "2026-06-01T10:00:00+08:00",
    drafts: [],
    tasks: [],
    body: "今天討論三件事。",
    ...over,
  };
}

test("serializeTranscript 輸出 frontmatter 與 body", () => {
  const raw = serializeTranscript(transcript());
  expect(raw).toContain('id: "TR-001"');
  expect(raw).toContain('title: "產品週會錄音"');
  expect(raw).toContain('source_file: "/tmp/meeting.m4a"');
  expect(raw).toContain('language: "zh-TW"');
  expect(raw).toContain('provider: "local-whisper"');
  expect(raw).toContain("drafts: []");
  expect(raw).toContain("tasks: []");
  expect(raw.endsWith("今天討論三件事。")).toBe(true);
});

test("parseTranscript 還原 transcript", () => {
  const parsed = parseTranscript(serializeTranscript(transcript({ drafts: ["D-001"], tasks: ["T-001"] })));
  expect(parsed).toEqual(transcript({ drafts: ["D-001"], tasks: ["T-001"] }));
});

test("parseTranscript 允許沒有 provider", () => {
  const input = transcript({ provider: undefined });
  const parsed = parseTranscript(serializeTranscript(input));
  expect(parsed.provider).toBeUndefined();
  expect(parsed.id).toBe("TR-001");
});

test("parseTranscript 驗證 TR id", () => {
  const raw = serializeTranscript(transcript()).replace('id: "TR-001"', 'id: "T-001"');
  expect(() => parseTranscript(raw)).toThrow(/id/);
});

test("parseTranscript 驗證 drafts 與 tasks id", () => {
  const badDraft = serializeTranscript(transcript({ drafts: ["bad"] }));
  expect(() => parseTranscript(badDraft)).toThrow(/drafts/);

  const badTask = serializeTranscript(transcript({ tasks: ["bad"] }));
  expect(() => parseTranscript(badTask)).toThrow(/tasks/);
});
