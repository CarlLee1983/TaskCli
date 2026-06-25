// 以 node:http 實作的 fetch 風格本地伺服器，取代 Bun.serve。
// 沿用 Web 標準 Request/Response（node 18+ 內建全域），讓既有 handler 幾乎不用改寫。
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface FetchServer {
  url: string; // 形如 http://127.0.0.1:PORT/
  port: number;
  stop: () => void;
}

export type FetchHandler = (req: Request) => Response | Promise<Response>;

export interface FetchServerOpts {
  hostname?: string;
  port?: number; // 0 或省略 = 隨機可用 port
  fetch: FetchHandler;
}

/** 啟動本地 HTTP server，listening 後 resolve（才能取得隨機 port）。 */
export function startFetchServer(opts: FetchServerOpts): Promise<FetchServer> {
  const hostname = opts.hostname ?? "127.0.0.1";

  const server = createServer((nreq, nres) => {
    const chunks: Buffer[] = [];
    nreq.on("data", (c) => chunks.push(c as Buffer));
    nreq.on("end", async () => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(nreq.headers)) {
        if (typeof v === "string") headers[k] = v;
        else if (Array.isArray(v)) headers[k] = v.join(", ");
      }
      const method = nreq.method ?? "GET";
      const hasBody = method !== "GET" && method !== "HEAD" && chunks.length > 0;
      const request = new Request(`http://${headers.host ?? hostname}${nreq.url ?? "/"}`, {
        method,
        headers,
        body: hasBody ? Buffer.concat(chunks) : undefined,
      });
      try {
        const response = await opts.fetch(request);
        nres.statusCode = response.status;
        response.headers.forEach((value, key) => nres.setHeader(key, value));
        nres.end(Buffer.from(await response.arrayBuffer()));
      } catch (e) {
        nres.statusCode = 500;
        nres.end(e instanceof Error ? e.message : "internal error");
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, hostname, () => {
      const addr = server.address() as AddressInfo;
      const port = addr?.port ?? 0;
      resolve({
        url: `http://${hostname}:${port}/`,
        port,
        stop: () => server.close(),
      });
    });
  });
}
