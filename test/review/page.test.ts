import { expect, test } from "bun:test";
import { renderDraftPage } from "../../src/review/page";
import type { Draft } from "../../src/model/types";

const draft: Draft = {
  id: "D-001",
  source: "做登入 <script>alert(1)</script>",
  createdAt: "2026-05-30T10:00:00+08:00",
  items: [
    { title: "登入 API", type: "feature", priority: "high", tags: ["auth"], body: "", include: true },
  ],
};

test("頁面包含 draft id、提交按鈕與表單", () => {
  const html = renderDraftPage(draft);
  expect(html).toContain("D-001");
  expect(html).toContain("<form");
  expect(html).toContain("送出");
});

test("把 draft 以 JSON 內嵌供前端 JS 使用", () => {
  const html = renderDraftPage(draft);
  expect(html).toContain('id="draft-data"');
  expect(html).toContain("登入 API");
});

test("source 中的危險字元被轉義（避免 XSS 注入到 HTML 文字）", () => {
  const html = renderDraftPage(draft);
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("&lt;script&gt;");
});
