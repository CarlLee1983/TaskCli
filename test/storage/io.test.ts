import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite, ensureDir } from "../../src/storage/io";

test("ensureDir 建立巢狀目錄", () => {
  const root = mkdtempSync(join(tmpdir(), "io-"));
  const target = join(root, "a", "b", "c");
  ensureDir(target);
  expect(existsSync(target)).toBe(true);
});

test("atomicWrite 寫入內容且不留暫存檔", () => {
  const root = mkdtempSync(join(tmpdir(), "io-"));
  const file = join(root, "out.txt");
  atomicWrite(file, "hello");
  expect(readFileSync(file, "utf8")).toBe("hello");
  expect(existsSync(`${file}.tmp`)).toBe(false);
});
