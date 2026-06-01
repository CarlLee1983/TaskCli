import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { transcriptsDir } from "./paths";
import { atomicWrite } from "./io";
import { parseTranscript, serializeTranscript, type Transcript } from "../model/transcript";

export function transcriptPath(root: string, id: string): string {
  return join(transcriptsDir(root), `${id}.md`);
}

export function writeTranscript(root: string, t: Transcript): void {
  atomicWrite(transcriptPath(root, t.id), serializeTranscript(t));
}

export function readTranscript(root: string, id: string): Transcript {
  const p = transcriptPath(root, id);
  if (!existsSync(p)) throw new Error(`找不到 transcript：${id}`);
  return parseTranscript(readFileSync(p, "utf8"));
}

export function listTranscriptIds(root: string): string[] {
  const dir = transcriptsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((id) => /^TR-\d+$/.test(id))
    .sort();
}

export function listTranscripts(root: string): Transcript[] {
  return listTranscriptIds(root).map((id) => readTranscript(root, id));
}

export function deleteTranscript(root: string, id: string): void {
  const p = transcriptPath(root, id);
  if (!existsSync(p)) throw new Error(`找不到 transcript：${id}`);
  rmSync(p);
}
