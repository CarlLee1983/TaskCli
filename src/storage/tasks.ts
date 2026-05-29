import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tasksDir } from "./paths";
import { atomicWrite } from "./io";
import { serializeTask, parseTask } from "../model/frontmatter";
import type { Task, TaskType, TaskStatus, Priority } from "../model/types";

export function taskPath(root: string, id: string): string {
  return join(tasksDir(root), `${id}.md`);
}

export function writeTask(root: string, t: Task): void {
  atomicWrite(taskPath(root, t.id), serializeTask(t));
}

export function readTask(root: string, id: string): Task {
  const p = taskPath(root, id);
  if (!existsSync(p)) throw new Error(`找不到 task：${id}`);
  return parseTask(readFileSync(p, "utf8"));
}

export function listTaskIds(root: string): string[] {
  const dir = tasksDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
}

export function listTasks(root: string): Task[] {
  return listTaskIds(root).map((id) => readTask(root, id));
}

export interface TaskFilter {
  type?: TaskType;
  status?: TaskStatus;
  priority?: Priority;
  tag?: string;
}

export function filterTasks(tasks: Task[], f: TaskFilter): Task[] {
  return tasks.filter((t) => {
    if (f.type && t.type !== f.type) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.tag && !t.tags.includes(f.tag)) return false;
    return true;
  });
}

export function deleteTask(root: string, id: string): void {
  const p = taskPath(root, id);
  if (!existsSync(p)) throw new Error(`找不到 task：${id}`);
  rmSync(p);
}
