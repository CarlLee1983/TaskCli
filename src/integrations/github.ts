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

function runGh(args: string[]): string {
  let proc;
  try {
    proc = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  } catch {
    throw new Error("找不到 gh CLI，請先安裝 GitHub CLI 並執行 `gh auth login`");
  }
  if (proc.exitCode !== 0) {
    const err = proc.stderr.toString().trim();
    throw new Error(`gh 執行失敗：${err || `exit ${proc.exitCode}`}（請確認已 gh auth login 且 repo 正確）`);
  }
  return proc.stdout.toString();
}

/** repo 未指定時用 gh 從 cwd 推導 owner/repo。 */
export function resolveRepo(opts: FetchOpts): string {
  if (opts.repo) return opts.repo;
  const out = runGh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
  if (!out) throw new Error("無法推導 repo，請用 --repo owner/repo 指定");
  return out;
}

/** 批次抓取 issue。 */
export function fetchIssues(opts: FetchOpts): GithubIssue[] {
  const repo = resolveRepo(opts);
  const raw = runGh(buildGhArgs({ ...opts, repo }));
  return parseIssuesJson(raw, repo);
}

/** 抓取單一 issue。 */
export function fetchIssue(number: number, opts: FetchOpts): GithubIssue[] {
  const repo = resolveRepo(opts);
  const raw = runGh(buildGhArgs({ ...opts, repo }, number));
  return parseIssuesJson(raw, repo);
}
