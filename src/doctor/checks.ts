import { readFileSync, existsSync } from "node:fs";
import { listTaskIds, taskPath } from "../storage/tasks";
import { tasksDir, draftsDir, transcriptsDir, configPath } from "../storage/paths";
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

  function dfs(id: string): void {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of byId.get(id)!.depends_on ?? []) {
      if (!byId.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        const start = stack.indexOf(dep);
        const cyc = stack.slice(start).concat(dep);
        const key = [...new Set(cyc)].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          findings.push({
            code: "dep.cycle",
            severity: "error",
            target: cyc[0]!,
            message: `循環相依：${cyc.join(" → ")}`,
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
function checkSidecars(_root: string, _loaded: LoadedTask[]): CheckResult {
  return { name: "sidecars", findings: [] };
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
