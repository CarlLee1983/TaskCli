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

test("skill install --dest <tmp> 寫出 SKILL.md", async () => {
  const dest = mkdtempSync(join(tmpdir(), "cli-skill-"));
  const cwd = mkdtempSync(join(tmpdir(), "cli-skill-cwd-"));
  const res = await run(cwd, ["skill", "install", "--dest", dest]);
  expect(res.code).toBe(0);
  expect(existsSync(join(dest, "taskcli", "SKILL.md"))).toBe(true);
});

test("install-bin 開發模式給先 build 提示並非零退出", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cli-bin-"));
  const res = await run(cwd, ["install-bin"]);
  // 透過 `bun run` 跑，execPath 為 bun → 應提示先 build
  expect(res.code).not.toBe(0);
  expect(res.stderr).toContain("build");
});

test("update --due / --assignee / --estimate / --add-dep 經 CLI 寫入", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-sch-"));
  await run(root, ["init"]);
  await run(root, ["draft", "create", "--stdin"],
    JSON.stringify({ source: "s", items: [{ title: "a", type: "fix" }] }));
  await run(root, ["finalize", "D-001"]);

  const upd = await run(root, [
    "update", "T-001",
    "--due", "2026-06-15", "--assignee", "carl", "--estimate", "3d", "--add-dep", "T-002",
  ]);
  expect(upd.code).toBe(0);

  const show = await run(root, ["show", "T-001", "--json"]);
  const t = JSON.parse(show.stdout);
  expect(t.due).toBe("2026-06-15");
  expect(t.assignee).toBe("carl");
  expect(t.estimate).toBe("3d");
  expect(t.depends_on).toEqual(["T-002"]);
});

test("import 未知子指令給錯誤訊息並非零退出", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-import-"));
  await run(root, ["init"]);
  const res = await run(root, ["import", "bogus"]);
  expect(res.code).not.toBe(0);
  expect(res.stderr).toContain("未知 import 子指令");
});

test("import 無子指令顯示用法並非零退出", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-import-none-"));
  await run(root, ["init"]);
  const res = await run(root, ["import"]);
  expect(res.code).not.toBe(0);
});


test("add 經 CLI 建立 task", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-add-"));
  await run(root, ["init"]);
  const res = await run(root, ["add", "快速新增", "--tag", "ux", "--body", "內容", "--json"]);
  expect(res.code).toBe(0);
  const t = JSON.parse(res.stdout);
  expect(t.id).toBe("T-001");
  expect(t.title).toBe("快速新增");
  expect(t.tags).toEqual(["ux"]);
  expect(t.body).toBe("內容");
});


test("update --body-file 經 CLI 更新 task body", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-body-"));
  await run(root, ["init"]);
  await run(root, ["add", "補內容"]);
  const bodyFile = join(root, "body.md");
  await Bun.write(bodyFile, "驗收條件\n- 通過測試\n");
  const res = await run(root, ["update", "T-001", "--body-file", bodyFile]);
  expect(res.code).toBe(0);
  const show = await run(root, ["show", "T-001", "--json"]);
  expect(JSON.parse(show.stdout).body).toContain("驗收條件");
});


test("next 經 CLI 顯示下一個可執行 task", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-next-"));
  await run(root, ["init"]);
  await run(root, ["add", "第一件", "--priority", "low"]);
  await run(root, ["add", "高優先", "--priority", "high"]);
  const res = await run(root, ["next", "--json"]);
  expect(res.code).toBe(0);
  const tasks = JSON.parse(res.stdout);
  expect(tasks[0].title).toBe("高優先");
});


test("--version 顯示 package 版本", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cli-version-"));
  const res = await run(cwd, ["--version"]);
  expect(res.code).toBe(0);
  expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
});

test("--help 含 examples", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cli-help-"));
  const res = await run(cwd, ["--help"]);
  expect(res.code).toBe(0);
  expect(res.stdout).toContain("Examples");
  expect(res.stdout).toContain("taskcli add");
});
