import { expect, test } from "bun:test";
import { hasCycle, findCycles } from "../../src/model/deps";

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

test("findCycles 無環回空陣列", () => {
  const g = new Map([["T-001", ["T-002"]], ["T-002", []]]);
  expect(findCycles(g)).toEqual([]);
});

test("findCycles 回傳以字典序最小節點為起點的正規化環", () => {
  // 從 T-002 進入仍應正規化為 [T-001, T-002]
  const g = new Map([["T-002", ["T-001"]], ["T-001", ["T-002"]]]);
  expect(findCycles(g)).toEqual([["T-001", "T-002"]]);
});

test("findCycles 自我循環回單節點環", () => {
  expect(findCycles(new Map([["T-001", ["T-001"]]]))).toEqual([["T-001"]]);
});

test("findCycles 同一環只回報一次", () => {
  // 三節點環，無論從哪個節點進入只算一個環
  const g = new Map([
    ["T-001", ["T-002"]],
    ["T-002", ["T-003"]],
    ["T-003", ["T-001"]],
  ]);
  expect(findCycles(g)).toEqual([["T-001", "T-002", "T-003"]]);
});

test("findCycles 偵測多個相異環", () => {
  const g = new Map([
    ["T-001", ["T-002"]],
    ["T-002", ["T-001"]],
    ["T-003", ["T-004"]],
    ["T-004", ["T-003"]],
  ]);
  expect(findCycles(g)).toEqual([
    ["T-001", "T-002"],
    ["T-003", "T-004"],
  ]);
});

test("findCycles 忽略指向不存在節點的邊", () => {
  expect(findCycles(new Map([["T-001", ["T-999"]]]))).toEqual([]);
});
