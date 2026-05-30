import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { runDraftCreate } from "../../src/commands/draft";
import { readDraft } from "../../src/storage/drafts";
import { startReviewServer } from "../../src/review/server";

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), "srv-"));
  runInit(root);
  runDraftCreate(root, {
    json: JSON.stringify({ source: "x", items: [{ title: "原始", type: "fix" }] }),
  });
  return root;
}

test("GET / 回傳審閱 HTML", async () => {
  const root = setup();
  const srv = startReviewServer(root, "D-001", { port: 0 });
  try {
    const res = await fetch(srv.url);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("D-001");
  } finally {
    srv.stop();
  }
});

test("POST /save 回寫 draft", async () => {
  const root = setup();
  const srv = startReviewServer(root, "D-001", { port: 0 });
  try {
    const body = JSON.stringify({
      id: "D-001", source: "x", createdAt: "2026-05-30T10:00:00+08:00",
      items: [{ title: "改過了", type: "feature", priority: "high", tags: ["a"], body: "", include: true }],
    });
    const res = await fetch(srv.url + "save", {
      method: "POST", headers: { "content-type": "application/json" }, body,
    });
    expect(res.status).toBe(200);
    const d = readDraft(root, "D-001");
    expect(d.items[0]!.title).toBe("改過了");
    expect(d.items[0]!.type).toBe("feature");
  } finally {
    srv.stop();
  }
});

test("POST /save 對壞資料回 400", async () => {
  const root = setup();
  const srv = startReviewServer(root, "D-001", { port: 0 });
  try {
    const res = await fetch(srv.url + "save", {
      method: "POST", headers: { "content-type": "application/json" },
      body: '{"items":"not-array"}',
    });
    expect(res.status).toBe(400);
  } finally {
    srv.stop();
  }
});
