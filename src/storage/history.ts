import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { historyDir } from "./paths";
import { ensureDir } from "./io";
import { parseHistoryEvent, type TaskHistoryEvent } from "../model/types";

export function historyPath(root: string, taskId: string): string {
  return join(historyDir(root), `${taskId}.jsonl`);
}

export function listHistoryEvents(root: string, taskId: string): TaskHistoryEvent[] {
  const p = historyPath(root, taskId);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n");
  const events: TaskHistoryEvent[] = [];
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    try {
      events.push(parseHistoryEvent(JSON.parse(line)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${p}:${idx + 1}: ${msg}`);
    }
  });
  return events;
}

export function nextHistoryEventId(events: TaskHistoryEvent[]): string {
  let max = 0;
  for (const event of events) {
    const m = event.id.match(/^E-(\d+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return `E-${String(max + 1).padStart(3, "0")}`;
}

export function appendHistoryEvent(root: string, event: TaskHistoryEvent, taskId = event.task_id): void {
  const parsed = parseHistoryEvent(event);
  if (parsed.task_id !== taskId) {
    throw new Error(`history event task_id ${parsed.task_id} 與目標 task ${taskId} 不一致`);
  }
  const p = historyPath(root, taskId);
  ensureDir(historyDir(root));
  appendFileSync(p, `${JSON.stringify(parsed)}\n`, "utf8");
}
