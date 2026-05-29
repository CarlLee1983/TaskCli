import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { taskcliDir } from "./paths";
import { atomicWrite } from "./io";

function counterPath(root: string, prefix: string): string {
  return join(taskcliDir(root), `${prefix.toLowerCase()}-counter.json`);
}

/** Read the current max counter value for a prefix (0 if never set). */
export function readCounter(root: string, prefix: string): number {
  const p = counterPath(root, prefix);
  if (!existsSync(p)) return 0;
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as { max: number };
    return typeof data.max === "number" ? data.max : 0;
  } catch {
    return 0;
  }
}

/** Atomically bump and return the next monotonic ID string (e.g. "D-003"). */
export function bumpCounter(root: string, prefix: string): string {
  const next = readCounter(root, prefix) + 1;
  atomicWrite(counterPath(root, prefix), `${JSON.stringify({ max: next })}\n`);
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
