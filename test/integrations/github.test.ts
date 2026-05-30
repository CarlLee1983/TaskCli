import { expect, test } from "bun:test";
import { buildGhArgs, parseIssuesJson } from "../../src/integrations/github";

test("buildGhArgs：批次預設 state=open，含 --json 欄位", () => {
  const args = buildGhArgs({ repo: "owner/repo" });
  expect(args.slice(0, 3)).toEqual(["issue", "list", "--repo"]);
  expect(args).toContain("owner/repo");
  expect(args[args.indexOf("--state") + 1]).toBe("open");
  expect(args[args.indexOf("--json") + 1]).toBe("number,title,body,state,labels,assignees");
});

test("buildGhArgs：帶 label/limit/state", () => {
  const args = buildGhArgs({ repo: "o/r", state: "all", label: "bug", limit: 5 });
  expect(args[args.indexOf("--state") + 1]).toBe("all");
  expect(args[args.indexOf("--label") + 1]).toBe("bug");
  expect(args[args.indexOf("--limit") + 1]).toBe("5");
});

test("buildGhArgs：帶 number 時用 issue view，不含 state/label/limit", () => {
  const args = buildGhArgs({ repo: "o/r" }, 42);
  expect(args.slice(0, 2)).toEqual(["issue", "view"]);
  expect(args).toContain("42");
  expect(args).not.toContain("--state");
  expect(args).not.toContain("--limit");
});

test("parseIssuesJson：攤平 labels/assignees，state 轉小寫，回填 repo", () => {
  const raw = JSON.stringify([
    {
      number: 42, title: "t", body: "b", state: "OPEN",
      labels: [{ name: "bug" }, { name: "p1" }],
      assignees: [{ login: "carl" }],
    },
  ]);
  const issues = parseIssuesJson(raw, "owner/repo");
  expect(issues).toHaveLength(1);
  expect(issues[0]).toEqual({
    number: 42, title: "t", body: "b", state: "open",
    labels: ["bug", "p1"], assignees: ["carl"], repo: "owner/repo",
  });
});

test("parseIssuesJson：單一物件（issue view 回傳）也能解析，body 缺值補空字串", () => {
  const raw = JSON.stringify({ number: 7, title: "t", state: "CLOSED", labels: [], assignees: [] });
  const issues = parseIssuesJson(raw, "o/r");
  expect(issues[0]!.state).toBe("closed");
  expect(issues[0]!.body).toBe("");
});
