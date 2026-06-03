/**
 * 把動作結果字串包成 Slack 訊息。
 * Phase 1：用三引號 code block 取得等寬排版（task 列表對齊好讀）。
 * Phase 2 會在此改吐 Block Kit；呼叫端契約不變。
 */
export function formatResult(text: string): string {
  return "```\n" + text + "\n```";
}
