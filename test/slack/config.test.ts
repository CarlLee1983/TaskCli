import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import {
  defaultConfigPath, parseSlackConfig, loadSlackTokens, resolveRepoRoot,
} from "../../src/slack/config";

test("defaultConfigPath 指向 ~/.config/taskcli/slack.json", () => {
  expect(defaultConfigPath("/home/carl")).toBe("/home/carl/.config/taskcli/slack.json");
});

test("parseSlackConfig 接受合法設定", () => {
  const cfg = parseSlackConfig(JSON.stringify({ repoPath: "/x", allowedUserIds: ["U1"] }));
  expect(cfg).toEqual({ repoPath: "/x", allowedUserIds: ["U1"] });
});

test("parseSlackConfig 拒絕非法 JSON / 缺欄位 / 空 allowlist", () => {
  expect(() => parseSlackConfig("{")).toThrow("不是合法 JSON");
  expect(() => parseSlackConfig(JSON.stringify({ allowedUserIds: ["U1"] }))).toThrow("repoPath");
  expect(() => parseSlackConfig(JSON.stringify({ repoPath: "/x", allowedUserIds: [] }))).toThrow("allowedUserIds");
  expect(() => parseSlackConfig(JSON.stringify({ repoPath: "/x", allowedUserIds: [123] }))).toThrow("allowedUserIds");
});

test("loadSlackTokens 缺 env 時報錯，齊全時回 token", () => {
  expect(() => loadSlackTokens({})).toThrow("SLACK_BOT_TOKEN");
  expect(() => loadSlackTokens({ SLACK_BOT_TOKEN: "b" })).toThrow("SLACK_APP_TOKEN");
  expect(loadSlackTokens({ SLACK_BOT_TOKEN: "b", SLACK_APP_TOKEN: "a" }))
    .toEqual({ botToken: "b", appToken: "a" });
});

test("resolveRepoRoot 在含 .taskcli 的目錄回 root，否則報錯", () => {
  const root = mkdtempSync(join(tmpdir(), "slack-cfg-"));
  runInit(root);
  expect(resolveRepoRoot({ repoPath: root, allowedUserIds: ["U1"] })).toBe(root);
  const bare = mkdtempSync(join(tmpdir(), "slack-bare-"));
  expect(() => resolveRepoRoot({ repoPath: bare, allowedUserIds: ["U1"] })).toThrow("有效的 .taskcli");
});

test("loadSlackTokens 拒絕全空白 token", () => {
  expect(() => loadSlackTokens({ SLACK_BOT_TOKEN: "   ", SLACK_APP_TOKEN: "a" })).toThrow("SLACK_BOT_TOKEN");
});

test("parseSlackConfig 拒絕全空白 repoPath / allowlist 條目", () => {
  expect(() => parseSlackConfig(JSON.stringify({ repoPath: "   ", allowedUserIds: ["U1"] }))).toThrow("repoPath");
  expect(() => parseSlackConfig(JSON.stringify({ repoPath: "/x", allowedUserIds: ["  "] }))).toThrow("allowedUserIds");
});

test("parseSlackConfig 回傳已 trim 的 repoPath", () => {
  expect(parseSlackConfig(JSON.stringify({ repoPath: "  /x  ", allowedUserIds: ["U1"] })).repoPath).toBe("/x");
});

test("defaultConfigPath 無參數時結尾正確", () => {
  expect(defaultConfigPath()).toMatch(/\.config\/taskcli\/slack\.json$/);
});
