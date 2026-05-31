import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { writeTask } from "../../src/storage/tasks";
import { appendHistoryEvent } from "../../src/storage/history";
import { startHistoryServer } from "../../src/history/server";
import type { Task } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "hist-srv-"));
  runInit(root);
  writeTask(root, task("T-001"));
  appendHistoryEvent(root, {
    id: "E-001",
    task_id: "T-001",
    type: "note",
    created: "2026-05-30T10:00:00+08:00",
    body: "hello timeline",
  });
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

test("GET / returns task history HTML", async () => {
  const root = setup();
  const srv = startHistoryServer(root, "T-001", { port: 0 });
  try {
    const res = await fetch(srv.url);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("T-001");
    expect(html).toContain("hello timeline");
  } finally {
    srv.stop();
  }
});

test("unknown history server route returns 404", async () => {
  const root = setup();
  const srv = startHistoryServer(root, "T-001", { port: 0 });
  try {
    const res = await fetch(srv.url + "save");
    expect(res.status).toBe(404);
  } finally {
    srv.stop();
  }
});
