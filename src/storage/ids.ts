export function nextId(prefix: "T" | "D", existingIds: string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existingIds) {
    const m = id.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
