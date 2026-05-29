import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeTask, readTask, listTasks, filterTasks, deleteTask, listTaskIds,
} from "../../src/storage/tasks";
import type { Task } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "tks-"));
  mkdirSync(join(root, ".taskcli"));
  return root;
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id, title: `標題 ${id}`, type: "feature", status: "todo",
    priority: "med", tags: ["x"], created: "2026-05-30T10:00:00+08:00",
    updated: "2026-05-30T10:00:00+08:00", body: "內文", ...over,
  };
}

test("write 後 read 取回相同 task", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  expect(existsSync(join(root, ".taskcli/tasks/T-001.md"))).toBe(true);
  expect(readTask(root, "T-001")).toEqual(task("T-001"));
});

test("readTask 不存在丟錯", () => {
  const root = setup();
  expect(() => readTask(root, "T-404")).toThrow(/T-404/);
});

test("listTasks 依 id 排序回傳全部", () => {
  const root = setup();
  writeTask(root, task("T-002"));
  writeTask(root, task("T-001"));
  expect(listTasks(root).map((t) => t.id)).toEqual(["T-001", "T-002"]);
});

test("listTaskIds 在空 root 回傳空陣列", () => {
  const root = setup();
  expect(listTaskIds(root)).toEqual([]);
});

test("filterTasks 依條件篩選", () => {
  const ts = [
    task("T-001", { type: "fix", status: "todo", priority: "high", tags: ["a"] }),
    task("T-002", { type: "feature", status: "done", priority: "low", tags: ["b"] }),
  ];
  expect(filterTasks(ts, { type: "fix" }).map((t) => t.id)).toEqual(["T-001"]);
  expect(filterTasks(ts, { status: "done" }).map((t) => t.id)).toEqual(["T-002"]);
  expect(filterTasks(ts, { tag: "b" }).map((t) => t.id)).toEqual(["T-002"]);
  expect(filterTasks(ts, {}).length).toBe(2);
});

test("deleteTask 移除檔案", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  deleteTask(root, "T-001");
  expect(existsSync(join(root, ".taskcli/tasks/T-001.md"))).toBe(false);
});
