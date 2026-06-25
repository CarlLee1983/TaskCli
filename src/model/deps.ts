// 相依圖循環偵測：DFS 白/灰/黑著色。只走指向存在節點的邊。
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function hasCycle(graph: Map<string, string[]>): boolean {
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);
  let found = false;

  function dfs(id: string): void {
    color.set(id, GRAY);
    for (const dep of graph.get(id) ?? []) {
      if (!color.has(dep)) continue; // 忽略指向不存在節點的邊
      const c = color.get(dep);
      if (c === GRAY) {
        found = true;
        return;
      }
      if (c === WHITE) {
        dfs(dep);
        if (found) return;
      }
    }
    color.set(id, BLACK);
  }

  for (const id of graph.keys()) {
    if (color.get(id) === WHITE) dfs(id);
    if (found) return true;
  }
  return false;
}
