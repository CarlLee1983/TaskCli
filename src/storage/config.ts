import { existsSync, readFileSync } from "node:fs";
import { configPath } from "./paths";
import { parseEnum, TASK_TYPES, PRIORITIES, type TaskType, type Priority } from "../model/types";

export interface ResolvedConfig {
  defaultType: TaskType;
  defaultPriority: Priority;
}

const FALLBACK: ResolvedConfig = { defaultType: "feature", defaultPriority: "med" };

export function loadConfig(root: string): ResolvedConfig {
  const p = configPath(root);
  if (!existsSync(p)) return FALLBACK;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return FALLBACK; // 壞 JSON 容錯回退
  }
  return {
    defaultType: raw.defaultType
      ? parseEnum("defaultType", raw.defaultType, TASK_TYPES)
      : FALLBACK.defaultType,
    defaultPriority: raw.defaultPriority
      ? parseEnum("defaultPriority", raw.defaultPriority, PRIORITIES)
      : FALLBACK.defaultPriority,
  };
}
