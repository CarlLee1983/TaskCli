import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { loadConfig } from "../storage/config";
import { nextId } from "../storage/ids";
import {
  deleteTranscript,
  listTranscriptIds,
  listTranscripts,
  readTranscript,
  writeTranscript,
} from "../storage/transcripts";
import { serializeTranscript } from "../model/transcript";
import { nowIso } from "../model/clock";
import type { Transcript } from "../model/transcript";

export interface TranscriptAddOpts {
  fromFile?: string;
  title?: string;
  language?: string;
  now?: () => string;
}

export interface TranscriptListOpts {
  json?: boolean;
}

export interface TranscriptShowOpts {
  json?: boolean;
}

function titleFromPath(path: string): string {
  const base = basename(path);
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

function createTranscript(root: string, input: {
  body: string;
  sourceFile: string;
  title?: string;
  language?: string;
  provider?: string;
  now?: () => string;
}): Transcript {
  const cleanBody = input.body;
  if (cleanBody.trim() === "") throw new Error("transcript 內容不可為空");
  const cfg = loadConfig(root);
  const now = (input.now ?? nowIso)();
  return {
    id: nextId("TR", listTranscriptIds(root)),
    title: input.title?.trim() || titleFromPath(input.sourceFile),
    source_file: input.sourceFile,
    language: input.language?.trim() || cfg.transcript.defaultLanguage,
    provider: input.provider,
    created: now,
    updated: now,
    drafts: [],
    tasks: [],
    body: cleanBody,
  };
}

export function runTranscriptAdd(root: string, opts: TranscriptAddOpts): string {
  if (!opts.fromFile) throw new Error("transcript add 需要 --from-file <file>");
  if (!existsSync(opts.fromFile)) throw new Error(`找不到 transcript 來源檔案：${opts.fromFile}`);
  const body = readFileSync(opts.fromFile, "utf8");
  const transcript = createTranscript(root, {
    body,
    sourceFile: opts.fromFile,
    title: opts.title,
    language: opts.language,
    now: opts.now,
  });
  writeTranscript(root, transcript);
  return `已建立 ${transcript.id}`;
}

export function runTranscriptList(root: string, opts: TranscriptListOpts): string {
  const transcripts = listTranscripts(root);
  if (opts.json) {
    return JSON.stringify(transcripts.map(({ body: _body, ...meta }) => meta), null, 2);
  }
  if (transcripts.length === 0) return "（沒有 transcript）";
  return transcripts.map((t) => `${t.id}  ${t.title}`).join("\n");
}

export function runTranscriptShow(root: string, id: string, opts: TranscriptShowOpts): string {
  const transcript = readTranscript(root, id);
  if (opts.json) return JSON.stringify(transcript, null, 2);
  return serializeTranscript(transcript);
}

export function runTranscriptRm(root: string, id: string): string {
  deleteTranscript(root, id);
  return `已刪除 ${id}`;
}

export interface TranscriptImportOpts {
  provider?: string;
  title?: string;
  language?: string;
  now?: () => string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function renderProviderCommand(command: string, values: { input: string; language: string }): string {
  return command
    .replaceAll("{input}", shellQuote(values.input))
    .replaceAll("{language}", shellQuote(values.language));
}

async function runProviderCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { stdout, stderr, code };
}

export async function runTranscriptImport(root: string, audioFile: string, opts: TranscriptImportOpts): Promise<string> {
  if (!audioFile) throw new Error("transcript import 需要 <audio-file>");
  if (!existsSync(audioFile)) throw new Error(`找不到 audio 檔案：${audioFile}`);
  const cfg = loadConfig(root);
  const providerName = opts.provider ?? cfg.transcript.defaultProvider;
  if (!providerName) throw new Error("未設定 transcript provider，請使用 --provider 或設定 transcript.defaultProvider");
  const provider = cfg.transcript.providers[providerName];
  if (!provider) throw new Error(`未知 transcript provider：${providerName}`);

  const language = opts.language?.trim() || cfg.transcript.defaultLanguage;
  const command = renderProviderCommand(provider.command, { input: audioFile, language });
  const result = await runProviderCommand(command);
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
    throw new Error(`transcript provider ${providerName} 執行失敗：${detail}`);
  }
  if (result.stdout.trim() === "") {
    throw new Error(`transcript provider ${providerName} stdout 為空`);
  }

  const transcript = createTranscript(root, {
    body: result.stdout,
    sourceFile: audioFile,
    title: opts.title,
    language,
    provider: providerName,
    now: opts.now,
  });
  writeTranscript(root, transcript);
  return `已建立 ${transcript.id}`;
}
