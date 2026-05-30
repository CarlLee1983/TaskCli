import { listTasks, listTaskIds, writeTask } from "../storage/tasks";
import { nextId } from "../storage/ids";
import { loadConfig } from "../storage/config";
import { nowIso } from "../model/clock";
import { issueToTask, sourceOf } from "../integrations/issueMapping";
import { fetchIssues as realFetchIssues, fetchIssue as realFetchIssue } from "../integrations/github";
import type { FetchOpts, GithubIssue } from "../integrations/github";

export interface ImportOpts extends FetchOpts {
  number?: number;  // 指定單一 issue
  dryRun?: boolean;
}

export interface ImportDeps {
  fetchIssues?: (opts: FetchOpts, number?: number) => GithubIssue[];
  now?: () => string;
}

/** 預設 fetch adapter：有 number 走 fetchIssue，否則 fetchIssues。 */
function defaultFetch(opts: FetchOpts, number?: number): GithubIssue[] {
  return number !== undefined ? realFetchIssue(number, opts) : realFetchIssues(opts);
}

export function runImport(root: string, opts: ImportOpts, deps: ImportDeps = {}): string {
  const fetch = deps.fetchIssues ?? defaultFetch;
  const now = deps.now ?? nowIso;
  const cfg = loadConfig(root);

  const { number, dryRun, ...fetchOpts } = opts;
  const issues = fetch(fetchOpts, number);

  const existing = listTasks(root);
  const bySource = new Map(existing.filter((t) => t.source).map((t) => [t.source!, t]));
  const allocated = listTaskIds(root);

  let created = 0;
  let updated = 0;
  const touched: string[] = [];

  for (const issue of issues) {
    const match = bySource.get(sourceOf(issue));
    if (match) {
      const task = issueToTask(issue, cfg, now, match);
      if (!dryRun) writeTask(root, task);
      updated++;
      touched.push(task.id);
    } else {
      const draft = issueToTask(issue, cfg, now);
      const id = nextId("T", allocated);
      allocated.push(id);
      const task = { ...draft, id };
      if (!dryRun) writeTask(root, task);
      created++;
      touched.push(id);
    }
  }

  const prefix = dryRun ? "[dry-run] " : "";
  const tail = touched.length ? `：${touched.join(", ")}` : "";
  return `${prefix}匯入完成：新建 ${created} 個、更新 ${updated} 個${tail}`;
}
