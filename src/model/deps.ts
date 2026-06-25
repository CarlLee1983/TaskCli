// 相依圖循環偵測：DFS 白/灰/黑著色。只走指向存在節點的邊。
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

// 找出圖中所有相異的環，每個環以「字典序最小節點為起點」正規化後回傳（不含重複的收尾節點）。
// 同一個環無論從哪個節點進入都只回報一次；以排序後的節點為 DFS 起點，使結果具決定性。
export function findCycles(graph: Map<string, string[]>): string[][] {
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);
  const stack: string[] = [];
  const reported = new Set<string>();
  const cycles: string[][] = [];

  function dfs(id: string): void {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of graph.get(id) ?? []) {
      if (!color.has(dep)) continue; // 忽略指向不存在節點的邊
      if (color.get(dep) === GRAY) {
        // 取出環路節點（stack 從 dep 到目前），dep 為環的接點
        const path = stack.slice(stack.indexOf(dep));
        // 正規化：以字典序最小節點為起點旋轉，使同一環無論從哪個節點進入都得到相同 key
        const minNode = [...path].sort()[0]!;
        const minIdx = path.indexOf(minNode);
        const ordered = [...path.slice(minIdx), ...path.slice(0, minIdx)];
        const key = ordered.join(",");
        if (!reported.has(key)) {
          reported.add(key);
          cycles.push(ordered);
        }
      } else if (color.get(dep) === WHITE) {
        dfs(dep);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const id of [...graph.keys()].sort()) {
    if (color.get(id) === WHITE) dfs(id);
  }
  return cycles;
}

export function hasCycle(graph: Map<string, string[]>): boolean {
  return findCycles(graph).length > 0;
}
