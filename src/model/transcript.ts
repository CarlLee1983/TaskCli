export interface Transcript {
  id: string;
  title: string;
  source_file: string;
  language: string;
  provider?: string;
  created: string;
  updated: string;
  drafts: string[];
  tasks: string[];
  body: string;
}

const REQUIRED_FM_KEYS = [
  "id",
  "title",
  "source_file",
  "language",
  "created",
  "updated",
  "drafts",
  "tasks",
] as const;

function parseString(field: string, input: unknown): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`欄位 ${field} 需為非空字串`);
  }
  return input;
}

function parseOptionalString(field: string, input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input !== "string") throw new Error(`欄位 ${field} 需為字串`);
  return input === "" ? undefined : input;
}

function parseIdList(field: "drafts" | "tasks", input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error(`欄位 ${field} 需為陣列`);
  const prefix = field === "drafts" ? "D" : "T";
  const re = new RegExp(`^${prefix}-\\d+$`);
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string" || !re.test(item)) {
      throw new Error(`欄位 ${field} 含非法 ID：${String(item)}`);
    }
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

export function serializeTranscript(t: Transcript): string {
  const lines = [
    "---",
    `id: ${JSON.stringify(t.id)}`,
    `title: ${JSON.stringify(t.title)}`,
    `source_file: ${JSON.stringify(t.source_file)}`,
    `language: ${JSON.stringify(t.language)}`,
  ];
  if (t.provider !== undefined) lines.push(`provider: ${JSON.stringify(t.provider)}`);
  lines.push(
    `created: ${JSON.stringify(t.created)}`,
    `updated: ${JSON.stringify(t.updated)}`,
    `drafts: [${t.drafts.map((x) => JSON.stringify(x)).join(",")}]`,
    `tasks: [${t.tasks.map((x) => JSON.stringify(x)).join(",")}]`,
    "---",
    "",
  );
  return `${lines.join("\n")}${t.body}`;
}

export function parseTranscript(raw: string): Transcript {
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
  for (const k of REQUIRED_FM_KEYS) {
    if (!(k in fm)) throw new Error(`frontmatter 缺少欄位：${k}`);
  }

  const id = parseString("id", fm.id);
  if (!/^TR-\d+$/.test(id)) throw new Error(`欄位 id 不合法：${id}，需為 TR-NNN`);

  return {
    id,
    title: parseString("title", fm.title),
    source_file: parseString("source_file", fm.source_file),
    language: parseString("language", fm.language),
    provider: parseOptionalString("provider", fm.provider),
    created: parseString("created", fm.created),
    updated: parseString("updated", fm.updated),
    drafts: parseIdList("drafts", fm.drafts),
    tasks: parseIdList("tasks", fm.tasks),
    body: (bodyRaw ?? "").replace(/^\n/, ""),
  };
}
