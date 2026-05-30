#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { requireRoot } from "./storage/paths";
import { runInit } from "./commands/init";
import { runDraftCreate, runDraftList, runDraftShow } from "./commands/draft";
import { runFinalize } from "./commands/finalize";
import { runList, runShow, runUpdate, runDone, runRm } from "./commands/tasks";
import { startReviewServer } from "./review/server";
import { runSkillInstall } from "./commands/skill";
import { runInstallBin } from "./commands/installBin";
import type { TaskType, TaskStatus, Priority } from "./model/types";

const USAGE = `usage: taskcli <command> [options]

  init                                建立 .taskcli 骨架
  draft create [--stdin|--from-json <file>]   建立 draft
  draft list [--json]                 列出 draft
  draft show <id> [--json]            顯示 draft
  review <draft-id> [--port <n>] [--open]      啟動本地審閱頁
  finalize <draft-id>                 draft 生成正式 task
  list [--type --status --priority --tag --json]   列出 task
  show <id> [--json]                  顯示 task
  update <id> [--title --type --status --priority --add-tag --rm-tag
              --due YYYY-MM-DD --assignee --estimate --add-dep T-NNN --rm-dep T-NNN]
  done <id>                           標記完成
  rm <id>                             刪除 task
  install-bin [--dest <dir>]          把 taskcli 複製到 ~/.local/bin
  skill install [--dest <dir>]        把 SKILL.md 安裝到 ~/.claude/skills/taskcli/
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
      case "list": {
        const { values } = parseArgs({
          args: rest,
          options: {
            type: { type: "string" }, status: { type: "string" },
            priority: { type: "string" }, tag: { type: "string" }, json: { type: "boolean" },
          },
          allowPositionals: true,
        });
        process.stdout.write(`${runList(requireRoot(cwd), {
          type: values.type as TaskType | undefined,
          status: values.status as TaskStatus | undefined,
          priority: values.priority as Priority | undefined,
          tag: values.tag, json: values.json,
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
            due: { type: "string" }, assignee: { type: "string" }, estimate: { type: "string" },
            "add-dep": { type: "string" }, "rm-dep": { type: "string" },
          },
          allowPositionals: true,
        });
        const id = positionals[0];
        if (!id) fail("update 需要 <id>");
        process.stdout.write(`${runUpdate(requireRoot(cwd), id, {
          title: values.title, type: values.type, status: values.status,
          priority: values.priority, addTag: values["add-tag"], rmTag: values["rm-tag"],
          due: values.due, assignee: values.assignee, estimate: values.estimate,
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
      case "rm": {
        const { positionals } = parseArgs({ args: rest, options: {}, allowPositionals: true });
        const id = positionals[0];
        if (!id) fail("rm 需要 <id>");
        process.stdout.write(`${runRm(requireRoot(cwd), id)}\n`);
        return;
      }
      case "install-bin": {
        const { values } = parseArgs({ args: rest, options: { dest: { type: "string" } }, allowPositionals: true });
        process.stdout.write(`${runInstallBin({ dest: values.dest }, process.execPath)}\n`);
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
