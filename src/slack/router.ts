export type ParsedCommand =
  | { action: "list"; status?: string }
  | { action: "next" }
  | { action: "show"; id: string }
  | { action: "add"; title: string; type?: string; priority?: string }
  | { action: "wip"; id: string }
  | { action: "done"; id: string }
  | { action: "help" }
  | { action: "error"; message: string };

/** 純文字 help（不含 markdown backtick，方便整段包進 code block）。 */
export const SLACK_HELP = [
  "可用指令：",
  "  /task list [status]                  列出 task",
  "  /task next                           下一個可執行 task",
  "  /task show T-001                     顯示 task",
  "  /task add 標題 [#type] [!priority]   建立 task",
  "  /task wip T-001                      標記進行中",
  "  /task done T-001                     標記完成",
].join("\n");

const ID_RE = /^T-\d+$/;

/** 解析 slash command 的 text 部分（不含前綴 "/task"）。 */
export function parseCommand(text: string): ParsedCommand {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const sub = tokens[0];
  const rest = tokens.slice(1);
  if (!sub || sub === "help") return { action: "help" };

  switch (sub) {
    case "list":
      return { action: "list", status: rest[0] };
    case "next":
      return { action: "next" };
    case "show":
    case "wip":
    case "done": {
      const id = rest[0];
      if (!id || !ID_RE.test(id)) {
        return { action: "error", message: `${sub} 需要合法 task ID（如 T-001）` };
      }
      return { action: sub as "show" | "wip" | "done", id };
    }
    case "add": {
      let type: string | undefined;
      let priority: string | undefined;
      const titleParts: string[] = [];
      for (const tok of rest) {
        if (tok.startsWith("#")) type = tok.slice(1);
        else if (tok.startsWith("!")) priority = tok.slice(1);
        else titleParts.push(tok);
      }
      const title = titleParts.join(" ").trim();
      if (!title) return { action: "error", message: "add 需要非空白標題" };
      return { action: "add", title, type, priority };
    }
    default:
      return { action: "error", message: `未知子指令：${sub}` };
  }
}
