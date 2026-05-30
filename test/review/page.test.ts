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

// 取出 <script id="draft-data"> 的內容。瀏覽器把 <script> 視為 raw text，
// entity 不解碼，故 textContent 即此字面值——前端 JSON.parse 的就是它。
function embeddedDraftJson(html: string): string {
  const m = html.match(
    /<script type="application\/json" id="draft-data">([\s\S]*?)<\/script>/,
  );
  if (!m) throw new Error("找不到 draft-data script");
  return m[1]!;
}

test("內嵌的 draft JSON 可被前端 JSON.parse（不被 HTML 轉義破壞）", () => {
  const html = renderDraftPage(draft);
  const parsed = JSON.parse(embeddedDraftJson(html)) as Draft;
  expect(parsed.id).toBe("D-001");
  expect(parsed.items).toHaveLength(1);
  expect(parsed.items[0]!.title).toBe("登入 API");
});

test("內嵌 JSON 中的 </script> 被轉義，不會提前關閉 script 元素", () => {
  const evil: Draft = {
    ...draft,
    items: [
      { title: "x</script><img src=x onerror=alert(1)>", type: "fix", priority: "med", tags: [], body: "", include: true },
    ],
  };
  const html = renderDraftPage(evil);
  const json = embeddedDraftJson(html);
  // 內嵌段落不得含有字面 </script>（會提前關閉元素），且仍可正常 parse 還原原值
  expect(json).not.toContain("</script>");
  const parsed = JSON.parse(json) as Draft;
  expect(parsed.items[0]!.title).toBe("x</script><img src=x onerror=alert(1)>");
});
