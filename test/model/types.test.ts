import { expect, test } from "bun:test";
import {
  TASK_TYPES, TASK_STATUSES, PRIORITIES,
  parseEnum, parseTags, isTaskType,
} from "../../src/model/types";

test("enum 常數內容正確", () => {
  expect(TASK_TYPES).toEqual(["feature", "fix", "refactor", "docs", "test", "chore"]);
  expect(TASK_STATUSES).toEqual(["todo", "in_progress", "done", "cancelled"]);
  expect(PRIORITIES).toEqual(["low", "med", "high"]);
});

test("parseEnum 接受合法值、拒絕非法值", () => {
  expect(parseEnum("type", "feature", TASK_TYPES)).toBe("feature");
  expect(() => parseEnum("type", "nope", TASK_TYPES)).toThrow(/type/);
});

test("isTaskType 型別守衛", () => {
  expect(isTaskType("fix")).toBe(true);
  expect(isTaskType("xxx")).toBe(false);
});

test("parseTags 正規化：去空白、濾空、去重", () => {
  expect(parseTags(["auth", " api ", "", "auth"])).toEqual(["auth", "api"]);
  expect(parseTags("auth, api ,auth")).toEqual(["auth", "api"]);
  expect(parseTags(undefined)).toEqual([]);
});
