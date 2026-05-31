import { expect, test } from "bun:test";
import { renderTaskHistoryPage } from "../../src/history/page";
import type { Task, TaskHistoryEvent } from "../../src/model/types";

const task: Task = {
  id: "T-001",
  title: "實作 <history>",
  type: "feature",
  status: "in_progress",
  priority: "high",
  tags: ["agent", "history"],
  created: "2026-05-30T10:00:00+08:00",
  updated: "2026-05-30T11:00:00+08:00",
  body: "Body <script>alert(1)</script>",
  source: "agent-plan",
};

const events: TaskHistoryEvent[] = [
  {
    id: "E-001",
    task_id: "T-001",
    type: "decision",
    created: "2026-05-30T10:30:00+08:00",
    author: "agent",
    title: "Use JSONL",
    body: "Decision <b>body</b>",
  },
  {
    id: "E-002",
    task_id: "T-001",
    type: "status_change",
    created: "2026-05-30T11:00:00+08:00",
    title: "todo -> in_progress",
    body: "",
    meta: { from: "todo", to: "in_progress" },
  },
];

test("history page renders task summary and timeline", () => {
  const html = renderTaskHistoryPage(task, events);
  expect(html).toContain("T-001");
  expect(html).toContain("feature / high");
  expect(html).toContain("#agent");
  expect(html).toContain("Use JSONL");
  expect(html).toContain("todo → in_progress");
});

test("history page escapes user-controlled task and event text", () => {
  const html = renderTaskHistoryPage(task, events);
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).not.toContain("Decision <b>body</b>");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).toContain("Decision &lt;b&gt;body&lt;/b&gt;");
});

test("history page renders empty history guidance", () => {
  const html = renderTaskHistoryPage(task, []);
  expect(html).toContain("尚無歷程");
  expect(html).toContain("taskcli history add T-001 --type note --body");
});
