import { expect, test } from "bun:test";
import { nextId } from "../../src/storage/ids";

test("空清單從 001 開始", () => {
  expect(nextId("T", [])).toBe("T-001");
  expect(nextId("D", [])).toBe("D-001");
});

test("取現有最大值 +1 並補零", () => {
  expect(nextId("T", ["T-001", "T-009"])).toBe("T-010");
  expect(nextId("T", ["T-010", "T-002"])).toBe("T-011");
});

test("忽略不符前綴或格式的項目", () => {
  expect(nextId("T", ["D-005", "garbage", "T-003"])).toBe("T-004");
});

test("超過三位數不截斷", () => {
  expect(nextId("T", ["T-999"])).toBe("T-1000");
});
