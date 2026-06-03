import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { runAction } from "../../src/slack/actions";

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "slack-act-"));
  runInit(root);
  return root;
}

const NOW = () => "2026-06-03T00:00:00.000Z";

test("help / error 直接回字串", () => {
  const root = freshRoot();
  expect(runAction(root, { action: "help" })).toContain("可用指令");
  expect(runAction(root, { action: "error", message: "壞掉了" })).toBe("壞掉了");
});

test("add 建立 task，list/show 看得到，done 改狀態", () => {
  const root = freshRoot();
  const added = runAction(root, { action: "add", title: "登入 API", type: "feature", priority: "high" }, { now: NOW });
  expect(added).toContain("T-001");

  expect(runAction(root, { action: "list" })).toContain("T-001");
  expect(runAction(root, { action: "show", id: "T-001" })).toContain("登入 API");

  expect(runAction(root, { action: "wip", id: "T-001" }, { now: NOW })).toContain("T-001");
  expect(runAction(root, { action: "done", id: "T-001" }, { now: NOW })).toContain("T-001");
  expect(runAction(root, { action: "show", id: "T-001" })).toContain("done");
});

test("next 在無可執行 task 時回提示", () => {
  const root = freshRoot();
  expect(runAction(root, { action: "next" })).toContain("沒有可執行");
});

test("未知 ID 由底層函式 throw（交給呼叫端 catch）", () => {
  const root = freshRoot();
  expect(() => runAction(root, { action: "show", id: "T-999" })).toThrow();
});

test("list 帶不合法 status 回提示而非空清單", () => {
  const root = freshRoot();
  const out = runAction(root, { action: "list", status: "bogus" });
  expect(out).toContain("不合法的狀態篩選");
});
