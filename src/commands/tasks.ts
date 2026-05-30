import {
  listTasks, filterTasks, readTask, writeTask, deleteTask,
  type TaskFilter,
} from "../storage/tasks";
import { serializeTask } from "../model/frontmatter";
import { nowIso } from "../model/clock";
import {
  parseEnum, parseTags, parseDue, parseDependsOn,
  TASK_TYPES, TASK_STATUSES, PRIORITIES,
  type Task,
} from "../model/types";

export interface ListOpts extends TaskFilter {
  json?: boolean;
}

export function runList(root: string, opts: ListOpts): string {
  const filtered = filterTasks(listTasks(root), {
    type: opts.type, status: opts.status, priority: opts.priority, tag: opts.tag,
  });
  if (opts.json) return JSON.stringify(filtered);
  if (filtered.length === 0) return "（沒有符合的 task）";
  return filtered
    .map((t) =>
      `${t.id}  [${t.status}]  (${t.type}/${t.priority})  ${t.title}` +
      (t.tags.length ? `  ${t.tags.map((x) => `#${x}`).join(" ")}` : ""),
    )
    .join("\n");
}

export function runShow(root: string, id: string, opts: { json?: boolean }): string {
  const t = readTask(root, id);
  if (opts.json) return JSON.stringify(t, null, 2);
  return serializeTask(t);
}

export interface UpdateOpts {
  status?: string;
  priority?: string;
  type?: string;
  title?: string;
  addTag?: string;
  rmTag?: string;
  due?: string;       // YYYY-MM-DD；空字串代表清除
  assignee?: string;  // 空字串代表清除
  estimate?: string;  // 空字串代表清除
  addDep?: string;    // 加入相依 task ID（T-NNN）
  rmDep?: string;     // 移除相依 task ID
  now?: () => string;
}

export function runUpdate(root: string, id: string, opts: UpdateOpts): string {
  const t = readTask(root, id);
  let tags = t.tags;
  if (opts.addTag) tags = parseTags([...tags, opts.addTag]);
  if (opts.rmTag) tags = tags.filter((x) => x !== opts.rmTag);

  let deps = t.depends_on;
  if (opts.addDep !== undefined) deps = parseDependsOn([...(deps ?? []), opts.addDep]);
  if (opts.rmDep !== undefined) deps = (deps ?? []).filter((x) => x !== opts.rmDep);
  // 空陣列正規化為 undefined，使 frontmatter 不輸出 depends_on
  const depends_on = deps && deps.length > 0 ? deps : undefined;

  const updated: Task = {
    ...t,
    title: opts.title ?? t.title,
    type: opts.type ? parseEnum("type", opts.type, TASK_TYPES) : t.type,
    status: opts.status ? parseEnum("status", opts.status, TASK_STATUSES) : t.status,
    priority: opts.priority ? parseEnum("priority", opts.priority, PRIORITIES) : t.priority,
    tags,
    depends_on,
    // 空字串清除；未提供（undefined）則沿用原值
    due: opts.due !== undefined ? parseDue(opts.due) : t.due,
    assignee: opts.assignee !== undefined ? (opts.assignee || undefined) : t.assignee,
    estimate: opts.estimate !== undefined ? (opts.estimate || undefined) : t.estimate,
    updated: (opts.now ?? nowIso)(),
  };
  writeTask(root, updated);
  return `已更新 ${id}`;
}

export function runDone(root: string, id: string, opts: { now?: () => string }): string {
  return runUpdate(root, id, { status: "done", now: opts.now });
}

export function runRm(root: string, id: string): string {
  deleteTask(root, id);
  return `已刪除 ${id}`;
}
