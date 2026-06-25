// Node 相容的執行期小工具，取代僅在 Bun 下存在的 Bun.* 全域。
// 以 bun build --target node 產出的 dist/cli.js 在 node 執行時，Bun 為 undefined，
// 故所有 stdin / 檔案讀取 / 開啟瀏覽器等動作改用 node 內建 API（Bun 下同樣可用）。
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

/** 讀取 stdin 全文（UTF-8）。 */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** 讀取文字檔（UTF-8）。 */
export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

/** 以系統預設方式開啟 URL（不阻塞、忽略輸出）。 */
export function openUrl(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const child = spawn(cmd, [url], {
    stdio: "ignore",
    detached: true,
    shell: process.platform === "win32",
  });
  child.unref();
}
