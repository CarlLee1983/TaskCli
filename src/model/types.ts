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
  // 以下皆選填，未設定時不輸出於 frontmatter（向後相容舊 task）
  due?: string;        // 截止日 YYYY-MM-DD
  assignee?: string;   // 負責人（自由字串）
  estimate?: string;   // 工時估計（自由字串，如 2h / 3d / 5pt）
  depends_on?: string[]; // 相依 task ID（T-NNN）
  source?: string;     // 外部來源辨識，如 github:owner/repo#42
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

/** 驗證 due 為 YYYY-MM-DD；空值回 undefined（代表不設定）。 */
export function parseDue(input: unknown): string | undefined {
  if (input == null) return undefined;
  const s = String(input).trim();
  if (s === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`欄位 due 格式錯誤：${s}，需為 YYYY-MM-DD`);
  }
  return s;
}

/** 正規化 depends_on：陣列或逗號字串 → 去空白/去重，並驗證每個為 T-NNN。 */
export function parseDependsOn(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const out: string[] = [];
  for (const t of raw) {
    const s = String(t).trim();
    if (!s) continue;
    if (!/^T-\d+$/.test(s)) {
      throw new Error(`欄位 depends_on 含非法 task ID：${s}，需為 T-NNN`);
    }
    if (!out.includes(s)) out.push(s);
  }
  return out;
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

export const TASK_HISTORY_EVENT_TYPES = [
  "note",
  "decision",
  "status_change",
  "verification",
  "source",
] as const;
export type TaskHistoryEventType = (typeof TASK_HISTORY_EVENT_TYPES)[number];

export const MANUAL_TASK_HISTORY_EVENT_TYPES = [
  "note",
  "decision",
  "verification",
  "source",
] as const;
export type ManualTaskHistoryEventType = (typeof MANUAL_TASK_HISTORY_EVENT_TYPES)[number];

export interface TaskHistoryEvent {
  id: string;
  task_id: string;
  type: TaskHistoryEventType;
  created: string;
  author?: string;
  title?: string;
  body: string;
  meta?: Record<string, string>;
}

export function parseHistoryEventType(input: unknown): TaskHistoryEventType {
  return parseEnum("history type", input, TASK_HISTORY_EVENT_TYPES);
}

export function parseManualHistoryEventType(input: unknown): ManualTaskHistoryEventType {
  return parseEnum("history type", input, MANUAL_TASK_HISTORY_EVENT_TYPES);
}

function parseOptionalString(field: string, input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input !== "string") throw new Error(`欄位 ${field} 需為字串`);
  return input === "" ? undefined : input;
}

function parseHistoryMeta(input: unknown): Record<string, string> | undefined {
  if (input == null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("欄位 meta 需為物件");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v !== "string") throw new Error(`欄位 meta.${k} 需為字串`);
    out[k] = v;
  }
  return out;
}

export function parseHistoryEvent(input: unknown): TaskHistoryEvent {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    throw new Error("history event 需為物件");
  }
  const obj = input as Record<string, unknown>;
  const id = parseOptionalString("id", obj.id);
  const task_id = parseOptionalString("task_id", obj.task_id);
  const created = parseOptionalString("created", obj.created);
  if (!id || !/^E-\d+$/.test(id)) throw new Error(`欄位 id 不合法：${String(obj.id)}，需為 E-NNN`);
  if (!task_id || !/^T-\d+$/.test(task_id)) throw new Error(`欄位 task_id 不合法：${String(obj.task_id)}，需為 T-NNN`);
  if (!created) throw new Error("欄位 created 需為非空字串");
  const body = obj.body == null ? "" : obj.body;
  if (typeof body !== "string") throw new Error("欄位 body 需為字串");
  return {
    id,
    task_id,
    type: parseHistoryEventType(obj.type),
    created,
    author: parseOptionalString("author", obj.author),
    title: parseOptionalString("title", obj.title),
    body,
    meta: parseHistoryMeta(obj.meta),
  };
}
