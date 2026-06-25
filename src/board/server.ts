import { basename } from "node:path";
import { listTasks } from "../storage/tasks";
import { renderBoardPage } from "./page";
import { startFetchServer } from "../util/http";

export interface BoardServer {
  url: string;
  port: number;
  stop: () => void;
}

export interface BoardServerOpts {
  port?: number;
}

export async function startBoardServer(root: string, opts: BoardServerOpts): Promise<BoardServer> {
  const projectName = basename(root) || "taskcli";

  const server = await startFetchServer({
    hostname: "127.0.0.1",
    port: opts.port ?? 0,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/") {
        // 每次請求重讀，瀏覽器重新整理即可看到最新任務狀態
        const tasks = listTasks(root);
        return new Response(renderBoardPage(tasks, projectName), {
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
