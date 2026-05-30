import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkillTo, SKILL_MD } from "../../src/commands/skill";

test("installSkillTo 寫到 <dest>/taskcli/SKILL.md 並回傳路徑", () => {
  const dest = mkdtempSync(join(tmpdir(), "sk-"));
  const out = installSkillTo(dest, "hello-skill", false);
  expect(out).toBe(join(dest, "taskcli", "SKILL.md"));
  expect(readFileSync(out, "utf8")).toBe("hello-skill");
});

test("已存在且無 force 時丟錯（含 --force 提示），且不覆寫", () => {
  const dest = mkdtempSync(join(tmpdir(), "sk-"));
  installSkillTo(dest, "v1", false);
  expect(() => installSkillTo(dest, "v2", false)).toThrow(/--force/);
  expect(readFileSync(join(dest, "taskcli", "SKILL.md"), "utf8")).toBe("v1");
});

test("force=true 覆寫既有檔", () => {
  const dest = mkdtempSync(join(tmpdir(), "sk-"));
  installSkillTo(dest, "v1", false);
  installSkillTo(dest, "v2", true);
  expect(readFileSync(join(dest, "taskcli", "SKILL.md"), "utf8")).toBe("v2");
});

test("SKILL_MD 是嵌入的真實 skill 內容（含 frontmatter name 與關鍵指令）", () => {
  expect(SKILL_MD).toContain("name: taskcli");
  expect(SKILL_MD).toContain("draft create");
});
