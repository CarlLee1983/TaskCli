import { readDraft, writeDraft, parseDraft } from "../storage/drafts";
import { renderDraftPage } from "./page";
import { startFetchServer } from "../util/http";
import type { Draft } from "../model/types";

export interface ReviewServer {
  url: string;       // 形如 http://127.0.0.1:PORT/
  port: number;
  stop: () => void;
  whenSaved: Promise<void>; // 第一次成功 POST /save 後 resolve，供 CLI 自動關閉
}

export interface ReviewOpts {
  port?: number;     // 0 = 隨機可用 port
}

export async function startReviewServer(root: string, draftId: string, opts: ReviewOpts): Promise<ReviewServer> {
  // 啟動前先確認 draft 存在（不存在會丟錯）
  readDraft(root, draftId);

  // deferred：第一次成功送出時 resolve，讓 CLI 能等待後自動關閉
  let resolveSaved!: () => void;
  const whenSaved = new Promise<void>((resolve) => { resolveSaved = resolve; });

  const server = await startFetchServer({
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
          // 同步呼叫 resolve：其 .then 屬 microtask，會在本 handler 回傳 Response
          // 之後才執行，故回應能正常送出；CLI 收到訊號後再優雅關閉 server。
          resolveSaved();
          return new Response("ok");
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "bad request", { status: 400 });
        }
      }
      return new Response("not found", { status: 404 });
    },
  });

  return {
    url: server.url,
    port: server.port,
    // 優雅關閉：停止接受新連線並關閉 server（剛送出的 /save 回應已寫回）
    stop: server.stop,
    whenSaved,
  };
}
