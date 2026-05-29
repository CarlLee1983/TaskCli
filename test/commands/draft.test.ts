import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { runDraftCreate, runDraftList, runDraftShow } from "../../src/commands/draft";
import { readDraft } from "../../src/storage/drafts";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "dc-"));
  runInit(root);
  return root;
}

const payload = JSON.stringify({
  source: "做登入",
  items: [
    { title: "登入 API", type: "feature", priority: "high", tags: ["auth"] },
    { title: "登出", type: "feature" },
  ],
});

test("draft create 從 JSON 字串建立 draft 並指派 D-001（補預設 priority/include）", () => {
  const root = setup();
  const fixedNow = () => "2026-05-30T10:00:00+08:00";
  const msg = runDraftCreate(root, { json: payload, now: fixedNow });
  expect(msg).toContain("D-001");
  const d = readDraft(root, "D-001");
  expect(d.items.length).toBe(2);
  expect(d.items[0]!.priority).toBe("high");
  expect(d.items[1]!.priority).toBe("med"); // 預設
  expect(d.items[0]!.include).toBe(true);   // 預設
  expect(d.createdAt).toBe("2026-05-30T10:00:00+08:00");
});

test("draft create 第二次指派 D-002", () => {
  const root = setup();
  runDraftCreate(root, { json: payload });
  const msg = runDraftCreate(root, { json: payload });
  expect(msg).toContain("D-002");
});

test("draft create 對缺 items 丟錯", () => {
  const root = setup();
  expect(() => runDraftCreate(root, { json: '{"source":"x"}' })).toThrow(/items/);
});

test("draft create 對非法 JSON 丟錯", () => {
  const root = setup();
  expect(() => runDraftCreate(root, { json: "not-json" })).toThrow(/JSON/);
});

test("draft list 列出所有 draft id", () => {
  const root = setup();
  runDraftCreate(root, { json: payload });
  const out = runDraftList(root, {});
  expect(out).toContain("D-001");
});

test("draft show 顯示內容；--json 回傳可解析 JSON", () => {
  const root = setup();
  runDraftCreate(root, { json: payload });
  expect(runDraftShow(root, "D-001", {})).toContain("登入 API");
  const parsed = JSON.parse(runDraftShow(root, "D-001", { json: true }));
  expect(parsed.id).toBe("D-001");
});
