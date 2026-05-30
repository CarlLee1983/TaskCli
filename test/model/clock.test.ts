import { expect, test } from "bun:test";
import { nowIso } from "../../src/model/clock";

test("nowIso 格式為 ISO 8601 含時區 offset", () => {
  const s = nowIso();
  expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test("nowIso 代表的時間點等於輸入 Date", () => {
  const d = new Date("2026-05-30T02:00:00.000Z");
  const s = nowIso(d);
  expect(new Date(s).toISOString()).toBe("2026-05-30T02:00:00.000Z");
});
