import { expect, test } from "bun:test";
import { hasCycle } from "../../src/model/deps";

test("hasCycle 偵測直接循環", () => {
  const g = new Map([["T-001", ["T-002"]], ["T-002", ["T-001"]]]);
  expect(hasCycle(g)).toBe(true);
});

test("hasCycle 偵測自我循環", () => {
  expect(hasCycle(new Map([["T-001", ["T-001"]]]))).toBe(true);
});

test("hasCycle 無循環回 false", () => {
  const g = new Map([["T-001", ["T-002"]], ["T-002", []]]);
  expect(hasCycle(g)).toBe(false);
});

test("hasCycle 忽略指向不存在節點的邊", () => {
  expect(hasCycle(new Map([["T-001", ["T-999"]]]))).toBe(false);
});
