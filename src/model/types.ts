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
