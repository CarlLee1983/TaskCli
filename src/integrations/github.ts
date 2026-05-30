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
