import { copyFileSync, chmodSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { ensureDir, atomicWrite } from "../storage/io";

// Bun --compile embeds static text imports at build time.
// This import is resolved by the bundler and the file content is baked into the binary.
import SKILL_TEXT from "../../skills/taskcli/SKILL.md" with { type: "text" };

export const SKILL_MD: string = SKILL_TEXT;

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/** 把 skill 內容寫到 <destBaseDir>/taskcli/SKILL.md，回傳寫入路徑。 */
export function installSkillTo(destBaseDir: string, content: string, force: boolean): string {
  const dir = join(destBaseDir, "taskcli");
  const file = join(dir, "SKILL.md");
  if (existsSync(file) && !force) {
    throw new Error(`${file} 已存在，加 --force 覆寫`);
  }
  ensureDir(dir);
  atomicWrite(file, content);
  return file;
}

export interface SkillInstallOpts {
  dest?: string;   // 預設 ~/.claude/skills
  force?: boolean;
}

export function runSkillInstall(opts: SkillInstallOpts): string {
  const base = expandHome(opts.dest ?? "~/.claude/skills");
  const out = installSkillTo(base, SKILL_MD, opts.force ?? false);
  return `已安裝 skill 到 ${out}`;
}

export function runInstallBin(options: { dest?: string }): string {
  const dest = resolve(options.dest ?? join(homedir(), ".local", "bin"));
  ensureDir(dest);

  // Bun.argv[0] is the path to the current executable (works both in compiled binary and dev mode)
  const src = process.execPath;
  const outPath = join(dest, "taskcli");

  copyFileSync(src, outPath);
  chmodSync(outPath, 0o755);

  if (!existsSync(outPath)) throw new Error(`複製失敗：${outPath} 不存在`);

  return `已安裝 taskcli 到 ${outPath}`;
}
