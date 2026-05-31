import type { Task, TaskHistoryEvent } from "../model/types";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function optionalRow(label: string, value: string | string[] | undefined): string {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join(", ") : value;
  if (!text) return "";
  return `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(text)}</b></div>`;
}

function renderEventBody(event: TaskHistoryEvent): string {
  if (event.type === "status_change" && event.meta?.from && event.meta?.to) {
    return `<div class="status-change">${escapeHtml(event.meta.from)} → ${escapeHtml(event.meta.to)}</div>`;
  }
  if (!event.body) return "";
  return `<pre>${escapeHtml(event.body)}</pre>`;
}

function renderEvent(event: TaskHistoryEvent): string {
  const author = event.author ? `<span class="author">@${escapeHtml(event.author)}</span>` : "";
  const title = event.title ? `<h3>${escapeHtml(event.title)}</h3>` : "";
  return `<article class="event ${escapeHtml(event.type)}">
    <div class="event-meta">
      <span class="badge">${escapeHtml(event.type)}</span>
      <time>${escapeHtml(event.created)}</time>
      ${author}
    </div>
    ${title}
    ${renderEventBody(event)}
  </article>`;
}

export function renderTaskHistoryPage(task: Task, events: TaskHistoryEvent[]): string {
  const tags = task.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join(" ");
  const timeline = events.length
    ? events.map(renderEvent).join("\n")
    : `<div class="empty">
        <h2>尚無歷程</h2>
        <p>可用 CLI 追加第一筆 note：</p>
        <code>taskcli history add ${escapeHtml(task.id)} --type note --body "..."</code>
      </div>`;

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(task.id)} history</title>
<style>
  :root { --bg:#f8fafc; --card:#fff; --border:#e2e8f0; --text:#0f172a; --muted:#64748b; --primary:#2563eb; --ok:#047857; --warn:#b45309; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:system-ui,-apple-system,"Noto Sans TC","PingFang TC",sans-serif; background:var(--bg); color:var(--text); line-height:1.55; }
  main { max-width: 980px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  header, .panel, .event, .empty { background:var(--card); border:1px solid var(--border); border-radius:14px; box-shadow:0 1px 3px rgba(15,23,42,.05); }
  header { padding:1.25rem 1.4rem; margin-bottom:1rem; }
  h1 { margin:0 0 .4rem; font-size:1.6rem; letter-spacing:-.02em; }
  h2 { margin:0 0 .75rem; font-size:1.1rem; }
  h3 { margin:.55rem 0 .4rem; font-size:1rem; }
  .subtitle { color:var(--muted); }
  .tags { margin-top:.6rem; }
  .tag, .badge { display:inline-block; border-radius:999px; padding:.16rem .55rem; font-size:.8rem; font-weight:650; }
  .tag { background:#eff6ff; color:#1d4ed8; margin-right:.25rem; }
  .badge { background:#e2e8f0; color:#334155; }
  .status_change .badge { background:#fef3c7; color:var(--warn); }
  .verification .badge { background:#dcfce7; color:var(--ok); }
  .grid { display:grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap:1rem; align-items:start; }
  .panel { padding:1rem 1.2rem; }
  .facts { display:grid; gap:.6rem; }
  .facts div { display:flex; justify-content:space-between; gap:1rem; border-bottom:1px solid #f1f5f9; padding-bottom:.45rem; }
  .facts span, time, .author { color:var(--muted); font-size:.86rem; }
  pre { white-space:pre-wrap; margin:.6rem 0 0; padding:.85rem; border-radius:10px; background:#f8fafc; border:1px solid var(--border); font:inherit; }
  .task-body { margin-top:1rem; }
  .timeline { display:grid; gap:.75rem; }
  .event { padding:1rem 1.15rem; border-left:4px solid var(--primary); }
  .event-meta { display:flex; flex-wrap:wrap; align-items:center; gap:.55rem; }
  .status-change { margin-top:.55rem; font-weight:700; color:var(--warn); }
  .empty { padding:1.5rem; color:var(--muted); }
  code { display:block; color:#0f172a; background:#f1f5f9; border:1px solid var(--border); border-radius:9px; padding:.75rem; overflow:auto; }
  @media (max-width: 760px) { .grid { grid-template-columns:1fr; } }
</style>
</head>
<body>
<main>
<header>
  <h1>${escapeHtml(task.id)} ${escapeHtml(task.title)}</h1>
  <div class="subtitle">${escapeHtml(task.status)} · ${escapeHtml(task.type)} / ${escapeHtml(task.priority)}${task.source ? ` · source: ${escapeHtml(task.source)}` : ""}</div>
  ${tags ? `<div class="tags">${tags}</div>` : ""}
</header>
<div class="grid">
  <section class="panel">
    <h2>Task Summary</h2>
    <div class="facts">
      ${optionalRow("created", task.created)}
      ${optionalRow("updated", task.updated)}
      ${optionalRow("due", task.due)}
      ${optionalRow("assignee", task.assignee)}
      ${optionalRow("estimate", task.estimate)}
      ${optionalRow("depends_on", task.depends_on)}
    </div>
    ${task.body ? `<div class="task-body"><h2>Body</h2><pre>${escapeHtml(task.body)}</pre></div>` : ""}
  </section>
  <section class="timeline">
    ${timeline}
  </section>
</div>
</main>
</body>
</html>`;
}
