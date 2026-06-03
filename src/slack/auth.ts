/** 檢查 Slack user ID 是否在允許清單內。 */
export function isAllowed(userId: string, allowedUserIds: string[]): boolean {
  return allowedUserIds.includes(userId);
}
