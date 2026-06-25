import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL = resolve(import.meta.dir, "../skills/taskcli/SKILL.md");
const md = () => readFileSync(SKILL, "utf8");

test("SKILL.md 有合法 frontmatter（name/description）", () => {
  const m = md().match(/^---\n([\s\S]*?)\n---\n/);
  expect(m).not.toBeNull();
  const fm = m![1]!;
  expect(fm).toContain("name: taskcli");
  expect(fm).toMatch(/description:\s*\S/);
});

test("SKILL.md 內文含關鍵指令字串", () => {
  const body = md();
  expect(body).toContain("draft create");
  expect(body).toContain("finalize");
  expect(body).toContain("--json");
  expect(body).toContain("review");
});

test("SKILL.md 說明 review 由使用者執行（避免 agent 前景阻塞）", () => {
  const body = md();
  expect(body).toMatch(/Do not run it in the foreground/i);
  expect(body).toMatch(/ask the user to run it/i);
});
