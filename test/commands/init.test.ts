import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";

test("init 建立 .taskcli 骨架與 config", () => {
  const root = mkdtempSync(join(tmpdir(), "init-"));
  const msg = runInit(root);
  expect(existsSync(join(root, ".taskcli/tasks"))).toBe(true);
  expect(existsSync(join(root, ".taskcli/drafts"))).toBe(true);
  const cfg = JSON.parse(readFileSync(join(root, ".taskcli/config.json"), "utf8"));
  expect(cfg.taskTypes).toContain("feature");
  expect(msg).toContain(".taskcli");
});

test("init 在已存在時不覆寫 config", () => {
  const root = mkdtempSync(join(tmpdir(), "init2-"));
  runInit(root);
  const before = readFileSync(join(root, ".taskcli/config.json"), "utf8");
  const msg = runInit(root);
  expect(readFileSync(join(root, ".taskcli/config.json"), "utf8")).toBe(before);
  expect(msg).toContain("已存在");
});
