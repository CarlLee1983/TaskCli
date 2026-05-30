import { expect, test } from "bun:test";
import { serializeTask, parseTask } from "../../src/model/frontmatter";
import type { Task } from "../../src/model/types";

const sample: Task = {
  id: "T-001",
  title: "實作登入 API：含冒號",
  type: "feature",
  status: "todo",
  priority: "med",
  tags: ["auth", "api"],
  created: "2026-05-30T10:00:00+08:00",
  updated: "2026-05-30T10:00:00+08:00",
  body: "描述內文\n第二行",
};

test("serializeTask 產生 frontmatter + 內文", () => {
  const md = serializeTask(sample);
  expect(md.startsWith("---\n")).toBe(true);
  expect(md).toContain('id: "T-001"');
  expect(md).toContain('tags: ["auth","api"]');
  expect(md).toContain("描述內文\n第二行");
});

test("round-trip：parse(serialize(x)) === x", () => {
  const parsed = parseTask(serializeTask(sample));
  expect(parsed).toEqual(sample);
});

test("parseTask 對缺少 frontmatter 丟錯", () => {
  expect(() => parseTask("沒有 frontmatter")).toThrow(/frontmatter/);
});

test("parseTask 驗證 enum 欄位", () => {
  const bad = serializeTask(sample).replace('type: "feature"', 'type: "bogus"');
  expect(() => parseTask(bad)).toThrow(/type/);
});

const full: Task = {
  ...sample,
  due: "2026-06-15",
  assignee: "carl",
  estimate: "3d",
  depends_on: ["T-002", "T-003"],
};

test("round-trip 含選填欄位 due/assignee/estimate/depends_on", () => {
  expect(parseTask(serializeTask(full))).toEqual(full);
});

test("向後相容：無選填欄位的 task 不輸出該行，parse 後欄位為 undefined", () => {
  const md = serializeTask(sample);
  expect(md).not.toContain("due:");
  expect(md).not.toContain("assignee:");
  expect(md).not.toContain("estimate:");
  expect(md).not.toContain("depends_on:");
  const parsed = parseTask(md);
  expect(parsed.due).toBeUndefined();
  expect(parsed.assignee).toBeUndefined();
  expect(parsed.estimate).toBeUndefined();
  expect(parsed.depends_on).toBeUndefined();
});

test("parseTask 驗證 due 格式", () => {
  const bad = serializeTask(full).replace('due: "2026-06-15"', 'due: "2026/06/15"');
  expect(() => parseTask(bad)).toThrow(/due/);
});

test("serializeTask 含 source 時輸出 source 行，往返解析一致", () => {
  const t: Task = {
    id: "T-001", title: "x", type: "feature", status: "todo", priority: "med",
    tags: [], created: "2026-05-30T00:00:00+08:00", updated: "2026-05-30T00:00:00+08:00",
    body: "內文\n", source: "github:owner/repo#42",
  };
  const raw = serializeTask(t);
  expect(raw).toContain(`source: "github:owner/repo#42"`);
  const back = parseTask(raw);
  expect(back.source).toBe("github:owner/repo#42");
});

test("serializeTask 無 source 時不輸出 source 行，解析後為 undefined", () => {
  const t: Task = {
    id: "T-002", title: "y", type: "fix", status: "done", priority: "low",
    tags: [], created: "2026-05-30T00:00:00+08:00", updated: "2026-05-30T00:00:00+08:00",
    body: "",
  };
  const raw = serializeTask(t);
  expect(raw).not.toContain("source:");
  expect(parseTask(raw).source).toBeUndefined();
});
