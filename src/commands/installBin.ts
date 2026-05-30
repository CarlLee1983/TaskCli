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

// Bun 編譯成 standalone executable 後，entry（Bun.main）會落在嵌入式虛擬檔案系統：
//   POSIX  : /$bunfs/root/...
//   Windows: B:\~BUN\root\...
// 以此判定比對 execPath 的 basename（會被 bun 改名或 .exe 副檔名誤判）更穩健且跨平台。
const EMBEDDED_FS_MARKERS = ["/$bunfs/", "\\~BUN\\", "/~BUN/"] as const;

/** entry（Bun.main）是否落在 Bun 編譯後的嵌入式檔案系統，亦即以編譯後 binary 執行。 */
export function isCompiledBinary(entryPath: string): boolean {
  return EMBEDDED_FS_MARKERS.some((m) => entryPath.includes(m));
}

/**
 * 安裝 binary 到 destDir。
 * @param execPath  process.execPath——編譯後為真實 binary 路徑，用於複製。
 * @param entryPath Bun.main——用於判定是否以編譯後 binary 執行（dev 模式為真實腳本路徑）。
 */
export function runInstallBin(opts: InstallBinOpts, execPath: string, entryPath: string): string {
  if (!isCompiledBinary(entryPath)) {
    throw new Error(
      "偵測到以 bun 開發模式執行：請先 `bun run build`，再用編譯後的 dist/taskcli 執行 install-bin",
    );
  }
  const dest = expandHome(opts.dest ?? "~/.local/bin");
  const out = copyBinaryTo(execPath, dest);
  return `已安裝 binary 到 ${out}\n請確認 ${dest} 在你的 PATH（必要時加入 shell 設定）。`;
}
