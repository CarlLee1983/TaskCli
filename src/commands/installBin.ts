import { copyFileSync, chmodSync } from "node:fs";
import { basename, join } from "node:path";
import { ensureDir } from "../storage/io";
import { expandHome } from "./skill";

/** 複製 binary 到 destDir（保持來源檔名），設 0o755，回傳目標路徑。 */
export function copyBinaryTo(srcPath: string, destDir: string): string {
  ensureDir(destDir);
  const out = join(destDir, basename(srcPath));
  copyFileSync(srcPath, out);
  chmodSync(out, 0o755);
  return out;
}

export interface InstallBinOpts {
  dest?: string; // 預設 ~/.local/bin
}

function isCompiledBinary(execPath: string): boolean {
  // 開發模式以 `bun run` 執行時 execPath 為 bun 本身
  return basename(execPath) !== "bun";
}

export function runInstallBin(opts: InstallBinOpts, execPath: string): string {
  if (!isCompiledBinary(execPath)) {
    throw new Error(
      "偵測到以 bun 開發模式執行：請先 `bun run build`，再用編譯後的 dist/taskcli 執行 install-bin",
    );
  }
  const dest = expandHome(opts.dest ?? "~/.local/bin");
  const out = copyBinaryTo(execPath, dest);
  return `已安裝 binary 到 ${out}\n請確認 ${dest} 在你的 PATH（必要時加入 shell 設定）。`;
}
