import { readFileSync } from "node:fs";
import { ensureDir, atomicWrite } from "../storage/io";
import { tasksDir, draftsDir, transcriptsDir } from "../storage/paths";
import { listTaskIds, taskPath } from "../storage/tasks";
import { parseTask, serializeTask } from "../model/frontmatter";
import type { Task } from "../model/types";
import type { DoctorReport, FixOutcome } from "./types";

const DIR_BY_TARGET: Record<string, (root: string) => string> = {
  ".taskcli/tasks": tasksDir,
  ".taskcli/drafts": draftsDir,
  ".taskcli/transcripts": transcriptsDir,
};

export function applyFixes(root: string, report: DoctorReport): FixOutcome[] {
  const outcomes: FixOutcome[] = [];
  const fixable = report.checks.flatMap((c) => c.findings).filter((f) => f.fixable);

  // ── 1. layout.missing_dir ────────────────────────────────────────────────
  for (const f of fixable.filter((x) => x.code === "layout.missing_dir")) {
    const dirFn = DIR_BY_TARGET[f.target];
    if (dirFn) {
      ensureDir(dirFn(root));
      outcomes.push({
        code: f.code,
        target: f.target,
        action: `建立目錄 ${f.target}`,
        applied: true,
      });
    }
  }

  // ── Re-derive current task state (never trust finding message text) ──────
  const loaded = listTaskIds(root).map((fileId) => {
    try {
      const task = parseTask(readFileSync(taskPath(root, fileId), "utf8")) as Task;
      return { fileId, task };
    } catch {
      return { fileId, task: null as Task | null };
    }
  });
  const parsed = loaded.filter((l) => l.task !== null) as { fileId: string; task: Task }[];

  // Set of all currently declared ids (used for collision + dep validation)
  const declaredIds = new Set(parsed.map((l) => l.task.id));

  // ── 2. task.id_mismatch ──────────────────────────────────────────────────
  // finding.target = fileId (the filename without extension)
  // 合法擁有者：fileId 與宣告 id 一致的 entry
  const isLegitimateOwner = (l: { fileId: string; task: Task }) => l.fileId === l.task.id;
  for (const f of fixable.filter((x) => x.code === "task.id_mismatch")) {
    const entry = parsed.find((l) => l.fileId === f.target);
    if (!entry) continue;

    // Safety: skip if the task's current declared id is correctly owned by another file.
    // In that case, we have a duplicate-id situation and the right fix is ambiguous.
    const collision = parsed.some(
      (l) =>
        l.fileId !== f.target &&        // 不是待修正的那個 entry
        l.task.id === entry.task.id &&  // 宣告了相同的 task id
        isLegitimateOwner(l),           // 且它是合法擁有者
    );
    if (collision) {
      outcomes.push({
        code: f.code,
        target: f.target,
        action: `跳過：id ${entry.fileId} 已被其他 task 佔用`,
        applied: false,
      });
      continue;
    }

    const oldId = entry.task.id;
    const updated: Task = { ...entry.task, id: entry.fileId };
    // Write to FILENAME path to avoid creating stray files
    atomicWrite(taskPath(root, entry.fileId), serializeTask(updated));
    declaredIds.delete(oldId);
    declaredIds.add(entry.fileId);
    entry.task = updated;
    outcomes.push({
      code: f.code,
      target: f.target,
      action: `將 frontmatter id 改為 ${entry.fileId}`,
      applied: true,
    });
  }

  // ── 3. dep.dangling ──────────────────────────────────────────────────────
  // finding.target = t.id (the declaring task's declared id at check time)
  // We match by task.id OR fileId to be robust.
  // Multiple findings may exist for the same task (one per missing dep);
  // the first pass removes all dangling deps; subsequent passes skip (removed.length === 0).
  for (const f of fixable.filter((x) => x.code === "dep.dangling")) {
    // Phase 2 後 task.id 多已對齊 fileId；雙重比對為防禦性，涵蓋 collision-skip 的 entry
    const entry = parsed.find(
      (l) => l.task.id === f.target || l.fileId === f.target,
    );
    if (!entry || !entry.task.depends_on) continue;

    const removed = entry.task.depends_on.filter((d) => !declaredIds.has(d));
    if (removed.length === 0) continue; // already cleaned by an earlier iteration

    const kept = entry.task.depends_on.filter((d) => declaredIds.has(d));
    const updated: Task = {
      ...entry.task,
      depends_on: kept.length > 0 ? kept : undefined,
    };
    atomicWrite(taskPath(root, entry.fileId), serializeTask(updated));
    entry.task = updated;
    outcomes.push({
      code: f.code,
      target: f.target,
      action: `移除懸空相依 ${removed.join("、")}`,
      applied: true,
    });
  }

  return outcomes;
}
