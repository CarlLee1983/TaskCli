import { homedir } from "node:os";
import { join } from "node:path";
import { findRoot } from "../storage/paths";

export interface SlackBotConfig {
  repoPath: string;        // repo 根目錄（含 .taskcli/ 的目錄）
  allowedUserIds: string[];
}

export interface SlackTokens {
  botToken: string;
  appToken: string;
}

/** 預設設定檔路徑：~/.config/taskcli/slack.json。 */
export function defaultConfigPath(home: string = homedir()): string {
  return join(home, ".config", "taskcli", "slack.json");
}

/** 解析並驗證設定檔內容（不碰檔案系統）。 */
export function parseSlackConfig(raw: string): SlackBotConfig {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("slack 設定檔不是合法 JSON");
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("slack 設定檔需為物件");
  }
  const o = data as Record<string, unknown>;
  if (typeof o.repoPath !== "string" || o.repoPath.trim() === "") {
    throw new Error("slack 設定檔需要非空字串欄位 repoPath");
  }
  const repoPath = o.repoPath.trim();
  if (
    !Array.isArray(o.allowedUserIds) ||
    o.allowedUserIds.length === 0 ||
    !o.allowedUserIds.every((x) => typeof x === "string" && x.trim() !== "")
  ) {
    throw new Error("slack 設定檔需要非空字串陣列欄位 allowedUserIds");
  }
  return { repoPath, allowedUserIds: o.allowedUserIds as string[] };
}

/** 從環境變數讀 token，缺任一即 throw。 */
export function loadSlackTokens(env: Record<string, string | undefined>): SlackTokens {
  const botToken = env.SLACK_BOT_TOKEN;
  if (!botToken?.trim()) throw new Error("缺少環境變數 SLACK_BOT_TOKEN");
  const appToken = env.SLACK_APP_TOKEN;
  if (!appToken?.trim()) throw new Error("缺少環境變數 SLACK_APP_TOKEN");
  return { botToken, appToken };
}

/** 把設定的 repoPath 解析成 repo root（驗證 .taskcli 存在）。 */
export function resolveRepoRoot(cfg: SlackBotConfig): string {
  const root = findRoot(cfg.repoPath);
  if (!root) {
    throw new Error(`repoPath 不是有效的 .taskcli 工作區：${cfg.repoPath}`);
  }
  return root;
}
