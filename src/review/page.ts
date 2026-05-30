import type { Draft } from "../model/types";
import { TASK_TYPES, PRIORITIES } from "../model/types";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderDraftPage(draft: Draft): string {
  // draft 以 JSON 內嵌（放在 script type=application/json，前端解析後渲染表單）
  const dataJson = escapeHtml(JSON.stringify(draft));
  const typeOpts = JSON.stringify(TASK_TYPES);
  const prioOpts = JSON.stringify(PRIORITIES);
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TaskCli 審閱 ${escapeHtml(draft.id)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 880px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.3rem; }
  .src { color: #555; white-space: pre-wrap; background: #f6f6f6; padding: .5rem .75rem; border-radius: 6px; }
  .item { border: 1px solid #ddd; border-radius: 8px; padding: .75rem; margin: .75rem 0; }
  .item label { display: inline-block; margin-right: .75rem; }
  .item input[type=text] { width: 100%; box-sizing: border-box; padding: .3rem; }
  .row { display: flex; gap: .5rem; align-items: center; margin-top: .4rem; flex-wrap: wrap; }
  button { padding: .5rem 1rem; border-radius: 6px; border: 1px solid #888; cursor: pointer; }
  .primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  #status { margin-top: 1rem; font-weight: bold; }
</style>
</head>
<body>
<h1>審閱 draft ${escapeHtml(draft.id)}</h1>
<p class="src">${escapeHtml(draft.source)}</p>
<form id="form">
  <div id="items"></div>
  <div class="row">
    <button type="button" id="add">+ 新增項目</button>
    <button type="submit" class="primary">送出</button>
  </div>
</form>
<div id="status"></div>
<script type="application/json" id="draft-data">${dataJson}</script>
<script>
  const TYPES = ${typeOpts};
  const PRIOS = ${prioOpts};
  const draft = JSON.parse(document.getElementById("draft-data").textContent);
  const itemsEl = document.getElementById("items");

  function sel(name, value, opts) {
    return '<select data-field="' + name + '">' +
      opts.map(o => '<option' + (o === value ? ' selected' : '') + '>' + o + '</option>').join('') +
      '</select>';
  }
  function render() {
    itemsEl.innerHTML = "";
    draft.items.forEach((it, i) => {
      const div = document.createElement("div");
      div.className = "item";
      div.dataset.idx = i;
      div.innerHTML =
        '<label><input type="checkbox" data-field="include"' + (it.include ? ' checked' : '') + '> 納入</label>' +
        '<input type="text" data-field="title" value="' + (it.title || "").replaceAll('"','&quot;') + '">' +
        '<div class="row">type ' + sel("type", it.type, TYPES) +
        ' priority ' + sel("priority", it.priority, PRIOS) +
        ' tags <input type="text" data-field="tags" value="' + (it.tags || []).join(", ") + '">' +
        ' <button type="button" class="del">刪除</button></div>';
      itemsEl.appendChild(div);
    });
  }
  function collect() {
    const items = [...itemsEl.querySelectorAll(".item")].map(div => {
      const get = f => div.querySelector('[data-field="' + f + '"]');
      return {
        include: get("include").checked,
        title: get("title").value,
        type: get("type").value,
        priority: get("priority").value,
        tags: get("tags").value.split(",").map(s => s.trim()).filter(Boolean),
        body: "",
      };
    });
    return { ...draft, items };
  }
  itemsEl.addEventListener("click", e => {
    if (e.target.classList.contains("del")) {
      const idx = Number(e.target.closest(".item").dataset.idx);
      draft.items.splice(idx, 1);
      render();
    }
  });
  document.getElementById("add").addEventListener("click", () => {
    draft.items.push({ title: "", type: TYPES[0], priority: "med", tags: [], body: "", include: true });
    render();
  });
  document.getElementById("form").addEventListener("submit", async e => {
    e.preventDefault();
    const payload = collect();
    const res = await fetch("/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    document.getElementById("status").textContent = res.ok
      ? "✅ 已儲存，可關閉此分頁，回終端機執行 finalize。"
      : "❌ 儲存失敗：" + (await res.text());
  });
  render();
</script>
</body>
</html>`;
}
