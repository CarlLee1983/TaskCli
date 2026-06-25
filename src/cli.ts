#!/usr/bin/env node
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { requireRoot } from "./storage/paths";
import { runInit } from "./commands/init";
import { runDraftCreate, runDraftList, runDraftShow } from "./commands/draft";
import { runFinalize } from "./commands/finalize";
import { runAdd, runList, runShow, runUpdate, runDone, runRm, runNext } from "./commands/tasks";
import { startReviewServer } from "./review/server";
import { runSkillInstall } from "./commands/skill";
import { runInstallBin } from "./commands/installBin";
import { runImport } from "./commands/import";
import { runDoctor } from "./commands/doctor";
import { runSlack } from "./commands/slack";
import { runMerge } from "./commands/merge";
import { runHistoryAdd, runHistoryList } from "./commands/history";
import {
  runTranscriptAdd,
  runTranscriptImport,
  runTranscriptList,
  runTranscriptRm,
  runTranscriptShow,
} from "./commands/transcript";
import { startHistoryServer } from "./history/server";
import type { FetchOpts } from "./integrations/github";
import type { TaskType, TaskStatus, Priority } from "./model/types";

const USAGE = `usage: taskcli <command> [options]

  init                                建立 .taskcli 骨架
  draft create [--stdin|--from-json <file>]   建立 draft
  draft list [--json]                 列出 draft
  draft show <id> [--json]            顯示 draft
  review <draft-id> [--port <n>] [--open]      啟動本地審閱頁
  finalize <draft-id>                 draft 生成正式 task
  add <title> [--type --priority --tag --body --body-file --due --assignee --estimate --add-dep --json]
  list [--type --status --priority --tag --query --sort --desc --limit --json]   列出 task
  show <id> [--json]                  顯示 task
  update <id> [--title --type --status --priority --add-tag --rm-tag
              --body --body-file --due YYYY-MM-DD --assignee --estimate --add-dep T-NNN --rm-dep T-NNN]
  done <id>                           標記完成
  next [--limit n --json]             顯示下一個可執行 task
  rm <id>                             刪除 task
  merge <source> --into <target> [--json]      合併重複 task（重接相依後刪除來源）
  history add <task-id> --type <type> [--title --body --body-file --author]   追加 task 歷程
  history list <task-id> [--json]       列出 task 歷程
  history view <task-id> [--port n] [--open]   啟動只讀歷程頁
  transcript import <audio-file> [--provider --title --language]   provider command 轉錄音檔並存入 transcript inbox
  transcript add --from-file <file> [--title --language]           匯入既有文字稿
  transcript list [--json]            列出 transcript
  transcript show <id> [--json]       顯示 transcript
  transcript rm <id>                  刪除 transcript
  import github [<n>] [--repo --state --label --limit --dry-run]   從 GitHub Issues 匯入
  doctor [--fix] [--json]             檢查 .taskcli 工作區健康度
  slack [--config <path>]             啟動 Slack Socket Mode bot（前景常駐）
  install-bin [--dest <dir>]          把 taskcli 複製到 ~/.local/bin
  skill install [--dest <dir>]        把 SKILL.md 安裝到 ~/.claude/skills/taskcli/

Examples:
  taskcli add "修 README" --tag docs
  taskcli list --status todo --query github --sort priority --desc
  taskcli next --limit 3
  taskcli update T-001 --body-file notes.md
  taskcli history add T-001 --type decision --title "採 JSONL" --body "保留 task markdown 相容"
  taskcli history view T-001 --open
  taskcli transcript add --from-file meeting.md --title "產品週會"
  taskcli transcript import meeting.m4a --provider local-whisper --language zh-TW
  taskcli transcript show TR-001 --json
`;

async function readStdin(): Promise<string> {
  return await new Response(Bun.stdin.stream()).text();
}

function fail(msg: string): never {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;
  const cwd = process.cwd();

  if (cmd === "--version" || cmd === "-v") {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  if (!cmd || cmd === "-h" || cmd === "--help") {
    process.stdout.write(USAGE);
    return;
  }

  try {
    switch (cmd) {
      case "init": {
        process.stdout.write(`${runInit(cwd)}\n`);
        return;
      }
      case "draft": {
        const [sub, ...sr] = rest;
        if (sub === "create") {
          const { values } = parseArgs({
            args: sr, options: { stdin: { type: "boolean" }, "from-json": { type: "string" } },
            allowPositionals: true,
          });
          const root = requireRoot(cwd);
          let json: string;
          if (values.stdin) json = await readStdin();
          else if (values["from-json"]) json = await Bun.file(values["from-json"] as string).text();
          else fail("draft create 需要 --stdin 或 --from-json <file>");
          process.stdout.write(`${runDraftCreate(root, { json })}\n`);
          return;
        }
        if (sub === "list") {
          const { values } = parseArgs({ args: sr, options: { json: { type: "boolean" } }, allowPositionals: true });
          process.stdout.write(`${runDraftList(requireRoot(cwd), { json: values.json })}\n`);
          return;
        }
        if (sub === "show") {
          const { values, positionals } = parseArgs({
            args: sr, options: { json: { type: "boolean" } }, allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("draft show 需要 <id>");
          process.stdout.write(`${runDraftShow(requireRoot(cwd), id, { json: values.json })}\n`);
          return;
        }
        fail(`未知 draft 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
      case "review": {
        const { values, positionals } = parseArgs({
          args: rest, options: { port: { type: "string" }, open: { type: "boolean" } },
          allowPositionals: true,
        });
        const id = positionals[0];
        if (!id) fail("review 需要 <draft-id>");
        const root = requireRoot(cwd);
        const srv = startReviewServer(root, id, { port: values.port ? Number(values.port) : undefined });
        process.stdout.write(`審閱頁已啟動：${srv.url}\n送出後會自動關閉（或按 Ctrl+C 結束）。\n`);
        if (values.open) Bun.spawn(["open", srv.url]);
        // 等待使用者在審閱頁按「送出」，成功回寫後優雅關閉 server 並退出
        await srv.whenSaved;
        srv.stop();
        process.stdout.write(`✅ 已收到送出，可執行：taskcli finalize ${id}\n`);
        return;
      }
      case "finalize": {
        const { positionals } = parseArgs({ args: rest, options: {}, allowPositionals: true });
        const id = positionals[0];
        if (!id) fail("finalize 需要 <draft-id>");
        process.stdout.write(`${runFinalize(requireRoot(cwd), id, {})}\n`);
        return;
      }

      case "add": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            type: { type: "string" }, priority: { type: "string" }, tag: { type: "string" },
            body: { type: "string" }, "body-file": { type: "string" },
            due: { type: "string" }, assignee: { type: "string" }, estimate: { type: "string" },
            "add-dep": { type: "string" }, json: { type: "boolean" },
          },
          allowPositionals: true,
        });
        const title = positionals[0];
        if (!title) fail("add 需要 <title>");
        if (values.body !== undefined && values["body-file"] !== undefined) fail("--body 與 --body-file 不可同時使用");
        const body = values["body-file"] ? await Bun.file(values["body-file"] as string).text() : values.body;
        process.stdout.write(`${runAdd(requireRoot(cwd), title, {
          type: values.type, priority: values.priority, tags: values.tag,
          body, due: values.due, assignee: values.assignee, estimate: values.estimate,
          addDep: values["add-dep"], json: values.json,
        })}\n`);
        return;
      }
      case "list": {
        const { values } = parseArgs({
          args: rest,
          options: {
            type: { type: "string" }, status: { type: "string" },
            priority: { type: "string" }, tag: { type: "string" }, query: { type: "string" },
            sort: { type: "string" }, desc: { type: "boolean" }, limit: { type: "string" }, json: { type: "boolean" },
          },
          allowPositionals: true,
        });
        process.stdout.write(`${runList(requireRoot(cwd), {
          type: values.type as TaskType | undefined,
          status: values.status as TaskStatus | undefined,
          priority: values.priority as Priority | undefined,
          tag: values.tag, query: values.query,
          sort: values.sort as "id" | "updated" | "priority" | "status" | "title" | undefined,
          desc: values.desc, limit: values.limit ? Number(values.limit) : undefined, json: values.json,
        })}\n`);
        return;
      }
      case "show": {
        const { values, positionals } = parseArgs({
          args: rest, options: { json: { type: "boolean" } }, allowPositionals: true,
        });
        const id = positionals[0];
        if (!id) fail("show 需要 <id>");
        process.stdout.write(`${runShow(requireRoot(cwd), id, { json: values.json })}\n`);
        return;
      }
      case "update": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: {
            title: { type: "string" }, type: { type: "string" }, status: { type: "string" },
            priority: { type: "string" }, "add-tag": { type: "string" }, "rm-tag": { type: "string" },
            body: { type: "string" }, "body-file": { type: "string" },
            due: { type: "string" }, assignee: { type: "string" }, estimate: { type: "string" },
            "add-dep": { type: "string" }, "rm-dep": { type: "string" },
          },
          allowPositionals: true,
        });
        const id = positionals[0];
        if (!id) fail("update 需要 <id>");
        if (values.body !== undefined && values["body-file"] !== undefined) fail("--body 與 --body-file 不可同時使用");
        const body = values["body-file"] ? await Bun.file(values["body-file"] as string).text() : values.body;
        process.stdout.write(`${runUpdate(requireRoot(cwd), id, {
          title: values.title, type: values.type, status: values.status,
          priority: values.priority, addTag: values["add-tag"], rmTag: values["rm-tag"],
          body, due: values.due, assignee: values.assignee, estimate: values.estimate,
          addDep: values["add-dep"], rmDep: values["rm-dep"],
        })}\n`);
        return;
      }
      case "done": {
        const { positionals } = parseArgs({ args: rest, options: {}, allowPositionals: true });
        const id = positionals[0];
        if (!id) fail("done 需要 <id>");
        process.stdout.write(`${runDone(requireRoot(cwd), id, {})}\n`);
        return;
      }

      case "next": {
        const { values } = parseArgs({
          args: rest,
          options: { limit: { type: "string" }, json: { type: "boolean" } },
          allowPositionals: true,
        });
        process.stdout.write(`${runNext(requireRoot(cwd), {
          limit: values.limit ? Number(values.limit) : undefined,
          json: values.json,
        })}\n`);
        return;
      }
      case "rm": {
        const { positionals } = parseArgs({ args: rest, options: {}, allowPositionals: true });
        const id = positionals[0];
        if (!id) fail("rm 需要 <id>");
        process.stdout.write(`${runRm(requireRoot(cwd), id)}\n`);
        return;
      }
      case "merge": {
        const { values, positionals } = parseArgs({
          args: rest,
          options: { into: { type: "string" }, json: { type: "boolean" } },
          allowPositionals: true,
        });
        const source = positionals[0];
        if (!source) fail("merge 需要 <source-id>");
        if (!values.into) fail("merge 需要 --into <target-id>");
        process.stdout.write(`${runMerge(requireRoot(cwd), {
          source,
          target: values.into,
          json: values.json,
        })}\n`);
        return;
      }
      case "history": {
        const [sub, ...sr] = rest;
        if (sub === "add") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: {
              type: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              "body-file": { type: "string" },
              author: { type: "string" },
            },
            allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("history add 需要 <task-id>");
          if (values.body !== undefined && values["body-file"] !== undefined) fail("--body 與 --body-file 不可同時使用");
          process.stdout.write(`${runHistoryAdd(requireRoot(cwd), id, {
            type: values.type,
            title: values.title,
            body: values.body,
            bodyFile: values["body-file"],
            author: values.author,
          })}\n`);
          return;
        }
        if (sub === "list") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: { json: { type: "boolean" } },
            allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("history list 需要 <task-id>");
          process.stdout.write(`${runHistoryList(requireRoot(cwd), id, { json: values.json })}\n`);
          return;
        }
        if (sub === "view") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: { port: { type: "string" }, open: { type: "boolean" } },
            allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("history view 需要 <task-id>");
          const srv = startHistoryServer(requireRoot(cwd), id, {
            port: values.port ? Number(values.port) : undefined,
          });
          process.stdout.write(`歷程頁已啟動：${srv.url}\n按 Ctrl+C 結束。\n`);
          if (values.open) Bun.spawn(["open", srv.url]);
          await new Promise<void>(() => {});
          return;
        }
        fail(`未知 history 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
      case "transcript": {
        const [sub, ...sr] = rest;
        if (sub === "add") {
          const { values } = parseArgs({
            args: sr,
            options: {
              "from-file": { type: "string" },
              title: { type: "string" },
              language: { type: "string" },
            },
            allowPositionals: true,
          });
          process.stdout.write(`${runTranscriptAdd(requireRoot(cwd), {
            fromFile: values["from-file"],
            title: values.title,
            language: values.language,
          })}\n`);
          return;
        }
        if (sub === "import") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: {
              provider: { type: "string" },
              title: { type: "string" },
              language: { type: "string" },
            },
            allowPositionals: true,
          });
          const audioFile = positionals[0];
          if (!audioFile) fail("transcript import 需要 <audio-file>");
          process.stdout.write(`${await runTranscriptImport(requireRoot(cwd), audioFile, {
            provider: values.provider,
            title: values.title,
            language: values.language,
          })}\n`);
          return;
        }
        if (sub === "list") {
          const { values } = parseArgs({
            args: sr,
            options: { json: { type: "boolean" } },
            allowPositionals: true,
          });
          process.stdout.write(`${runTranscriptList(requireRoot(cwd), { json: values.json })}\n`);
          return;
        }
        if (sub === "show") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: { json: { type: "boolean" } },
            allowPositionals: true,
          });
          const id = positionals[0];
          if (!id) fail("transcript show 需要 <id>");
          process.stdout.write(`${runTranscriptShow(requireRoot(cwd), id, { json: values.json })}\n`);
          return;
        }
        if (sub === "rm") {
          const { positionals } = parseArgs({ args: sr, options: {}, allowPositionals: true });
          const id = positionals[0];
          if (!id) fail("transcript rm 需要 <id>");
          process.stdout.write(`${runTranscriptRm(requireRoot(cwd), id)}\n`);
          return;
        }
        fail(`未知 transcript 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
      case "import": {
        const [sub, ...sr] = rest;
        if (sub === "github") {
          const { values, positionals } = parseArgs({
            args: sr,
            options: {
              repo: { type: "string" }, state: { type: "string" },
              label: { type: "string" }, limit: { type: "string" },
              "dry-run": { type: "boolean" },
            },
            allowPositionals: true,
          });
          const number = positionals[0] ? Number(positionals[0]) : undefined;
          const state = values.state as FetchOpts["state"] | undefined;
          const msg = runImport(requireRoot(cwd), {
            number,
            dryRun: values["dry-run"],
            repo: values.repo,
            state,
            label: values.label,
            limit: values.limit ? Number(values.limit) : undefined,
          });
          process.stdout.write(`${msg}\n`);
          return;
        }
        fail(`未知 import 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
      case "doctor": {
        const { values } = parseArgs({
          args: rest,
          options: { fix: { type: "boolean" }, json: { type: "boolean" } },
          allowPositionals: true,
        });
        const { output, exitCode } = runDoctor(requireRoot(cwd), {
          fix: values.fix,
          json: values.json,
        });
        process.stdout.write(`${output}\n`);
        // doctor 已將完整報告寫到 stdout；以原始 exitCode 直接退出傳遞診斷結果，
        // 不走 fail()（避免在已輸出報告後又往 stderr 多印一段訊息）
        if (exitCode !== 0) process.exit(exitCode);
        return;
      }
      case "slack": {
        const { values } = parseArgs({
          args: rest,
          options: { config: { type: "string" } },
          allowPositionals: true,
        });
        await runSlack({ configPath: values.config });
        return;
      }
      case "install-bin": {
        const { values } = parseArgs({ args: rest, options: { dest: { type: "string" } }, allowPositionals: true });
        process.stdout.write(`${runInstallBin({ dest: values.dest }, process.execPath, Bun.main)}\n`);
        return;
      }
      case "skill": {
        const [sub, ...sr] = rest;
        if (sub === "install") {
          const { values } = parseArgs({
            args: sr, options: { dest: { type: "string" }, force: { type: "boolean" } },
            allowPositionals: true,
          });
          process.stdout.write(`${runSkillInstall({ dest: values.dest, force: values.force })}\n`);
          return;
        }
        fail(`未知 skill 子指令：${sub ?? ""}\n${USAGE}`);
        return;
      }
      default:
        fail(`未知指令：${cmd}\n${USAGE}`);
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

await main();
