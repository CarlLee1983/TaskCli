import { expect, test } from "bun:test";
import { issueToTask, sourceOf } from "../../src/integrations/issueMapping";
import type { GithubIssue } from "../../src/integrations/github";
import type { ResolvedConfig } from "../../src/storage/config";
import type { Task } from "../../src/model/types";

const CFG: ResolvedConfig = { defaultType: "feature", defaultPriority: "med" };
const NOW = "2026-05-30T12:00:00+08:00";

function issue(over: Partial<GithubIssue> = {}): GithubIssue {
  return {
    number: 42, title: "修 bug", body: "說明", state: "open",
    labels: ["bug", "bug"], assignees: ["carl", "dev2"], repo: "owner/repo",
    ...over,
  };
}

test("sourceOf 產生 github:owner/repo#number", () => {
  expect(sourceOf(issue())).toBe("github:owner/repo#42");
});

test("issueToTask（新建）標準對映，type/priority 取自 config，created=updated=now", () => {
  const t = issueToTask(issue(), CFG, () => NOW);
  expect(t.title).toBe("修 bug");
  expect(t.body).toBe("說明");
  expect(t.status).toBe("todo");              // open -> todo
  expect(t.tags).toEqual(["bug"]);            // 去重
  expect(t.assignee).toBe("carl");            // 取首位
  expect(t.source).toBe("github:owner/repo#42");
  expect(t.type).toBe("feature");
  expect(t.priority).toBe("med");
  expect(t.created).toBe(NOW);
  expect(t.updated).toBe(NOW);
  expect(t.id).toBe("");                       // 新建時 id 由呼叫端配發
});

test("issueToTask closed -> done，空 assignees 不設 assignee", () => {
  const t = issueToTask(issue({ state: "closed", assignees: [] }), CFG, () => NOW);
  expect(t.status).toBe("done");
  expect(t.assignee).toBeUndefined();
});

test("issueToTask（upsert）保留既有 id/created/type/priority/due/depends_on，更新映射欄位與 updated", () => {
  const existing: Task = {
    id: "T-007", title: "舊標題", type: "fix", status: "done", priority: "high",
    tags: ["old"], created: "2026-01-01T00:00:00+08:00", updated: "2026-01-01T00:00:00+08:00",
    body: "舊內文", due: "2026-12-31", depends_on: ["T-001"], source: "github:owner/repo#42",
  };
  const t = issueToTask(issue({ title: "新標題", state: "open" }), CFG, () => NOW, existing);
  expect(t.id).toBe("T-007");                  // 保留
  expect(t.created).toBe("2026-01-01T00:00:00+08:00"); // 保留
  expect(t.type).toBe("fix");                  // 保留（不被 config 覆寫）
  expect(t.priority).toBe("high");             // 保留
  expect(t.due).toBe("2026-12-31");            // 保留
  expect(t.depends_on).toEqual(["T-001"]);     // 保留
  expect(t.title).toBe("新標題");              // 更新
  expect(t.status).toBe("todo");               // 更新（open）
  expect(t.updated).toBe(NOW);                 // 更新
});
