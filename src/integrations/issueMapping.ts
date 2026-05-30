import { parseTags, type Task } from "../model/types";
import type { ResolvedConfig } from "../storage/config";
import { nowIso } from "../model/clock";
import type { GithubIssue } from "./github";

/** 由 issue 產生穩定的 source 辨識字串。 */
export function sourceOf(issue: GithubIssue): string {
  return `github:${issue.repo}#${issue.number}`;
}

/**
 * 把 GitHub issue 對映成 Task。
 * - existing 提供時為 upsert：保留 id/created/type/priority 等非映射欄位，只更新映射欄位與 updated。
 * - 未提供時為新建：id 留空字串由呼叫端配發，type/priority 取自 config，created=updated=now。
 */
export function issueToTask(
  issue: GithubIssue,
  cfg: ResolvedConfig,
  now: () => string = nowIso,
  existing?: Task,
): Task {
  const ts = now();
  const mapped = {
    title: issue.title,
    body: issue.body,
    status: issue.state === "closed" ? ("done" as const) : ("todo" as const),
    tags: parseTags(issue.labels),
    assignee: issue.assignees[0],
    source: sourceOf(issue),
  };
  if (existing) {
    return { ...existing, ...mapped, updated: ts };
  }
  return {
    id: "",
    type: cfg.defaultType,
    priority: cfg.defaultPriority,
    created: ts,
    updated: ts,
    ...mapped,
  };
}
