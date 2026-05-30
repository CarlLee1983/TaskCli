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
