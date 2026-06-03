import type { ParsedCommand } from "./router";
import { SLACK_HELP } from "./router";
import { runList, runNext, runShow, runAdd, runUpdate, runDone } from "../commands/tasks";
import { TASK_STATUSES, type TaskStatus } from "../model/types";

export interface ActionDeps {
  now?: () => string;
}

/**
 * 把解析後的指令分派到既有 command 函式，回傳人讀字串。
 * 底層函式可能 throw（如 ID 不存在、enum 非法）；由呼叫端（bot.ts）catch 後回友善訊息。
 */
export function runAction(root: string, cmd: ParsedCommand, deps: ActionDeps = {}): string {
  switch (cmd.action) {
    case "help":
      return SLACK_HELP;
    case "error":
      return cmd.message;
    case "list": {
      // list 的 status 需先驗證：非法值若直接傳給 runList 會「無相符」而靜默回空清單，
      // 對使用者誤導。add 的 type/priority 則由 runAdd 的 parseEnum throw 出明確訊息，無此問題。
      if (cmd.status !== undefined && !(TASK_STATUSES as readonly string[]).includes(cmd.status)) {
        return `不合法的狀態篩選：${cmd.status}（允許值：${TASK_STATUSES.join(" | ")}）`;
      }
      return runList(root, { status: cmd.status as TaskStatus | undefined });
    }
    case "next":
      return runNext(root, {});
    case "show":
      return runShow(root, cmd.id, {});
    case "add":
      return runAdd(root, cmd.title, { type: cmd.type, priority: cmd.priority, now: deps.now });
    case "wip":
      return runUpdate(root, cmd.id, { status: "in_progress", now: deps.now });
    case "done":
      return runDone(root, cmd.id, { now: deps.now });
  }
}
