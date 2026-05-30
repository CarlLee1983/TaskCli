import {
  parseEnum, parseTags,
  TASK_TYPES, TASK_STATUSES, PRIORITIES,
  type Task,
} from "./types";

const FM_KEYS = [
  "id", "title", "type", "status", "priority", "tags", "created", "updated",
] as const;

export function serializeTask(t: Task): string {
  const lines = [
    "---",
    `id: ${JSON.stringify(t.id)}`,
    `title: ${JSON.stringify(t.title)}`,
    `type: ${JSON.stringify(t.type)}`,
    `status: ${JSON.stringify(t.status)}`,
    `priority: ${JSON.stringify(t.priority)}`,
    `tags: [${t.tags.map((x) => JSON.stringify(x)).join(",")}]`,
    `created: ${JSON.stringify(t.created)}`,
    `updated: ${JSON.stringify(t.updated)}`,
    "---",
    "",
  ];
  return `${lines.join("\n")}${t.body}`;
}

export function parseTask(raw: string): Task {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("缺少 frontmatter 區塊");
  const [, fmBlock, bodyRaw] = m;
  const fm: Record<string, unknown> = {};
  for (const line of fmBlock!.split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(": ");
    if (idx === -1) throw new Error(`frontmatter 格式錯誤：${line}`);
    const key = line.slice(0, idx).trim();
    const valueRaw = line.slice(idx + 2).trim();
    try {
      fm[key] = JSON.parse(valueRaw);
    } catch {
      throw new Error(`frontmatter 值非合法 JSON：${line}`);
    }
  }
  for (const k of FM_KEYS) {
    if (!(k in fm)) throw new Error(`frontmatter 缺少欄位：${k}`);
  }
  return {
    id: String(fm.id),
    title: String(fm.title),
    type: parseEnum("type", fm.type, TASK_TYPES),
    status: parseEnum("status", fm.status, TASK_STATUSES),
    priority: parseEnum("priority", fm.priority, PRIORITIES),
    tags: parseTags(fm.tags),
    created: String(fm.created),
    updated: String(fm.updated),
    body: (bodyRaw ?? "").replace(/^\n/, ""),
  };
}
