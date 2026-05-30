import {
  listTasks, filterTasks, readTask, writeTask, deleteTask, listTaskIds,
  type TaskFilter,
} from "../storage/tasks";
import { serializeTask } from "../model/frontmatter";
import { nextId } from "../storage/ids";
import { loadConfig } from "../storage/config";
import { nowIso } from "../model/clock";
import {
  parseEnum, parseTags, parseDue, parseDependsOn,
  TASK_TYPES, TASK_STATUSES, PRIORITIES,
  type Task,
} from "../model/types";

export interface ListOpts extends TaskFilter {
  json?: boolean;
  sort?: "id" | "updated" | "priority" | "status" | "title";
  desc?: boolean;
  limit?: number;
}


const priorityRank = { high: 3, med: 2, low: 1 } as const;
const statusRank = { in_progress: 4, todo: 3, done: 2, cancelled: 1 } as const;

function sortTasks(tasks: Task[], sort: ListOpts["sort"] = "id", desc = false): Task[] {
  const out = [...tasks].sort((a, b) => {
    let cmp = 0;
    if (sort === "priority") cmp = priorityRank[a.priority] - priorityRank[b.priority];
    else if (sort === "status") cmp = statusRank[a.status] - statusRank[b.status];
    else cmp = String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""));
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return desc ? -cmp : cmp;
  });
  return out;
}

export function runList(root: string, opts: ListOpts): string {
  let filtered = filterTasks(listTasks(root), {
    type: opts.type, status: opts.status, priority: opts.priority, tag: opts.tag, query: opts.query,
  });
  filtered = sortTasks(filtered, opts.sort, opts.desc);
  if (opts.limit !== undefined) {
    if (!Number.isInteger(opts.limit) || opts.limit <= 0) throw new Error("--limit 需為正整數");
    filtered = filtered.slice(0, opts.limit);
  }
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


export interface AddOpts {
  type?: string;
  priority?: string;
  tags?: string;
  body?: string;
  due?: string;
  assignee?: string;
  estimate?: string;
  addDep?: string;
  json?: boolean;
  now?: () => string;
}

export function runAdd(root: string, title: string, opts: AddOpts): string {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("add 需要非空白 title");
  const cfg = loadConfig(root);
  const now = (opts.now ?? nowIso)();
  const task: Task = {
    id: nextId("T", listTaskIds(root)),
    title: cleanTitle,
    type: opts.type ? parseEnum("type", opts.type, TASK_TYPES) : cfg.defaultType,
    status: "todo",
    priority: opts.priority ? parseEnum("priority", opts.priority, PRIORITIES) : cfg.defaultPriority,
    tags: parseTags(opts.tags ?? []),
    created: now,
    updated: now,
    body: opts.body ?? "",
    due: opts.due !== undefined ? parseDue(opts.due) : undefined,
    assignee: opts.assignee || undefined,
    estimate: opts.estimate || undefined,
    depends_on: opts.addDep !== undefined ? parseDependsOn(opts.addDep) : undefined,
  };
  writeTask(root, task);
  if (opts.json) return JSON.stringify(task, null, 2);
  return `已建立 ${task.id}`;
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
  body?: string;
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
    body: opts.body !== undefined ? opts.body : t.body,
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


export interface NextOpts {
  json?: boolean;
  limit?: number;
}

function isDone(tasks: Task[], id: string): boolean {
  return tasks.find((t) => t.id === id)?.status === "done";
}

function isBlocked(t: Task, all: Task[]): boolean {
  return (t.depends_on ?? []).some((id) => !isDone(all, id));
}

export function runNext(root: string, opts: NextOpts): string {
  const all = listTasks(root);
  const limit = opts.limit ?? 1;
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit 需為正整數");
  const candidates = all
    .filter((t) => (t.status === "todo" || t.status === "in_progress") && !isBlocked(t, all))
    .sort((a, b) => {
      const status = statusRank[a.status] - statusRank[b.status];
      if (status !== 0) return -status;
      const priority = priorityRank[a.priority] - priorityRank[b.priority];
      if (priority !== 0) return -priority;
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit);
  if (opts.json) return JSON.stringify(candidates, null, 2);
  if (candidates.length === 0) return "（沒有可執行的 task）";
  return candidates.map((t) => `${t.id}  [${t.status}]  (${t.type}/${t.priority})  ${t.title}`).join("\n");
}

export function runDone(root: string, id: string, opts: { now?: () => string }): string {
  return runUpdate(root, id, { status: "done", now: opts.now });
}

export function runRm(root: string, id: string): string {
  deleteTask(root, id);
  return `已刪除 ${id}`;
}
