import { expect, test } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { writeTask, readTask } from "../../src/storage/tasks";
import {
  runList, runShow, runUpdate, runDone, runRm, runAdd,
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

test("update --due 設定截止日，空字串清除", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  runUpdate(root, "T-001", { due: "2026-06-15" });
  expect(readTask(root, "T-001").due).toBe("2026-06-15");
  runUpdate(root, "T-001", { due: "" });
  expect(readTask(root, "T-001").due).toBeUndefined();
});

test("update --due 驗證格式", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  expect(() => runUpdate(root, "T-001", { due: "2026/06/15" })).toThrow(/due/);
});

test("update --assignee / --estimate（空字串清除）", () => {
  const root = setup();
  writeTask(root, task("T-001"));
  runUpdate(root, "T-001", { assignee: "carl", estimate: "3d" });
  let t = readTask(root, "T-001");
  expect(t.assignee).toBe("carl");
  expect(t.estimate).toBe("3d");
  runUpdate(root, "T-001", { assignee: "" });
  expect(readTask(root, "T-001").assignee).toBeUndefined();
});

test("update --add-dep / --rm-dep（驗 ID、去重）", () => {
  const root = setup();
  writeTask(root, task("T-002"));
  runUpdate(root, "T-002", { addDep: "T-001" });
  runUpdate(root, "T-002", { addDep: "T-001" });
  expect(readTask(root, "T-002").depends_on).toEqual(["T-001"]);
  runUpdate(root, "T-002", { addDep: "T-003" });
  expect(readTask(root, "T-002").depends_on).toEqual(["T-001", "T-003"]);
  runUpdate(root, "T-002", { rmDep: "T-001" });
  expect(readTask(root, "T-002").depends_on).toEqual(["T-003"]);
  expect(() => runUpdate(root, "T-002", { addDep: "bad" })).toThrow(/depends_on/);
});


test("add 快速建立 task，使用 config 預設並回傳 id", () => {
  const root = setup();
  const msg = runAdd(root, "快速新增", {
    tags: "ux,cli",
    body: "說明",
    now: () => "2026-05-31T10:00:00+08:00",
  });
  expect(msg).toContain("T-001");
  const t = readTask(root, "T-001");
  expect(t.title).toBe("快速新增");
  expect(t.type).toBe("feature");
  expect(t.priority).toBe("med");
  expect(t.tags).toEqual(["ux", "cli"]);
  expect(t.body).toBe("說明");
  expect(t.status).toBe("todo");
});

test("add 支援選填欄位與 json 輸出", () => {
  const root = setup();
  const out = runAdd(root, "完整新增", {
    type: "fix",
    priority: "high",
    tags: "bug",
    due: "2026-06-15",
    assignee: "carl",
    estimate: "2h",
    addDep: "T-001",
    json: true,
    now: () => "2026-05-31T10:00:00+08:00",
  });
  const t = JSON.parse(out);
  expect(t.id).toBe("T-001");
  expect(t.type).toBe("fix");
  expect(t.priority).toBe("high");
  expect(t.due).toBe("2026-06-15");
  expect(t.assignee).toBe("carl");
  expect(t.estimate).toBe("2h");
  expect(t.depends_on).toEqual(["T-001"]);
});
