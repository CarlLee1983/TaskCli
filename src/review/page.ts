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
  // draft 以 JSON 內嵌（放在 script type=application/json，前端解析後渲染表單）。
  // <script> 是 raw-text 元素，HTML entity 不會被解碼，故「不可」做 HTML 轉義
  // （否則 textContent 會是 &quot; 字面值，JSON.parse 直接拋錯）。
  // 只需把 "<" 轉成 "<"，即可避免內容出現 </script> 提前關閉元素，且仍是合法 JSON。
  const dataJson = JSON.stringify(draft).replaceAll("<", "\\u003c");
  const typeOpts = JSON.stringify(TASK_TYPES);
  const prioOpts = JSON.stringify(PRIORITIES);
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TaskCli 審閱 ${escapeHtml(draft.id)}</title>
<style>
  :root {
    --bg: #f1f5f9; --card: #fff; --border: #e2e8f0; --text: #0f172a;
    --muted: #64748b; --primary: #2563eb; --primary-d: #1d4ed8; --danger: #dc2626;
    --radius: 12px;
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Noto Sans TC", "PingFang TC", sans-serif;
    max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 7rem;
    background: var(--bg); color: var(--text); line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  header { margin-bottom: 1.25rem; }
  h1 { font-size: 1.45rem; margin: 0 0 .35rem; letter-spacing: -.01em; }
  .sub { color: var(--muted); font-size: .9rem; }
  .sub b { color: var(--primary); font-weight: 600; }
  .src {
    color: var(--muted); white-space: pre-wrap; background: var(--card);
    border: 1px solid var(--border); padding: .85rem 1.1rem; border-radius: var(--radius);
    font-size: .88rem; margin: 1rem 0 1.5rem;
  }
  .item {
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 1rem 1.25rem; margin: .85rem 0; box-shadow: 0 1px 3px rgba(15,23,42,.05);
    transition: opacity .15s, box-shadow .15s;
  }
  .item:focus-within { box-shadow: 0 0 0 3px rgba(37,99,235,.15); border-color: var(--primary); }
  .item.excluded { opacity: .45; }
  .item-head { display: flex; align-items: center; gap: .75rem; }
  .item-head input[type=checkbox] { width: 1.15rem; height: 1.15rem; flex: none; cursor: pointer; accent-color: var(--primary); }
  .item-title {
    flex: 1; font-size: 1rem; font-weight: 600; padding: .5rem .65rem;
    border: 1px solid var(--border); border-radius: 8px; color: var(--text);
  }
  .item-title:focus, .field select:focus, .field input:focus { outline: none; border-color: var(--primary); }
  .del { flex: none; background: none; border: none; color: var(--danger); cursor: pointer; font-size: .85rem; padding: .4rem .5rem; border-radius: 6px; }
  .del:hover { background: #fef2f2; }
  .meta { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; margin-top: .85rem; }
  .field { display: flex; flex-direction: column; gap: .25rem; }
  .field > span { font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
  .field select, .field input { padding: .42rem .55rem; border: 1px solid var(--border); border-radius: 8px; background: #fff; font: inherit; font-size: .88rem; color: var(--text); }
  .field.tags { flex: 1; min-width: 160px; }
  .field.tags input { width: 100%; }
  .empty { color: var(--muted); text-align: center; padding: 2rem; border: 1px dashed var(--border); border-radius: var(--radius); background: var(--card); }
  .actions {
    position: sticky; bottom: 0; display: flex; gap: .75rem; align-items: center;
    padding: 1.1rem 0 .5rem; margin-top: 1.25rem;
    background: linear-gradient(transparent, var(--bg) 35%);
  }
  button { font: inherit; padding: .6rem 1.15rem; border-radius: 9px; border: 1px solid var(--border); background: #fff; cursor: pointer; transition: background .12s; }
  button:hover { background: #e2e8f0; }
  .primary { background: var(--primary); color: #fff; border-color: var(--primary); margin-left: auto; font-weight: 600; }
  .primary:hover { background: var(--primary-d); }
  #status { margin-top: 1rem; padding: .8rem 1.1rem; border-radius: 9px; font-weight: 600; font-size: .9rem; }
  #status:empty { display: none; }
  #status.ok { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  #status.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
</style>
</head>
<body>
<header>
  <h1>審閱 draft ${escapeHtml(draft.id)}</h1>
  <div class="sub"><b id="count"></b> · 勾選要納入的項目，調整 type／priority／標題後按「送出」</div>
</header>
<p class="src">${escapeHtml(draft.source)}</p>
<form id="form">
  <div id="items"></div>
  <div class="actions">
    <button type="button" id="add">＋ 新增項目</button>
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
  const countEl = document.getElementById("count");

  function esc(s) {
    return String(s == null ? "" : s)
      .replaceAll("&", "&amp;").replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
  function sel(name, value, opts) {
    return '<select data-field="' + name + '">' +
      opts.map(o => '<option' + (o === value ? ' selected' : '') + '>' + o + '</option>').join('') +
      '</select>';
  }
  function refreshCount() {
    const boxes = [...itemsEl.querySelectorAll('[data-field="include"]')];
    const inc = boxes.filter(b => b.checked).length;
    countEl.textContent = inc + ' / ' + boxes.length + ' 項納入';
  }
  function render() {
    itemsEl.innerHTML = "";
    if (draft.items.length === 0) {
      itemsEl.innerHTML = '<div class="empty">尚無項目，按「＋ 新增項目」加入。</div>';
    }
    draft.items.forEach((it, i) => {
      const div = document.createElement("div");
      div.className = "item" + (it.include ? "" : " excluded");
      div.dataset.idx = i;
      div.innerHTML =
        '<div class="item-head">' +
          '<input type="checkbox" data-field="include"' + (it.include ? ' checked' : '') + ' title="納入">' +
          '<input class="item-title" type="text" data-field="title" placeholder="任務標題" value="' + esc(it.title) + '">' +
          '<button type="button" class="del" title="刪除此項">刪除</button>' +
        '</div>' +
        '<div class="meta">' +
          '<label class="field"><span>type</span>' + sel("type", it.type, TYPES) + '</label>' +
          '<label class="field"><span>priority</span>' + sel("priority", it.priority, PRIOS) + '</label>' +
          '<label class="field tags"><span>tags（逗號分隔）</span>' +
            '<input type="text" data-field="tags" placeholder="例：auth, api" value="' + esc((it.tags || []).join(", ")) + '"></label>' +
        '</div>';
      itemsEl.appendChild(div);
    });
    refreshCount();
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
  itemsEl.addEventListener("change", e => {
    if (e.target.dataset.field === "include") {
      e.target.closest(".item").classList.toggle("excluded", !e.target.checked);
      refreshCount();
    }
  });
  document.getElementById("add").addEventListener("click", () => {
    draft.items.push({ title: "", type: TYPES[0], priority: "med", tags: [], body: "", include: true });
    render();
  });
  document.getElementById("form").addEventListener("submit", async e => {
    e.preventDefault();
    const statusEl = document.getElementById("status");
    const res = await fetch("/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(collect()),
    });
    if (res.ok) {
      statusEl.className = "ok";
      statusEl.textContent = "✅ 已儲存，可關閉此分頁，回終端機執行 finalize。";
    } else {
      statusEl.className = "err";
      statusEl.textContent = "❌ 儲存失敗：" + (await res.text());
    }
  });
  render();
</script>
</body>
</html>`;
}
