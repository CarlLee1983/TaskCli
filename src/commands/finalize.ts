import { readDraft, deleteDraft } from "../storage/drafts";
import { writeTask, listTaskIds } from "../storage/tasks";
import { nextId } from "../storage/ids";
import { nowIso } from "../model/clock";
import type { Task } from "../model/types";

export interface FinalizeOpts {
  now?: () => string;
}

export function runFinalize(root: string, draftId: string, opts: FinalizeOpts): string {
  const draft = readDraft(root, draftId);
  const chosen = draft.items.filter((it) => it.include);
  if (chosen.length === 0) {
    throw new Error(`draft ${draftId} 沒有任何 include=true 的項目，無法生成 task`);
  }
  const now = (opts.now ?? nowIso)();
  const created: string[] = [];
  const existing = listTaskIds(root);
  for (const it of chosen) {
    const id = nextId("T", [...existing, ...created]);
    const task: Task = {
      id,
      title: it.title,
      type: it.type,
      status: "todo",
      priority: it.priority,
      tags: it.tags,
      created: now,
      updated: now,
      body: it.body,
    };
    writeTask(root, task);
    created.push(id);
  }
  deleteDraft(root, draftId);
  return `已從 ${draftId} 生成 ${created.length} 個 task：${created.join(", ")}`;
}
