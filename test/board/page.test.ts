import { expect, test } from "bun:test";
import { renderBoardPage } from "../../src/board/page";
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

const tasks: Task[] = [
  task("T-001", { status: "todo", priority: "high", tags: ["agent"], assignee: "carl" }),
  task("T-002", { status: "in_progress", type: "fix" }),
  task("T-003", { status: "done", priority: "low" }),
  task("T-004", { status: "cancelled" }),
];

test("board page renders all status columns with counts", () => {
  const html = renderBoardPage(tasks, "JobTask");
  expect(html).toContain("JobTask · 任務看板");
  expect(html).toContain("待辦");
  expect(html).toContain("進行中");
  expect(html).toContain("已完成");
  expect(html).toContain("已取消");
  expect(html).toContain('data-status="todo"');
  expect(html).toContain("共 4 筆任務");
});

test("board page renders task cards with id, badges and tags", () => {
  const html = renderBoardPage(tasks, "JobTask");
  expect(html).toContain("T-001");
  expect(html).toContain("#agent");
  expect(html).toContain("carl");
  expect(html).toContain('data-type="fix"');
  expect(html).toContain('data-priority="high"');
});

test("board page escapes user-controlled task text", () => {
  const html = renderBoardPage([task("T-009", { title: "<script>alert(1)</script>" })], "Proj");
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("board page renders empty guidance when no tasks", () => {
  const html = renderBoardPage([], "Proj");
  expect(html).toContain("尚無任務");
  expect(html).toContain('taskcli add "我的第一個任務"');
});
