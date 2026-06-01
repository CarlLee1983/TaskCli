import { existsSync, readFileSync } from "node:fs";
import { configPath } from "./paths";
import { parseEnum, TASK_TYPES, PRIORITIES, type TaskType, type Priority } from "../model/types";

export interface TranscriptProviderConfig {
  command: string;
}

export interface TranscriptConfig {
  defaultProvider?: string;
  defaultLanguage: string;
  providers: Record<string, TranscriptProviderConfig>;
}

export interface ResolvedConfig {
  defaultType: TaskType;
  defaultPriority: Priority;
  transcript: TranscriptConfig;
}

const FALLBACK: ResolvedConfig = {
  defaultType: "feature",
  defaultPriority: "med",
  transcript: {
    defaultProvider: undefined,
    defaultLanguage: "zh-TW",
    providers: {},
  },
};

function parseTranscriptConfig(input: unknown): TranscriptConfig {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    return { ...FALLBACK.transcript, providers: {} };
  }
  const obj = input as Record<string, unknown>;
  const providers: Record<string, TranscriptProviderConfig> = {};
  if (typeof obj.providers === "object" && obj.providers != null && !Array.isArray(obj.providers)) {
    for (const [name, value] of Object.entries(obj.providers as Record<string, unknown>)) {
      if (typeof value !== "object" || value == null || Array.isArray(value)) continue;
      const command = (value as Record<string, unknown>).command;
      if (typeof command === "string" && command.trim() !== "") {
        providers[name] = { command };
      }
    }
  }
  return {
    defaultProvider: typeof obj.defaultProvider === "string" && obj.defaultProvider.trim() !== ""
      ? obj.defaultProvider
      : undefined,
    defaultLanguage: typeof obj.defaultLanguage === "string" && obj.defaultLanguage.trim() !== ""
      ? obj.defaultLanguage
      : FALLBACK.transcript.defaultLanguage,
    providers,
  };
}

export function loadConfig(root: string): ResolvedConfig {
  const p = configPath(root);
  if (!existsSync(p)) return FALLBACK;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return FALLBACK;
  }
  return {
    defaultType: raw.defaultType
      ? parseEnum("defaultType", raw.defaultType, TASK_TYPES)
      : FALLBACK.defaultType,
    defaultPriority: raw.defaultPriority
      ? parseEnum("defaultPriority", raw.defaultPriority, PRIORITIES)
      : FALLBACK.defaultPriority,
    transcript: parseTranscriptConfig(raw.transcript),
  };
}
