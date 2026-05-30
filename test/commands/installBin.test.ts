import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyBinaryTo, runInstallBin, isCompiledBinary } from "../../src/commands/installBin";

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

// --- isCompiledBinary：以 entry（Bun.main）是否落在嵌入式 FS 判定，跨平台且不受 bun 改名影響 ---

test("isCompiledBinary：POSIX 編譯後 entry 在 /$bunfs/ 視為已編譯", () => {
  expect(isCompiledBinary("/$bunfs/root/taskcli")).toBe(true);
});

test("isCompiledBinary：Windows 編譯後 entry 在 B:\\~BUN\\ 視為已編譯", () => {
  expect(isCompiledBinary("B:\\~BUN\\root\\taskcli.exe")).toBe(true);
});

test("isCompiledBinary：dev 模式 entry 為真實腳本路徑視為未編譯", () => {
  expect(isCompiledBinary("/Users/u/project/src/cli.ts")).toBe(false);
  expect(isCompiledBinary("C:\\Users\\u\\project\\src\\cli.ts")).toBe(false);
});

test("runInstallBin 開發模式（entry 為真實腳本路徑）丟出先 build 提示，即使 bun 被改名", () => {
  const dest = mkdtempSync(join(tmpdir(), "bin-dst-"));
  // execPath 指向被改名的 bun，但判定依據是 entry 路徑而非 execPath basename
  expect(() =>
    runInstallBin({ dest }, "/usr/local/bin/bun-canary", "/home/u/project/src/cli.ts"),
  ).toThrow(/build/);
});

test("runInstallBin 用編譯後（entry 在 /$bunfs/）複製 execPath 成功並回傳目標路徑訊息", () => {
  const src = fakeBin(); // 視為編譯後的 taskcli（真實可複製的檔案）
  const dest = mkdtempSync(join(tmpdir(), "bin-dst-"));
  const msg = runInstallBin({ dest }, src, "/$bunfs/root/taskcli");
  expect(msg).toContain(join(dest, "taskcli"));
  expect(existsSync(join(dest, "taskcli"))).toBe(true);
});
