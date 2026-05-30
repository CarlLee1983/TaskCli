import { expect, test } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { writeTask, readTask } from "../../src/storage/tasks";
import {
  runList, runShow, runUpdate, runDone, runRm,
} from "../../src/commands/tasks";
import type { Task } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "tcmd-"));
  runInit(root);
  return root;
}
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id, title: `標題 ${id}`, type: "feature", status: "todo",
    priority: "med", tags: [], created: "2026-05-30T10:00:00+08:00",
    updated: "2026-05-30T10:00:00+08:00", body: "", ...over,
  };
}

test("list 篩選與 --json", () => {
  const root = setup();
  writeTask(root, task("T-001", { type: "fix" }));
  writeTask(root, task("T-002", { type: "feature" }));
  expect(runList(root, { type: "fix" })).toContain("T-001");
  expect(runList(root, { type: "fix" })).not.toContain("T-002");
  const parsed = JSON.parse(runList(root, { json: true }));
  expect(parsed.length).toBe(2);
});

test("show 顯示單一 task", () => {
  const root = setup();
  writeTask(root, task("T-001", { title: "顯示我" }));
  expect(runShow(root, "T-001", {})).toContain("顯示我");
});

test("update 改 status/priority/title 並更新 updated", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  const fixedNow = () => "2026-05-31T09:00:00+08:00";
  runUpdate(root, "T-001", { status: "in_progress", priority: "high", title: "新標題", now: fixedNow });
  const t = readTask(root, "T-001");
  expect(t.status).toBe("in_progress");
  expect(t.priority).toBe("high");
  expect(t.title).toBe("新標題");
  expect(t.updated).toBe("2026-05-31T09:00:00+08:00");
  expect(t.created).toBe("2026-05-30T10:00:00+08:00");
});

test("update 對非法 status 丟錯", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  expect(() => runUpdate(root, "T-001", { status: "bogus" })).toThrow(/status/);
});

test("update --add-tag / --rm-tag", () => {
  const root = setup();
  writeTask(root, task("T-001", { tags: ["a"] }));
  runUpdate(root, "T-001", { addTag: "b" });
  expect(readTask(root, "T-001").tags).toEqual(["a", "b"]);
  runUpdate(root, "T-001", { rmTag: "a" });
  expect(readTask(root, "T-001").tags).toEqual(["b"]);
});

test("done 把 status 設為 done", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  runDone(root, "T-001", {});
  expect(readTask(root, "T-001").status).toBe("done");
});

test("rm 刪除 task 檔案", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  runRm(root, "T-001");
  expect(existsSync(join(root, ".taskcli/tasks/T-001.md"))).toBe(false);
});
