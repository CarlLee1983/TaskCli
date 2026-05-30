import { expect, test } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../src/cli.ts");

async function run(cwd: string, args: string[], stdin?: string) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    cwd, stdin: stdin ? new TextEncoder().encode(stdin) : undefined,
    stdout: "pipe", stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { stdout, stderr, code };
}

test("init → draft create (stdin) → finalize → list 全流程", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-"));

  const init = await run(root, ["init"]);
  expect(init.code).toBe(0);
  expect(existsSync(join(root, ".taskcli"))).toBe(true);

  const payload = JSON.stringify({ source: "做登入", items: [{ title: "登入 API", type: "feature" }] });
  const create = await run(root, ["draft", "create", "--stdin"], payload);
  expect(create.code).toBe(0);
  expect(create.stdout).toContain("D-001");

  const fin = await run(root, ["finalize", "D-001"]);
  expect(fin.code).toBe(0);
  expect(fin.stdout).toContain("T-001");

  const list = await run(root, ["list", "--json"]);
  expect(list.code).toBe(0);
  expect(JSON.parse(list.stdout).length).toBe(1);
});

test("未 init 時指令給出含 init 的錯誤並非零退出", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-noinit-"));
  const res = await run(root, ["list"]);
  expect(res.code).not.toBe(0);
  expect(res.stderr).toContain("init");
});

test("未知指令顯示用法", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-bad-"));
  const res = await run(root, ["frobnicate"]);
  expect(res.code).not.toBe(0);
  expect(res.stderr.toLowerCase()).toContain("usage");
});
