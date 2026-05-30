import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init";
import { listTasks } from "../../src/storage/tasks";
import { runImport } from "../../src/commands/import";
import type { GithubIssue, FetchOpts } from "../../src/integrations/github";

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tcli-import-"));
  runInit(root);
  return root;
}

function fakeFetch(issues: GithubIssue[]): (opts: FetchOpts, number?: number) => GithubIssue[] {
  return () => issues;
}

const ISSUE: GithubIssue = {
  number: 42, title: "從 issue 來", body: "內容", state: "open",
  labels: ["bug"], assignees: ["carl"], repo: "owner/repo",
};
const NOW = () => "2026-05-30T12:00:00+08:00";

test("runImport 新建：第一次匯入產生新 task 並寫入 source", () => {
  const root = freshRoot();
  const msg = runImport(root, {}, { fetchIssues: fakeFetch([ISSUE]), now: NOW });
  const tasks = listTasks(root);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]!.source).toBe("github:owner/repo#42");
  expect(tasks[0]!.title).toBe("從 issue 來");
  expect(msg).toContain("新建 1");
});

test("runImport 冪等：相同 issue 重跑為更新、不新增 id", () => {
  const root = freshRoot();
  runImport(root, {}, { fetchIssues: fakeFetch([ISSUE]), now: NOW });
  const firstId = listTasks(root)[0]!.id;
  const updated = { ...ISSUE, title: "標題改了", state: "closed" as const };
  const msg = runImport(root, {}, { fetchIssues: fakeFetch([updated]), now: NOW });
  const tasks = listTasks(root);
  expect(tasks).toHaveLength(1);              // 沒有重複
  expect(tasks[0]!.id).toBe(firstId);         // id 保留
  expect(tasks[0]!.title).toBe("標題改了");   // 已更新
  expect(tasks[0]!.status).toBe("done");      // closed -> done
  expect(msg).toContain("更新 1");
});

test("runImport --dry-run 不寫檔但回報摘要", () => {
  const root = freshRoot();
  const msg = runImport(root, { dryRun: true }, { fetchIssues: fakeFetch([ISSUE]), now: NOW });
  expect(listTasks(root)).toHaveLength(0);    // 沒寫檔
  expect(msg).toContain("dry-run");
  expect(msg).toContain("新建 1");
});

test("runImport 帶 number 時把 number 傳給 fetch", () => {
  const root = freshRoot();
  let calledNumber: number | undefined = -1;
  const fetch = (_opts: FetchOpts, number?: number): GithubIssue[] => {
    calledNumber = number;
    return [ISSUE];
  };
  runImport(root, { number: 42 }, { fetchIssues: fetch, now: NOW });
  expect(calledNumber).toBe(42);
  expect(listTasks(root)).toHaveLength(1);
});
