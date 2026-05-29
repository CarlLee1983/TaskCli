export const TASK_TYPES = ["feature", "fix", "refactor", "docs", "test", "chore"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["low", "med", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  tags: string[];
  created: string; // ISO 8601 含 offset
  updated: string;
  body: string;    // frontmatter 之外的 Markdown 內文
}

export interface DraftItem {
  title: string;
  type: TaskType;
  priority: Priority;
  tags: string[];
  body: string;
  include: boolean;
}

export interface Draft {
  id: string;
  source: string;
  createdAt: string;
  items: DraftItem[];
}

export function parseEnum<T extends readonly string[]>(
  field: string,
  value: unknown,
  allowed: T,
): T[number] {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T[number];
  }
  throw new Error(`欄位 ${field} 不合法：${String(value)}，允許值為 ${allowed.join(" | ")}`);
}

export function isTaskType(v: unknown): v is TaskType {
  return typeof v === "string" && (TASK_TYPES as readonly string[]).includes(v);
}

export function parseTags(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const out: string[] = [];
  for (const t of raw) {
    const s = String(t).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
