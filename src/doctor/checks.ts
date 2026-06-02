import { readFileSync, existsSync } from "node:fs";
import { listTaskIds, taskPath } from "../storage/tasks";
import { tasksDir, draftsDir, transcriptsDir, configPath } from "../storage/paths";
import { listHistoryEvents, listHistoryTaskIds } from "../storage/history";
import { listTranscriptIds, transcriptPath } from "../storage/transcripts";
import { parseTranscript } from "../model/transcript";
import { parseTask } from "../model/frontmatter";
import { TASK_TYPES, PRIORITIES } from "../model/types";
import type { Task } from "../model/types";
import type { CheckResult, DoctorReport, Finding } from "./types";

interface LoadedTask {
  fileId: string;
  task: Task | null;
  parseError: string | null;
}

function loadTasks(root: string): LoadedTask[] {
  return listTaskIds(root).map((fileId) => {
    try {
      const raw = readFileSync(taskPath(root, fileId), "utf8");
      return { fileId, task: parseTask(raw), parseError: null };
    } catch (e) {
      return { fileId, task: null, parseError: e instanceof Error ? e.message : String(e) };
    }
  });
}

function checkLayout(root: string): CheckResult {
  const findings: Finding[] = [];
  const dirs: [string, string][] = [
    ["tasks", tasksDir(root)],
    ["drafts", draftsDir(root)],
    ["transcripts", transcriptsDir(root)],
  ];
  for (const [name, dir] of dirs) {
    if (!existsSync(dir)) {
      findings.push({
        code: "layout.missing_dir",
        severity: "warn",
        target: `.taskcli/${name}`,
        message: `缺少目錄 .taskcli/${name}`,
        fixable: true,
      });
    }
  }
  const cfgPath = configPath(root);
  if (existsSync(cfgPath)) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(cfgPath, "utf8")) as Record<string, unknown>;
    } catch {
      findings.push({
        code: "layout.config_unparsable",
        severity: "error",
        target: ".taskcli/config.json",
        message: "config.json 無法解析為 JSON",
        fixable: false,
      });
      return { name: "layout", findings };
    }
    if (
      raw.defaultType !== undefined &&
      !(TASK_TYPES as readonly string[]).includes(raw.defaultType as string)
    ) {
      findings.push({
        code: "layout.config_invalid_enum",
        severity: "warn",
        target: ".taskcli/config.json",
        message: `defaultType 不合法：${String(raw.defaultType)}`,
        fixable: false,
      });
    }
    if (
      raw.defaultPriority !== undefined &&
      !(PRIORITIES as readonly string[]).includes(raw.defaultPriority as string)
    ) {
      findings.push({
        code: "layout.config_invalid_enum",
        severity: "warn",
        target: ".taskcli/config.json",
        message: `defaultPriority 不合法：${String(raw.defaultPriority)}`,
        fixable: false,
      });
    }
  }
  return { name: "layout", findings };
}
function checkTasks(loaded: LoadedTask[]): CheckResult {
  const findings: Finding[] = [];
  const idToFiles = new Map<string, string[]>();
  for (const lt of loaded) {
    if (lt.parseError) {
      findings.push({
        code: "task.parse_failed",
        severity: "error",
        target: lt.fileId,
        message: `frontmatter 解析失敗：${lt.parseError}`,
        fixable: false,
      });
      continue;
    }
    const task = lt.task!;
    if (task.id !== lt.fileId) {
      findings.push({
        code: "task.id_mismatch",
        severity: "error",
        target: lt.fileId,
        message: `檔名與 id 不符（id=${task.id}）`,
        fixable: true,
      });
    }
    idToFiles.set(task.id, [...(idToFiles.get(task.id) ?? []), lt.fileId]);
  }
  for (const [id, files] of idToFiles) {
    if (files.length > 1) {
      findings.push({
        code: "task.duplicate_id",
        severity: "error",
        target: id,
        message: `id ${id} 重複於：${files.join("、")}`,
        fixable: false,
      });
    }
  }
  return { name: "tasks", findings };
}
function checkDeps(loaded: LoadedTask[]): CheckResult {
  const findings: Finding[] = [];
  const tasks = loaded.filter((l) => l.task).map((l) => l.task!) as Task[];
  const byId = new Map<string, Task>();
  // 重複 id 由 checkTasks 負責回報；此處只取第一個，避免重複走邊
  for (const t of tasks) if (!byId.has(t.id)) byId.set(t.id, t);

  for (const t of tasks) {
    for (const dep of t.depends_on ?? []) {
      const target = byId.get(dep);
      if (!target) {
        findings.push({
          code: "dep.dangling",
          severity: "error",
          target: t.id,
          message: `懸空相依 ${dep}`,
          fixable: true,
        });
      } else if (target.status === "cancelled") {
        findings.push({
          code: "dep.on_cancelled",
          severity: "warn",
          target: t.id,
          message: `相依於已取消的 ${dep}`,
          fixable: false,
        });
      }
    }
  }

  // 循環偵測：DFS 白/灰/黑著色，只走存在 task 間的邊
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of byId.keys()) color.set(id, WHITE);
  const stack: string[] = [];
  const reported = new Set<string>();

  // 遞迴 DFS，適用於數百個 task 的規模；若日後 task 數達數千應改為迭代版本
  function dfs(id: string): void {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of byId.get(id)!.depends_on ?? []) {
      if (!byId.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        // 取出環路節點（stack 從 dep 到目前），dep 為環的接點
        const path = stack.slice(stack.indexOf(dep));
        // 正規化：以字典序最小節點為起點旋轉，使同一環無論從哪個節點進入都得到相同 key，
        // 避免將同一環重複回報、也不會誤併不同的環
        const minNode = [...path].sort()[0]!;
        const minIdx = path.indexOf(minNode);
        const ordered = [...path.slice(minIdx), ...path.slice(0, minIdx)];
        const key = ordered.join(",");
        if (!reported.has(key)) {
          reported.add(key);
          findings.push({
            code: "dep.cycle",
            severity: "error",
            target: ordered[0]!,
            message: `循環相依：${[...ordered, ordered[0]].join(" → ")}`,
            fixable: false,
          });
        }
      } else if (color.get(dep) === WHITE) {
        dfs(dep);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const id of [...byId.keys()].sort()) {
    if (color.get(id) === WHITE) dfs(id);
  }

  return { name: "deps", findings };
}
function checkSidecars(root: string, loaded: LoadedTask[]): CheckResult {
  const findings: Finding[] = [];
  const existingIds = new Set(loaded.filter((l) => l.task).map((l) => l.task!.id));

  for (const taskId of listHistoryTaskIds(root)) {
    const file = `${taskId}.jsonl`;
    try {
      listHistoryEvents(root, taskId);
    } catch (e) {
      findings.push({
        code: "history.parse_failed",
        severity: "error",
        target: file,
        message: e instanceof Error ? e.message : String(e),
        fixable: false,
      });
      continue;
    }
    if (!existingIds.has(taskId)) {
      findings.push({
        code: "history.orphan",
        severity: "warn",
        target: file,
        message: `history sidecar 對應的 task ${taskId} 不存在`,
        fixable: false,
      });
    }
  }

  // transcript 不做 orphan 檢查：transcript 屬獨立 inbox，可合法存在於任何 task 之前/之後
  for (const id of listTranscriptIds(root)) {
    try {
      parseTranscript(readFileSync(transcriptPath(root, id), "utf8"));
    } catch (e) {
      findings.push({
        code: "transcript.parse_failed",
        severity: "error",
        target: id,
        message: e instanceof Error ? e.message : String(e),
        fixable: false,
      });
    }
  }

  return { name: "sidecars", findings };
}

export function runChecks(root: string): DoctorReport {
  const loaded = loadTasks(root);
  const checks: CheckResult[] = [
    checkLayout(root),
    checkTasks(loaded),
    checkDeps(loaded),
    checkSidecars(root, loaded),
  ];
  let errorCount = 0;
  let warnCount = 0;
  for (const c of checks) {
    for (const f of c.findings) {
      if (f.severity === "error") errorCount++;
      else if (f.severity === "warn") warnCount++;
    }
  }
  return { ok: errorCount === 0, errorCount, warnCount, checks };
}
