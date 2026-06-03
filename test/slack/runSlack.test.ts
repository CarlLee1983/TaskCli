import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSlack } from "../../src/commands/slack";

test("找不到設定檔時報友善錯誤（不連線）", async () => {
  await expect(runSlack({ configPath: "/nonexistent/slack.json" }, {}))
    .rejects.toThrow("找不到 slack 設定檔");
});

test("設定檔合法但缺 token 時報錯（不連線）", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slack-run-"));
  const cfgPath = join(dir, "slack.json");
  writeFileSync(cfgPath, JSON.stringify({ repoPath: dir, allowedUserIds: ["U1"] }));
  // env 不含 SLACK_*，應在連線前就因缺 token 而 throw
  await expect(runSlack({ configPath: cfgPath }, {})).rejects.toThrow("SLACK_BOT_TOKEN");
});

test("設定檔與 token 齊全但 repoPath 無 .taskcli 時報錯", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slack-noroot-"));
  const cfgPath = join(dir, "slack.json");
  writeFileSync(cfgPath, JSON.stringify({ repoPath: dir, allowedUserIds: ["U1"] }));
  await expect(
    runSlack({ configPath: cfgPath }, { SLACK_BOT_TOKEN: "b", SLACK_APP_TOKEN: "a" }),
  ).rejects.toThrow("有效的 .taskcli");
});
