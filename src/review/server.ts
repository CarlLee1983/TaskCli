import { readDraft, writeDraft, parseDraft } from "../storage/drafts";
import { renderDraftPage } from "./page";
import type { Draft } from "../model/types";

export interface ReviewServer {
  url: string;       // 形如 http://127.0.0.1:PORT/
  port: number;
  stop: () => void;
}

export interface ReviewOpts {
  port?: number;     // 0 = 隨機可用 port
}

export function startReviewServer(root: string, draftId: string, opts: ReviewOpts): ReviewServer {
  // 啟動前先確認 draft 存在（不存在會丟錯）
  readDraft(root, draftId);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/") {
        const draft = readDraft(root, draftId);
        return new Response(renderDraftPage(draft), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (req.method === "POST" && url.pathname === "/save") {
        try {
          const data = await req.json();
          const validated = parseDraft({ ...data, id: draftId });
          const draft: Draft = { ...validated, id: draftId };
          writeDraft(root, draft);
          return new Response("ok");
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "bad request", { status: 400 });
        }
      }
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port ?? 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    stop: () => server.stop(true),
  };
}
