import { readTask } from "../storage/tasks";
import { listHistoryEvents } from "../storage/history";
import { renderTaskHistoryPage } from "./page";
import { startFetchServer } from "../util/http";

export interface HistoryServer {
  url: string;
  port: number;
  stop: () => void;
}

export interface HistoryServerOpts {
  port?: number;
}

export async function startHistoryServer(root: string, taskId: string, opts: HistoryServerOpts): Promise<HistoryServer> {
  readTask(root, taskId);

  const server = await startFetchServer({
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

  return {
    url: server.url,
    port: server.port,
    stop: server.stop,
  };
}
