import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { writeTask } from "../../src/storage/tasks";
import { startBoardServer } from "../../src/board/server";
import type { Task } from "../../src/model/types";

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

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "board-srv-"));
  runInit(root);
  writeTask(root, task("T-001", { status: "todo" }));
  writeTask(root, task("T-002", { status: "in_progress" }));
  return root;
}

test("GET / returns board HTML with all tasks", async () => {
  const root = setup();
  const srv = await startBoardServer(root, { port: 0 });
  try {
    const res = await fetch(srv.url);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("T-001");
    expect(html).toContain("T-002");
    expect(html).toContain("任務看板");
  } finally {
    srv.stop();
  }
});

test("board reflects newly added task on refresh", async () => {
  const root = setup();
  const srv = await startBoardServer(root, { port: 0 });
  try {
    writeTask(root, task("T-003", { status: "done" }));
    const html = await (await fetch(srv.url)).text();
    expect(html).toContain("T-003");
  } finally {
    srv.stop();
  }
});

test("unknown board server route returns 404", async () => {
  const root = setup();
  const srv = await startBoardServer(root, { port: 0 });
  try {
    const res = await fetch(srv.url + "save");
    expect(res.status).toBe(404);
  } finally {
    srv.stop();
  }
});
