import { readFileSync } from "node:fs";
import { nowIso } from "../model/clock";
import {
  parseManualHistoryEventType,
  type ManualTaskHistoryEventType,
  type TaskHistoryEvent,
} from "../model/types";
import { readTask } from "../storage/tasks";
import { appendHistoryEvent, listHistoryEvents, nextHistoryEventId } from "../storage/history";

export interface HistoryAddOpts {
  type?: string;
  title?: string;
  body?: string;
  bodyFile?: string;
  author?: string;
  now?: () => string;
}

export interface HistoryListOpts {
  json?: boolean;
}

function cleanOptional(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  return trimmed ? trimmed : undefined;
}

function summarize(event: TaskHistoryEvent): string {
  const primary = event.title || event.body.replace(/\s+/g, " ").trim();
  const summary = primary.length > 80 ? `${primary.slice(0, 77)}...` : primary;
  const author = event.author ? ` @${event.author}` : "";
  return `${event.created}  [${event.type}]${author}  ${summary}`.trimEnd();
}

export function runHistoryAdd(root: string, taskId: string, opts: HistoryAddOpts): string {
  readTask(root, taskId);
  if (!opts.type) throw new Error("history add 需要 --type");
  const type: ManualTaskHistoryEventType = parseManualHistoryEventType(opts.type);
  if (opts.body !== undefined && opts.bodyFile !== undefined) {
    throw new Error("--body 與 --body-file 不可同時使用");
  }
  const title = cleanOptional(opts.title);
  const body = opts.bodyFile !== undefined ? readFileSync(opts.bodyFile, "utf8") : opts.body ?? "";
  if (!title && body.trim() === "") throw new Error("history add 至少需要 --title 或 --body");
  const existing = listHistoryEvents(root, taskId);
  const event: TaskHistoryEvent = {
    id: nextHistoryEventId(existing),
    task_id: taskId,
    type,
    created: (opts.now ?? nowIso)(),
    author: cleanOptional(opts.author),
    title,
    body,
  };
  appendHistoryEvent(root, event, taskId);
  return `已新增 ${taskId} history ${event.id}`;
}

export function runHistoryList(root: string, taskId: string, opts: HistoryListOpts): string {
  readTask(root, taskId);
  const events = listHistoryEvents(root, taskId);
  if (opts.json) return JSON.stringify(events, null, 2);
  if (events.length === 0) return "（尚無 history）";
  return events.map(summarize).join("\n");
}
