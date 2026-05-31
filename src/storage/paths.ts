import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function taskcliDir(root: string): string {
  return join(root, ".taskcli");
}
export function tasksDir(root: string): string {
  return join(root, ".taskcli", "tasks");
}
export function draftsDir(root: string): string {
  return join(root, ".taskcli", "drafts");
}
export function historyDir(root: string): string {
  return join(root, ".taskcli", "history");
}
export function configPath(root: string): string {
  return join(root, ".taskcli", "config.json");
}

export function findRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, ".taskcli"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot(startDir: string): string {
  const root = findRoot(startDir);
  if (!root) {
    throw new Error("找不到 .taskcli/，請先在專案根目錄執行 `taskcli init`");
  }
  return root;
}
