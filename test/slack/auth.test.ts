import { expect, test } from "bun:test";
import { isAllowed } from "../../src/slack/auth";

test("在清單內回 true", () => {
  expect(isAllowed("U1", ["U1", "U2"])).toBe(true);
});

test("不在清單內回 false", () => {
  expect(isAllowed("U9", ["U1", "U2"])).toBe(false);
});

test("空清單一律 false", () => {
  expect(isAllowed("U1", [])).toBe(false);
});
