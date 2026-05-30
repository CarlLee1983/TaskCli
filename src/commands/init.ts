import { existsSync } from "node:fs";
import { configPath, tasksDir, draftsDir, taskcliDir } from "../storage/paths";
import { ensureDir, atomicWrite } from "../storage/io";
import { TASK_TYPES, PRIORITIES } from "../model/types";

export function runInit(cwd: string): string {
  const existed = existsSync(taskcliDir(cwd));
  ensureDir(tasksDir(cwd));
  ensureDir(draftsDir(cwd));
  if (!existsSync(configPath(cwd))) {
    const cfg = {
      taskTypes: [...TASK_TYPES],
      priorities: [...PRIORITIES],
      defaultType: "feature",
      defaultPriority: "med",
    };
    atomicWrite(configPath(cwd), `${JSON.stringify(cfg, null, 2)}\n`);
  }
  return existed
    ? `.taskcli 已存在，已確保骨架完整：${taskcliDir(cwd)}`
    : `已建立 .taskcli 骨架：${taskcliDir(cwd)}`;
}
