import { readTask } from "../storage/tasks";
import { listHistoryEvents } from "../storage/history";
import { renderTaskHistoryPage } from "./page";

export interface HistoryServer {
  url: string;
  port: number;
  stop: () => void;
}

export interface HistoryServerOpts {
  port?: number;
}

export function startHistoryServer(root: string, taskId: string, opts: HistoryServerOpts): HistoryServer {
  readTask(root, taskId);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port ?? 0,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/") {
        const task = readTask(root, taskId);
        const events = listHistoryEvents(root, taskId);
        return new Response(renderTaskHistoryPage(task, events), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port ?? 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    stop: () => server.stop(),
  };
}
