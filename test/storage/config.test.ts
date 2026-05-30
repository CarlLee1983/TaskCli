import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/storage/config";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "cfg-"));
  mkdirSync(join(root, ".taskcli"), { recursive: true });
  return root;
}

test("無 config.json 時回傳 fallback 預設", () => {
  const root = setup();
  expect(loadConfig(root)).toEqual({ defaultType: "feature", defaultPriority: "med" });
});

test("讀取 config.json 的 defaultType / defaultPriority", () => {
  const root = setup();
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({ defaultType: "fix", defaultPriority: "high" }),
    "utf8",
  );
  expect(loadConfig(root)).toEqual({ defaultType: "fix", defaultPriority: "high" });
});

test("config.json 壞掉時回退 fallback（不丟錯）", () => {
  const root = setup();
  writeFileSync(join(root, ".taskcli/config.json"), "not-json", "utf8");
  expect(loadConfig(root)).toEqual({ defaultType: "feature", defaultPriority: "med" });
});

test("config.json 含非法 enum 值時丟錯", () => {
  const root = setup();
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({ defaultType: "bogus" }),
    "utf8",
  );
  expect(() => loadConfig(root)).toThrow(/defaultType/);
});
