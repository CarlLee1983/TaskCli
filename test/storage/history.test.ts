import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import {
  appendHistoryEvent,
  historyPath,
  listHistoryEvents,
  nextHistoryEventId,
} from "../../src/storage/history";
import { ensureDir } from "../../src/storage/io";
import { historyDir } from "../../src/storage/paths";
import { parseHistoryEvent, parseHistoryEventType } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "hist-store-"));
  runInit(root);
  return root;
}

test("historyPath stores per-task JSONL under .taskcli/history", () => {
  const root = setup();
  expect(historyPath(root, "T-001")).toBe(join(root, ".taskcli", "history", "T-001.jsonl"));
});

test("appendHistoryEvent creates JSONL and listHistoryEvents reads in order", () => {
  const root = setup();
  appendHistoryEvent(root, {
    id: "E-001",
    task_id: "T-001",
    type: "note",
    created: "2026-05-30T10:00:00+08:00",
    body: "first",
  });
  appendHistoryEvent(root, {
    id: "E-002",
    task_id: "T-001",
    type: "decision",
    created: "2026-05-30T10:05:00+08:00",
    title: "Use JSONL",
    body: "second",
    meta: { format: "jsonl" },
  });

  const events = listHistoryEvents(root, "T-001");
  expect(events.map((e) => e.id)).toEqual(["E-001", "E-002"]);
  expect(events[1]!.meta).toEqual({ format: "jsonl" });
  expect(readFileSync(historyPath(root, "T-001"), "utf8").trim().split("\n")).toHaveLength(2);
});

test("listHistoryEvents returns empty array when history file is absent", () => {
  const root = setup();
  expect(listHistoryEvents(root, "T-404")).toEqual([]);
});

test("nextHistoryEventId increments inside a single task history", () => {
  expect(nextHistoryEventId([])).toBe("E-001");
  expect(nextHistoryEventId([
    { id: "E-001", task_id: "T-001", type: "note", created: "x", body: "" },
    { id: "E-009", task_id: "T-001", type: "source", created: "x", body: "" },
  ])).toBe("E-010");
});

test("parseHistoryEventType accepts known types and rejects unknown ones", () => {
  expect(parseHistoryEventType("note")).toBe("note");
  expect(parseHistoryEventType("status_change")).toBe("status_change");
  expect(() => parseHistoryEventType("command")).toThrow(/history type/);
});

test("parseHistoryEvent validates shape and optional meta", () => {
  const parsed = parseHistoryEvent({
    id: "E-001",
    task_id: "T-001",
    type: "verification",
    created: "2026-05-30T10:00:00+08:00",
    author: "agent",
    title: "Tests",
    body: "bun test passed",
    meta: { command: "bun test" },
  });
  expect(parsed.type).toBe("verification");
  expect(parsed.meta?.command).toBe("bun test");
  expect(() => parseHistoryEvent({ ...parsed, meta: { bad: 1 } })).toThrow(/meta/);
});

test("listHistoryEvents reports bad JSONL line with file and line number", () => {
  const root = setup();
  ensureDir(historyDir(root));
  writeFileSync(historyPath(root, "T-001"), "{bad json}\n", "utf8");
  expect(() => listHistoryEvents(root, "T-001")).toThrow(/T-001\.jsonl:1/);
});

test("appendHistoryEvent rejects events for a different task path", () => {
  const root = setup();
  expect(() => appendHistoryEvent(root, {
    id: "E-001",
    task_id: "T-002",
    type: "note",
    created: "2026-05-30T10:00:00+08:00",
    body: "wrong file",
  }, "T-001")).toThrow(/task_id/);
  expect(existsSync(historyPath(root, "T-001"))).toBe(false);
});
