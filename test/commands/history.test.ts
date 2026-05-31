import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { runHistoryAdd, runHistoryList } from "../../src/commands/history";
import { writeTask } from "../../src/storage/tasks";
import { listHistoryEvents } from "../../src/storage/history";
import type { Task } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "hist-cmd-"));
  runInit(root);
  writeTask(root, task("T-001"));
  return root;
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: `標題 ${id}`,
    type: "feature",
    status: "todo",
    priority: "med",
    tags: [],
    created: "2026-05-30T10:00:00+08:00",
    updated: "2026-05-30T10:00:00+08:00",
    body: "",
    ...over,
  };
}

test("history add appends a manual event and returns event id", () => {
  const root = setup();
  const out = runHistoryAdd(root, "T-001", {
    type: "decision",
    title: "Use sidecar",
    body: "Keep task markdown unchanged",
    author: "agent",
    now: () => "2026-05-30T11:00:00+08:00",
  });
  expect(out).toBe("已新增 T-001 history E-001");
  const events = listHistoryEvents(root, "T-001");
  expect(events[0]).toMatchObject({
    id: "E-001",
    task_id: "T-001",
    type: "decision",
    title: "Use sidecar",
    author: "agent",
    body: "Keep task markdown unchanged",
    created: "2026-05-30T11:00:00+08:00",
  });
});

test("history add reads bodyFile", () => {
  const root = setup();
  const bodyFile = join(root, "decision.md");
  writeFileSync(bodyFile, "line 1\nline 2\n", "utf8");
  runHistoryAdd(root, "T-001", {
    type: "note",
    title: "From file",
    bodyFile,
    now: () => "2026-05-30T11:00:00+08:00",
  });
  expect(listHistoryEvents(root, "T-001")[0]!.body).toBe("line 1\nline 2\n");
});

test("history add validates task existence, manual type, body source, and content", () => {
  const root = setup();
  expect(() => runHistoryAdd(root, "T-999", { type: "note", body: "x" })).toThrow(/找不到 task/);
  expect(() => runHistoryAdd(root, "T-001", { body: "x" })).toThrow(/--type/);
  expect(() => runHistoryAdd(root, "T-001", { type: "status_change", body: "x" })).toThrow(/history type/);
  expect(() => runHistoryAdd(root, "T-001", { type: "note", body: "x", bodyFile: "x.md" })).toThrow(/--body/);
  expect(() => runHistoryAdd(root, "T-001", { type: "note" })).toThrow(/--title/);
});

test("history list renders text summaries and JSON", () => {
  const root = setup();
  runHistoryAdd(root, "T-001", {
    type: "source",
    title: "Agent plan",
    body: "A long body that should appear in text output",
    now: () => "2026-05-30T11:00:00+08:00",
  });
  const text = runHistoryList(root, "T-001", {});
  expect(text).toContain("2026-05-30T11:00:00+08:00");
  expect(text).toContain("[source]");
  expect(text).toContain("Agent plan");
  const json = JSON.parse(runHistoryList(root, "T-001", { json: true }));
  expect(json[0].type).toBe("source");
});

test("history list returns empty message for existing task with no events", () => {
  const root = setup();
  expect(runHistoryList(root, "T-001", {})).toBe("（尚無 history）");
  expect(runHistoryList(root, "T-001", { json: true })).toBe("[]");
});
