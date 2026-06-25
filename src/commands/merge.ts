import { listTasks, readTask, writeTask, deleteTask } from "../storage/tasks";
import { appendHistoryEvent, listHistoryEvents, nextHistoryEventId, deleteHistory } from "../storage/history";
import { hasCycle } from "../model/deps";
import { nowIso } from "../model/clock";
import { parseTags, type Task } from "../model/types";

export interface MergeOpts {
  source: string;
  target: string;
  json?: boolean;
  now?: () => string;
}

// 將 deps 中的 source 改指向 target，去除自我相依（== ownerId）並去重
function remapDeps(deps: string[] | undefined, ownerId: string, source: string, target: string): string[] {
  const out: string[] = [];
  for (const d of deps ?? []) {
    const mapped = d === source ? target : d;
    if (mapped === ownerId) continue;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

// 空陣列正規化為 undefined，使 frontmatter 不輸出 depends_on
function normalizeDeps(deps: string[]): string[] | undefined {
  return deps.length > 0 ? deps : undefined;
}

function depsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function runMerge(root: string, opts: MergeOpts): string {
  const { source, target } = opts;
  if (source === target) throw new Error("merge 的 source 與 target 不可相同");
  const sourceTask = readTask(root, source); // 不存在則丟「找不到 task：<id>」
  const targetTask = readTask(root, target);
  const now = (opts.now ?? nowIso)();
  const all = listTasks(root);

  // 1. target 的新 deps（聯集 source）與 tags
  const newTargetDeps = remapDeps(
    [...(targetTask.depends_on ?? []), ...(sourceTask.depends_on ?? [])],
    target,
    source,
    target,
  );
  const newTargetTags = parseTags([...targetTask.tags, ...sourceTask.tags]);

  // 2. 其餘 task 的入向相依重接（只記錄實際有變動者）
  const repointed: string[] = [];
  const rewrites = new Map<string, Task>();
  for (const t of all) {
    if (t.id === source || t.id === target) continue;
    const next = remapDeps(t.depends_on, t.id, source, target);
    if (!depsEqual(next, t.depends_on ?? [])) {
      rewrites.set(t.id, { ...t, depends_on: normalizeDeps(next), updated: now });
      repointed.push(t.id);
    }
  }

  // 3. 合併後完整相依圖（排除 source），循環檢查；通過才落盤
  const graph = new Map<string, string[]>();
  for (const t of all) {
    if (t.id === source) continue;
    if (t.id === target) {
      graph.set(target, newTargetDeps);
      continue;
    }
    const rw = rewrites.get(t.id);
    graph.set(t.id, (rw ? rw.depends_on : t.depends_on) ?? []);
  }
  if (hasCycle(graph)) throw new Error(`merge 會造成循環相依，已取消：${source} → ${target}`);

  // 4. 落盤
  const updatedTarget: Task = {
    ...targetTask,
    tags: newTargetTags,
    depends_on: normalizeDeps(newTargetDeps),
    updated: now,
  };
  writeTask(root, updatedTarget);
  for (const t of rewrites.values()) writeTask(root, t);

  // 5. target history 記 merge note
  appendHistoryEvent(
    root,
    {
      id: nextHistoryEventId(listHistoryEvents(root, target)),
      task_id: target,
      type: "note",
      created: now,
      title: `merged from ${source}`,
      body: `將 ${source}（${sourceTask.title}）併入 ${target}`,
    },
    target,
  );

  // 6. 刪除 source 與其 history sidecar
  deleteTask(root, source);
  deleteHistory(root, source);

  if (opts.json) return JSON.stringify({ target, deleted: source, repointed });
  return `已將 ${source} 併入 ${target}，重接 ${repointed.length} 個相依`;
}
