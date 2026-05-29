import { expect, test } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { runDraftCreate } from "../../src/commands/draft";
import { runFinalize } from "../../src/commands/finalize";
import { listTaskIds, readTask } from "../../src/storage/tasks";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "fin-"));
  runInit(root);
  return root;
}

const payload = JSON.stringify({
  source: "批次",
  items: [
    { title: "登入 API", type: "feature", priority: "high", tags: ["auth"], include: true },
    { title: "不要這個", type: "chore", include: false },
    { title: "登出", type: "feature", include: true },
  ],
});

test("finalize 只生成 include=true 的 task 並依序給 T 號", () => {
  const root = setup();
  runDraftCreate(root, { json: payload });
  const fixedNow = () => "2026-05-30T12:00:00+08:00";
  const msg = runFinalize(root, "D-001", { now: fixedNow });
  expect(listTaskIds(root)).toEqual(["T-001", "T-002"]);
  const t1 = readTask(root, "T-001");
  expect(t1.title).toBe("登入 API");
  expect(t1.status).toBe("todo");
  expect(t1.created).toBe("2026-05-30T12:00:00+08:00");
  expect(msg).toContain("T-001");
  expect(msg).toContain("T-002");
});

test("finalize 後刪除該 draft", () => {
  const root = setup();
  runDraftCreate(root, { json: payload });
  runFinalize(root, "D-001", {});
  expect(existsSync(join(root, ".taskcli/drafts/D-001.json"))).toBe(false);
});

test("finalize 接續既有 task 編號", () => {
  const root = setup();
  runDraftCreate(root, { json: JSON.stringify({ source: "a", items: [{ title: "X", type: "fix" }] }) });
  runFinalize(root, "D-001", {});
  runDraftCreate(root, { json: JSON.stringify({ source: "b", items: [{ title: "Y", type: "fix" }] }) });
  runFinalize(root, "D-002", {});
  expect(listTaskIds(root)).toEqual(["T-001", "T-002"]);
});

test("finalize 全部 include=false 時丟錯且不刪 draft", () => {
  const root = setup();
  runDraftCreate(root, { json: JSON.stringify({ source: "c", items: [{ title: "Z", type: "fix", include: false }] }) });
  expect(() => runFinalize(root, "D-001", {})).toThrow(/沒有/);
  expect(existsSync(join(root, ".taskcli/drafts/D-001.json"))).toBe(true);
});
