import { readFileSync } from "node:fs";
import {
  defaultConfigPath, parseSlackConfig, loadSlackTokens, resolveRepoRoot,
} from "../slack/config";
import { startBot } from "../slack/bot";

export interface RunSlackOpts {
  configPath?: string;
}

/**
 * 串接：讀設定檔 → 驗證 → 讀 token → 解析 repo root → 啟動 bot。
 * 任一前置驗證失敗都會在連線前 throw，並帶可行動的訊息。
 */
export async function runSlack(
  opts: RunSlackOpts,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const filePath = opts.configPath ?? defaultConfigPath();
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`找不到 slack 設定檔：${filePath}（建立後再啟動）`);
    }
    throw err;
  }
  const cfg = parseSlackConfig(raw);
  const tokens = loadSlackTokens(env);
  const root = resolveRepoRoot(cfg);
  await startBot({ ...tokens, root, allowedUserIds: cfg.allowedUserIds });
}
