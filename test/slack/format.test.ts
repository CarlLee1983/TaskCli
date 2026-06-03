import { expect, test } from "bun:test";
import { formatResult } from "../../src/slack/format";

test("把結果包進三引號 code block", () => {
  expect(formatResult("T-001  [todo]  hello")).toBe("```\nT-001  [todo]  hello\n```");
});

test("多行結果保留換行", () => {
  expect(formatResult("a\nb")).toBe("```\na\nb\n```");
});
