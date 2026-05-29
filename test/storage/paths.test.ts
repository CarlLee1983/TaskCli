import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findRoot, requireRoot, taskcliDir, tasksDir, draftsDir, configPath,
} from "../../src/storage/paths";

test("findRoot 由子目錄往上找到含 .taskcli 的 root", () => {
  const root = mkdtempSync(join(tmpdir(), "tc-"));
  mkdirSync(join(root, ".taskcli"));
  const sub = join(root, "a", "b");
  mkdirSync(sub, { recursive: true });
  expect(findRoot(sub)).toBe(root);
});

test("findRoot 找不到回傳 null", () => {
  const dir = mkdtempSync(join(tmpdir(), "tc-none-"));
  expect(findRoot(dir)).toBeNull();
});

test("requireRoot 找不到時丟出含 init 提示的錯誤", () => {
  const dir = mkdtempSync(join(tmpdir(), "tc-req-"));
  expect(() => requireRoot(dir)).toThrow(/init/);
});

test("路徑組合函式正確", () => {
  const root = "/x";
  expect(taskcliDir(root)).toBe("/x/.taskcli");
  expect(tasksDir(root)).toBe("/x/.taskcli/tasks");
  expect(draftsDir(root)).toBe("/x/.taskcli/drafts");
  expect(configPath(root)).toBe("/x/.taskcli/config.json");
});
