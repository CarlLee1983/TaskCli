import type { Task, TaskStatus } from "../model/types";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// 看板欄位由左至右的流程順序與中文標籤
const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "待辦" },
  { status: "in_progress", label: "進行中" },
  { status: "done", label: "已完成" },
  { status: "cancelled", label: "已取消" },
];

const priorityRank = { high: 3, med: 2, low: 1 } as const;

/** 欄位內排序：優先級高→低，其次 id 升冪。 */
function sortColumn(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const p = priorityRank[b.priority] - priorityRank[a.priority];
    if (p !== 0) return p;
    return a.id.localeCompare(b.id);
  });
}

function metaLine(label: string, value: string | string[] | undefined): string {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join(", ") : value;
  if (!text) return "";
  return `<div class="meta"><span>${escapeHtml(label)}</span><b>${escapeHtml(text)}</b></div>`;
}

function renderCard(task: Task): string {
  const tags = task.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join(" ");
  // client 端篩選用：彙整可搜尋文字與分類維度
  const haystack = [task.id, task.title, task.assignee ?? "", ...task.tags].join(" ").toLowerCase();
  return `<article class="card pri-${escapeHtml(task.priority)}"
    data-text="${escapeHtml(haystack)}"
    data-type="${escapeHtml(task.type)}"
    data-priority="${escapeHtml(task.priority)}">
    <div class="card-top">
      <span class="id">${escapeHtml(task.id)}</span>
      <span class="badges">
        <span class="badge type">${escapeHtml(task.type)}</span>
        <span class="badge prio prio-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
      </span>
    </div>
    <h3>${escapeHtml(task.title)}</h3>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    ${metaLine("負責", task.assignee)}
    ${metaLine("截止", task.due)}
    ${metaLine("估時", task.estimate)}
    ${metaLine("相依", task.depends_on)}
  </article>`;
}

function renderColumn(label: string, status: TaskStatus, tasks: Task[]): string {
  const cards = tasks.length
    ? sortColumn(tasks).map(renderCard).join("\n")
    : `<p class="col-empty">（無）</p>`;
  return `<section class="column" data-status="${status}">
    <header class="col-head">
      <span class="col-title">${escapeHtml(label)}</span>
      <span class="col-count" data-total="${tasks.length}">${tasks.length}</span>
    </header>
    <div class="col-body">
      ${cards}
    </div>
  </section>`;
}

const FILTER_SCRIPT = `
const q = document.getElementById('q');
const fType = document.getElementById('f-type');
const fPrio = document.getElementById('f-prio');
function applyFilter() {
  const text = q.value.trim().toLowerCase();
  const type = fType.value;
  const prio = fPrio.value;
  for (const col of document.querySelectorAll('.column')) {
    let shown = 0;
    for (const card of col.querySelectorAll('.card')) {
      const okText = !text || card.dataset.text.includes(text);
      const okType = !type || card.dataset.type === type;
      const okPrio = !prio || card.dataset.priority === prio;
      const visible = okText && okType && okPrio;
      card.style.display = visible ? '' : 'none';
      if (visible) shown++;
    }
    const count = col.querySelector('.col-count');
    const total = count.dataset.total;
    count.textContent = shown === Number(total) ? total : shown + '/' + total;
  }
}
q.addEventListener('input', applyFilter);
fType.addEventListener('change', applyFilter);
fPrio.addEventListener('change', applyFilter);
`;

export function renderBoardPage(tasks: Task[], projectName: string): string {
  const byStatus = (status: TaskStatus): Task[] => tasks.filter((t) => t.status === status);
  const columns = COLUMNS.map((c) => renderColumn(c.label, c.status, byStatus(c.status))).join("\n");
  const empty = tasks.length === 0
    ? `<div class="empty">
        <h2>尚無任務</h2>
        <p>可用 CLI 建立第一筆 task：</p>
        <code>taskcli add "我的第一個任務"</code>
      </div>`
    : "";

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(projectName)} · 任務看板</title>
<style>
  :root { --bg:#f8fafc; --card:#fff; --border:#e2e8f0; --text:#0f172a; --muted:#64748b; --primary:#2563eb; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:system-ui,-apple-system,"Noto Sans TC","PingFang TC",sans-serif; background:var(--bg); color:var(--text); line-height:1.5; }
  header.top { background:var(--card); border-bottom:1px solid var(--border); padding:1rem 1.4rem; position:sticky; top:0; z-index:5; }
  h1 { margin:0 0 .15rem; font-size:1.35rem; letter-spacing:-.02em; }
  .sub { color:var(--muted); font-size:.85rem; }
  .toolbar { display:flex; flex-wrap:wrap; gap:.6rem; margin-top:.85rem; }
  .toolbar input, .toolbar select { font:inherit; padding:.4rem .6rem; border:1px solid var(--border); border-radius:9px; background:#fff; color:var(--text); }
  .toolbar input { flex:1; min-width:160px; }
  main { padding:1.25rem 1.4rem 3rem; }
  .board { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:1rem; align-items:start; }
  .column { background:#f1f5f9; border:1px solid var(--border); border-radius:14px; padding:.7rem; }
  .col-head { display:flex; align-items:center; justify-content:space-between; padding:.1rem .35rem .6rem; }
  .col-title { font-weight:700; }
  .col-count { background:#e2e8f0; color:#334155; border-radius:999px; padding:.1rem .55rem; font-size:.8rem; font-weight:700; }
  .col-body { display:grid; gap:.6rem; }
  .col-empty { color:var(--muted); font-size:.85rem; text-align:center; padding:.6rem 0; margin:0; }
  .card { background:var(--card); border:1px solid var(--border); border-left:4px solid var(--muted); border-radius:11px; padding:.7rem .8rem; box-shadow:0 1px 2px rgba(15,23,42,.04); }
  .card.pri-high { border-left-color:#dc2626; }
  .card.pri-med { border-left-color:#d97706; }
  .card.pri-low { border-left-color:#16a34a; }
  .card-top { display:flex; align-items:center; justify-content:space-between; gap:.5rem; }
  .id { font-size:.78rem; font-weight:700; color:var(--muted); font-variant-numeric:tabular-nums; }
  .card h3 { margin:.4rem 0 .35rem; font-size:.96rem; font-weight:650; }
  .badges { display:flex; gap:.3rem; }
  .badge, .tag { display:inline-block; border-radius:999px; padding:.1rem .5rem; font-size:.72rem; font-weight:650; }
  .badge.type { background:#e2e8f0; color:#334155; }
  .badge.prio-high { background:#fee2e2; color:#b91c1c; }
  .badge.prio-med { background:#fef3c7; color:#b45309; }
  .badge.prio-low { background:#dcfce7; color:#15803d; }
  .tags { margin:.3rem 0; display:flex; flex-wrap:wrap; gap:.25rem; }
  .tag { background:#eff6ff; color:#1d4ed8; }
  .meta { display:flex; justify-content:space-between; gap:.6rem; font-size:.78rem; margin-top:.25rem; }
  .meta span { color:var(--muted); }
  .empty { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:1.5rem; color:var(--muted); margin-bottom:1rem; }
  code { display:block; background:#f1f5f9; border:1px solid var(--border); border-radius:9px; padding:.7rem; margin-top:.5rem; }
  @media (max-width: 900px) { .board { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header class="top">
  <h1>${escapeHtml(projectName)} · 任務看板</h1>
  <div class="sub">共 ${tasks.length} 筆任務 · 唯讀檢視（重新整理即更新）</div>
  <div class="toolbar">
    <input id="q" type="search" placeholder="搜尋 id / 標題 / 標籤 / 負責人…" autocomplete="off" />
    <select id="f-type">
      <option value="">全部類型</option>
      <option value="feature">feature</option>
      <option value="fix">fix</option>
      <option value="refactor">refactor</option>
      <option value="docs">docs</option>
      <option value="test">test</option>
      <option value="chore">chore</option>
    </select>
    <select id="f-prio">
      <option value="">全部優先級</option>
      <option value="high">high</option>
      <option value="med">med</option>
      <option value="low">low</option>
    </select>
  </div>
</header>
<main>
${empty}
<div class="board">
${columns}
</div>
</main>
<script>${FILTER_SCRIPT}</script>
</body>
</html>`;
}
