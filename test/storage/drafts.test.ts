import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeDraft, readDraft, listDraftIds, deleteDraft,
} from "../../src/storage/drafts";
import type { Draft } from "../../src/model/types";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "drf-"));
  mkdirSync(join(root, ".taskcli"));
  return root;
}

const draft: Draft = {
  id: "D-001",
  source: "做登入跟修 bug",
  createdAt: "2026-05-30T10:00:00+08:00",
  items: [
    { title: "登入 API", type: "feature", priority: "med", tags: ["auth"], body: "", include: true },
  ],
};

test("write 後 read 取回相同 draft", () => {
  const root = setup();
  writeDraft(root, draft);
  expect(existsSync(join(root, ".taskcli/drafts/D-001.json"))).toBe(true);
  expect(readDraft(root, "D-001")).toEqual(draft);
});

test("readDraft 不存在丟錯", () => {
  const root = setup();
  expect(() => readDraft(root, "D-404")).toThrow(/D-404/);
});

test("readDraft 對缺欄位/壞結構丟錯", () => {
  const root = setup();
  mkdirSync(join(root, ".taskcli/drafts"), { recursive: true });
  const p = join(root, ".taskcli/drafts/D-002.json");
  writeFileSync(p, '{"id":"D-002"}', "utf8"); // 缺 items
  expect(() => readDraft(root, "D-002")).toThrow(/items/);
});

test("listDraftIds 排序、deleteDraft 移除", () => {
  const root = setup();
  writeDraft(root, { ...draft, id: "D-002" });
  writeDraft(root, draft);
  expect(listDraftIds(root)).toEqual(["D-001", "D-002"]);
  deleteDraft(root, "D-001");
  expect(listDraftIds(root)).toEqual(["D-002"]);
});
