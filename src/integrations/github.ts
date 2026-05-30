export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  repo: string; // "owner/repo"
}

export interface FetchOpts {
  repo?: string;
  state?: "open" | "closed" | "all";
  label?: string;
  limit?: number;
}

const JSON_FIELDS = "number,title,body,state,labels,assignees";

/** 依 opts 組出 gh 參數陣列。帶 number 用 `issue view`，否則 `issue list`。 */
export function buildGhArgs(opts: FetchOpts, number?: number): string[] {
  const repo = opts.repo ?? "";
  if (number !== undefined) {
    return ["issue", "view", String(number), "--repo", repo, "--json", JSON_FIELDS];
  }
  const args = ["issue", "list", "--repo", repo, "--state", opts.state ?? "open"];
  if (opts.label) args.push("--label", opts.label);
  if (opts.limit !== undefined) args.push("--limit", String(opts.limit));
  args.push("--json", JSON_FIELDS);
  return args;
}

interface RawIssue {
  number: number;
  title: string;
  body?: string;
  state: string;
  labels?: Array<{ name: string }>;
  assignees?: Array<{ login: string }>;
}

/** 解析 gh --json 輸出（陣列或單一物件）為正規化 GithubIssue[]。 */
export function parseIssuesJson(raw: string, repo: string): GithubIssue[] {
  const parsed = JSON.parse(raw) as RawIssue | RawIssue[];
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((r) => ({
    number: r.number,
    title: r.title,
    body: r.body ?? "",
    state: r.state.toLowerCase() === "closed" ? "closed" : "open",
    labels: (r.labels ?? []).map((l) => l.name),
    assignees: (r.assignees ?? []).map((a) => a.login),
    repo,
  }));
}
