import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { writeTask, readTask, taskPath } from "../../src/storage/tasks";
import { appendHistoryEvent, listHistoryEvents, historyPath } from "../../src/storage/history";
import { runMerge } from "../../src/commands/merge";
import type { Task } from "../../src/model/types";

const NOW = () => "2026-06-25T12:00:00+08:00";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "taskcli-merge-"));
  runInit(root);
  return root;
}

function mkTask(over: Partial<Task> & { id: string; title: string }): Task {
  return {
    type: "feature",
    status: "todo",
    priority: "med",
    tags: [],
    created: "2026-01-01T00:00:00+08:00",
    updated: "2026-01-01T00:00:00+08:00",
    body: "",
    ...over,
  };
}

test("基本併入：刪除 source、保留 target、寫入 history note、更新 target 時間", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  expect(existsSync(taskPath(root, "T-002"))).toBe(false);
  expect(existsSync(taskPath(root, "T-001"))).toBe(true);
  expect(readTask(root, "T-001").updated).toBe("2026-06-25T12:00:00+08:00");
  const events = listHistoryEvents(root, "T-001");
  expect(events.some((e) => e.title === "merged from T-002")).toBe(true);
});

test("入向相依重接到 target 並更新該 task 時間", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  writeTask(root, mkTask({ id: "T-003", title: "dependent", depends_on: ["T-002"] }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  const t3 = readTask(root, "T-003");
  expect(t3.depends_on).toEqual(["T-001"]);
  expect(t3.updated).toBe("2026-06-25T12:00:00+08:00");
});

test("source 的 depends_on 與 tags 聯集併入 target 並去重", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper", tags: ["a"], depends_on: ["T-004"] }));
  writeTask(root, mkTask({ id: "T-002", title: "dup", tags: ["a", "b"], depends_on: ["T-004", "T-005"] }));
  writeTask(root, mkTask({ id: "T-004", title: "x" }));
  writeTask(root, mkTask({ id: "T-005", title: "y" }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  const t = readTask(root, "T-001");
  expect(t.tags).toEqual(["a", "b"]);
  expect(t.depends_on).toEqual(["T-004", "T-005"]);
});

test("重接後移除 target 的自我相依", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper", depends_on: ["T-002"] }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  expect(readTask(root, "T-001").depends_on).toBeUndefined();
});

test("入向相依同時含 source 與 target 時去重", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  writeTask(root, mkTask({ id: "T-003", title: "dependent", depends_on: ["T-001", "T-002"] }));
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  expect(readTask(root, "T-003").depends_on).toEqual(["T-001"]);
});

test("會造成循環時拒絕且不寫入", () => {
  const root = setup();
  // 合併後 T-003 依賴 T-001、T-001 依賴 T-003 → 形成環
  writeTask(root, mkTask({ id: "T-001", title: "keeper", depends_on: ["T-003"] }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  writeTask(root, mkTask({ id: "T-003", title: "mid", depends_on: ["T-002"] }));
  expect(() => runMerge(root, { source: "T-002", target: "T-001", now: NOW })).toThrow(/循環/);
  expect(existsSync(taskPath(root, "T-002"))).toBe(true);
  expect(readTask(root, "T-003").depends_on).toEqual(["T-002"]);
});

test("source 不存在報錯", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  expect(() => runMerge(root, { source: "T-999", target: "T-001", now: NOW })).toThrow(/找不到 task/);
});

test("target 不存在報錯", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "dup" }));
  expect(() => runMerge(root, { source: "T-001", target: "T-999", now: NOW })).toThrow(/找不到 task/);
});

test("source 等於 target 報錯", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "x" }));
  expect(() => runMerge(root, { source: "T-001", target: "T-001", now: NOW })).toThrow(/不可相同/);
});

test("source 的 history sidecar 一併刪除", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  appendHistoryEvent(root, {
    id: "E-001", task_id: "T-002", type: "note",
    created: "2026-01-01T00:00:00+08:00", body: "hi",
  });
  expect(existsSync(historyPath(root, "T-002"))).toBe(true);
  runMerge(root, { source: "T-002", target: "T-001", now: NOW });
  expect(existsSync(historyPath(root, "T-002"))).toBe(false);
});

test("--json 輸出 target/deleted/repointed", () => {
  const root = setup();
  writeTask(root, mkTask({ id: "T-001", title: "keeper" }));
  writeTask(root, mkTask({ id: "T-002", title: "dup" }));
  writeTask(root, mkTask({ id: "T-003", title: "dep", depends_on: ["T-002"] }));
  const out = runMerge(root, { source: "T-002", target: "T-001", json: true, now: NOW });
  expect(JSON.parse(out)).toEqual({ target: "T-001", deleted: "T-002", repointed: ["T-003"] });
});
