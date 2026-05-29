import { writeDraft, readDraft, listDraftIds, parseDraft } from "../storage/drafts";
import { bumpCounter } from "../storage/counter";
import { nowIso } from "../model/clock";
import type { Draft, DraftItem } from "../model/types";

export interface DraftCreateOpts {
  json: string;            // draft 內容（含 source、items）
  now?: () => string;
}

// 在驗證前補上每個 item 的預設欄位（priority、type 缺省）
function withItemDefaults(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.items)) return data;
  const items = o.items.map((raw) => {
    if (typeof raw !== "object" || raw === null) return raw;
    const it = raw as Record<string, unknown>;
    return {
      ...it,
      type: it.type ?? "feature",
      priority: it.priority ?? "med",
    };
  });
  return { ...o, items };
}

export function runDraftCreate(root: string, opts: DraftCreateOpts): string {
  let data: unknown;
  try {
    data = JSON.parse(opts.json);
  } catch {
    throw new Error("draft 內容非合法 JSON");
  }
  const id = bumpCounter(root, "D");
  const now = (opts.now ?? nowIso)();
  const validated = parseDraft({ ...(withItemDefaults(data) as object), id, createdAt: now });
  const draft: Draft = { ...validated, id, createdAt: now };
  writeDraft(root, draft);
  return `已建立 draft ${id}（${draft.items.length} 個項目），用 \`taskcli review ${id}\` 審閱`;
}

export function runDraftList(root: string, opts: { json?: boolean }): string {
  const ids = listDraftIds(root);
  if (opts.json) return JSON.stringify(ids);
  if (ids.length === 0) return "（沒有 draft）";
  return ids.map((id) => {
    const d = readDraft(root, id);
    return `${id}  ${d.items.length} 項  ${d.source}`;
  }).join("\n");
}

export function runDraftShow(root: string, id: string, opts: { json?: boolean }): string {
  const d = readDraft(root, id);
  if (opts.json) return JSON.stringify(d, null, 2);
  const lines = [`draft ${d.id}  (${d.createdAt})`, `來源：${d.source}`, ""];
  d.items.forEach((it: DraftItem, i: number) => {
    const mark = it.include ? "[x]" : "[ ]";
    lines.push(`${mark} ${i + 1}. (${it.type}/${it.priority}) ${it.title}  ${it.tags.map((t) => `#${t}`).join(" ")}`);
  });
  return lines.join("\n");
}
