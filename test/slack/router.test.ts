import { expect, test } from "bun:test";
import { parseCommand } from "../../src/slack/router";

test("空字串與 help 都回 help", () => {
  expect(parseCommand("")).toEqual({ action: "help" });
  expect(parseCommand("help")).toEqual({ action: "help" });
});

test("list 帶可選 status", () => {
  expect(parseCommand("list")).toEqual({ action: "list", status: undefined });
  expect(parseCommand("list todo")).toEqual({ action: "list", status: "todo" });
});

test("next", () => {
  expect(parseCommand("next")).toEqual({ action: "next" });
});

test("show/wip/done 需要合法 ID", () => {
  expect(parseCommand("show T-001")).toEqual({ action: "show", id: "T-001" });
  expect(parseCommand("wip T-12")).toEqual({ action: "wip", id: "T-12" });
  expect(parseCommand("done T-3")).toEqual({ action: "done", id: "T-3" });
  expect(parseCommand("done")).toEqual({ action: "error", message: "done 需要合法 task ID（如 T-001）" });
  expect(parseCommand("show X1")).toEqual({ action: "error", message: "show 需要合法 task ID（如 T-001）" });
});

test("add 解析 #type 與 !priority，其餘併為標題", () => {
  expect(parseCommand("add 修 README #docs !high")).toEqual({
    action: "add", title: "修 README", type: "docs", priority: "high",
  });
  expect(parseCommand("add 只有標題")).toEqual({
    action: "add", title: "只有標題", type: undefined, priority: undefined,
  });
  expect(parseCommand("add #docs !high")).toEqual({ action: "error", message: "add 需要非空白標題" });
});

test("未知子指令回 error", () => {
  expect(parseCommand("foo bar")).toEqual({ action: "error", message: "未知子指令：foo" });
});

test("只有空白等同 help", () => {
  expect(parseCommand("   ")).toEqual({ action: "help" });
});

test("add 重複 #type / !priority 以最後者為準", () => {
  expect(parseCommand("add 標題 #docs #bug")).toEqual({
    action: "add", title: "標題", type: "bug", priority: undefined,
  });
});

test("show 後多餘 token 被忽略", () => {
  expect(parseCommand("show T-001 多餘")).toEqual({ action: "show", id: "T-001" });
});
