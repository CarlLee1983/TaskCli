import { expect, test } from "bun:test";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/cli.ts");

test("taskcli slack --config <不存在> 報友善錯誤並非零退出", async () => {
  const proc = Bun.spawn(["bun", "run", CLI, "slack", "--config", "/nonexistent/slack.json"], {
    stdout: "ignore", stderr: "pipe",
    env: { PATH: process.env.PATH ?? "" },  // 不帶 SLACK_* token
  });
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  expect(code).not.toBe(0);
  expect(stderr).toContain("找不到 slack 設定檔");
});

test("USAGE 顯示 slack 指令", async () => {
  const proc = Bun.spawn(["bun", "run", CLI, "--help"], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  expect(code).toBe(0);
  expect(stdout).toContain("slack");
});
