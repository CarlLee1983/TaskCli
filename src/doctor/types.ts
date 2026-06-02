export type Severity = "error" | "warn";

export interface Finding {
  code: string;
  severity: Severity;
  target: string;
  message: string;
  fixable: boolean;
}

export interface CheckResult {
  name: string;
  findings: Finding[];
}

export interface DoctorReport {
  ok: boolean;
  errorCount: number;
  warnCount: number;
  checks: CheckResult[];
}

export interface FixOutcome {
  code: string;
  target: string;
  action: string;
  applied: boolean;
}
