import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyBinaryTo, runInstallBin } from "../../src/commands/installBin";

function fakeBin(): string {
  const dir = mkdtempSync(join(tmpdir(), "bin-src-"));
  const p = join(dir, "taskcli");
  writeFileSync(p, "#!/bin/sh\necho hi\n", "utf8");
  return p;
}

test("copyBinaryTo 複製到 dest 並設可執行位元，回傳目標路徑", () => {
  const src = fakeBin();
  const dest = mkdtempSync(join(tmpdir(), "bin-dst-"));
  const out = copyBinaryTo(src, dest);
  expect(out).toBe(join(dest, "taskcli"));
  expect(readFileSync(out, "utf8")).toBe("#!/bin/sh\necho hi\n");
  expect(statSync(out).mode & 0o100).toBe(0o100); // owner 可執行
});

test("copyBinaryTo 建立不存在的 dest 目錄", () => {
  const src = fakeBin();
  const base = mkdtempSync(join(tmpdir(), "bin-dst-"));
  const dest = join(base, "nested", "bin");
  const out = copyBinaryTo(src, dest);
  expect(existsSync(out)).toBe(true);
});

test("runInstallBin 在開發模式（execPath 指向 bun）丟出先 build 的提示", () => {
  const dest = mkdtempSync(join(tmpdir(), "bin-dst-"));
  expect(() => runInstallBin({ dest }, "/opt/homebrew/bin/bun")).toThrow(/build/);
});

test("runInstallBin 用編譯後 execPath 複製成功並回傳目標路徑訊息", () => {
  const src = fakeBin(); // 視為編譯後的 taskcli
  const dest = mkdtempSync(join(tmpdir(), "bin-dst-"));
  const msg = runInstallBin({ dest }, src);
  expect(msg).toContain(join(dest, "taskcli"));
  expect(existsSync(join(dest, "taskcli"))).toBe(true);
});
