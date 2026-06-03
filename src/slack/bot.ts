import { App } from "@slack/bolt";
import { parseCommand } from "./router";
import { runAction } from "./actions";
import { isAllowed } from "./auth";
import { formatResult } from "./format";

export interface BotOptions {
  botToken: string;
  appToken: string;
  root: string;
  allowedUserIds: string[];
}

/** 啟動 Socket Mode bot，註冊 /task handler。此函式不會 return（app.start 後常駐）。 */
export async function startBot(opts: BotOptions): Promise<void> {
  const app = new App({
    token: opts.botToken,
    appToken: opts.appToken,
    socketMode: true,
  });

  app.command("/task", async ({ command, ack, respond }) => {
    await ack();
    if (!isAllowed(command.user_id, opts.allowedUserIds)) {
      await respond({ response_type: "ephemeral", text: "無權限：你的 Slack user ID 不在允許清單內。" });
      return;
    }
    try {
      const result = runAction(opts.root, parseCommand(command.text ?? ""));
      await respond({ response_type: "ephemeral", text: formatResult(result) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 完整錯誤只記在本機 log，回 Slack 的是 taskcli 既有的 user-safe 訊息
      console.error("[taskcli slack] action 失敗：", e);
      await respond({ response_type: "ephemeral", text: `執行失敗：${msg}` });
    }
  });

  await app.start();
  console.log("⚡ taskcli Slack bot 已啟動（Socket Mode）。按 Ctrl+C 結束。");
}
