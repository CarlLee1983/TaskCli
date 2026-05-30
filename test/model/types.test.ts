import { expect, test } from "bun:test";
import {
  TASK_TYPES, TASK_STATUSES, PRIORITIES,
  parseEnum, parseTags, isTaskType,
  parseDue, parseDependsOn,
} from "../../src/model/types";

test("parseDue 接受 YYYY-MM-DD、拒絕其他格式與空值", () => {
  expect(parseDue("2026-06-15")).toBe("2026-06-15");
  expect(parseDue(undefined)).toBeUndefined();
  expect(parseDue("")).toBeUndefined();
  expect(() => parseDue("2026/06/15")).toThrow(/due/);
  expect(() => parseDue("2026-6-5")).toThrow(/due/);
  expect(() => parseDue("下週五")).toThrow(/due/);
});

test("parseDependsOn 驗證 T-NNN 格式、正規化去重", () => {
  expect(parseDependsOn(["T-001", "T-002", "T-001"])).toEqual(["T-001", "T-002"]);
  expect(parseDependsOn("T-001, T-002")).toEqual(["T-001", "T-002"]);
  expect(parseDependsOn(undefined)).toEqual([]);
  expect(() => parseDependsOn(["T-1", "xyz"])).toThrow(/depends_on/);
});

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
