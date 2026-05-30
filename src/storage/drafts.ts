import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { draftsDir } from "./paths";
import { atomicWrite } from "./io";
import {
  parseEnum, parseTags,
  TASK_TYPES, PRIORITIES,
  type Draft, type DraftItem,
} from "../model/types";

export function draftPath(root: string, id: string): string {
  return join(draftsDir(root), `${id}.json`);
}

export function writeDraft(root: string, d: Draft): void {
  atomicWrite(draftPath(root, d.id), `${JSON.stringify(d, null, 2)}\n`);
}

export function parseDraft(data: unknown): Draft {
  if (typeof data !== "object" || data === null) throw new Error("draft 不是物件");
  const o = data as Record<string, unknown>;
  if (typeof o.id !== "string") throw new Error("draft 缺少 id");
  if (!Array.isArray(o.items)) throw new Error("draft 缺少 items 陣列");
  const items: DraftItem[] = o.items.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`draft item[${i}] 不是物件`);
    }
    const it = raw as Record<string, unknown>;
    if (typeof it.title !== "string" || !it.title.trim()) {
      throw new Error(`draft item[${i}] 缺少 title`);
    }
    return {
      title: it.title,
      type: parseEnum(`item[${i}].type`, it.type, TASK_TYPES),
      priority: parseEnum(`item[${i}].priority`, it.priority, PRIORITIES),
      tags: parseTags(it.tags),
      body: typeof it.body === "string" ? it.body : "",
      include: it.include !== false,
    };
  });
  return {
    id: o.id,
    source: typeof o.source === "string" ? o.source : "",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    items,
  };
}

export function readDraft(root: string, id: string): Draft {
  const p = draftPath(root, id);
  if (!existsSync(p)) throw new Error(`找不到 draft：${id}`);
  return parseDraft(JSON.parse(readFileSync(p, "utf8")));
}

export function listDraftIds(root: string): string[] {
  const dir = draftsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
}

export function deleteDraft(root: string, id: string): void {
  const p = draftPath(root, id);
  if (!existsSync(p)) throw new Error(`找不到 draft：${id}`);
  rmSync(p);
}
