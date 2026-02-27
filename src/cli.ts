import { Command } from "commander";
import { hostname } from "node:os";
import qrcode from "qrcode-terminal";
import { VERSION } from "./types.js";
import { initProject } from "./init.js";
import { addTask, getTaskCounts, resetGaveUpTasks } from "./tasks.js";
import { preflight, runDaemon } from "./daemon.js";
import { checkCodeCli, startTunnel } from "./tunnel.js";

const program = new Command();

program
  .name("tmg")
  .description("Trismegistus — Task Manager for Claude Code")
  .version(VERSION, "-v, --version");

program
  .command("init")
  .description("Create .trismegistus/ folder in current directory")
  .action(() => {
    const result = initProject(process.cwd());

    for (const name of result.created) {
      console.log(`  Created ${name}`);
    }
    for (const name of result.skipped) {
      console.log(`  Skipped ${name} (already exists)`);
    }

    console.log("");
    console.log("  Add your tasks to .trismegistus/tasks.md, then run: tmg start");
    console.log("");
  });

program
  .command("status")
  .description("Show task counts")
  .action(() => {
    const counts = getTaskCounts(process.cwd());

    console.log("");
    console.log("  TMG Status");
    console.log("  ─────────────");
    console.log(`  Pending:       ${counts.pending}`);
    console.log(`  In Progress:   ${counts.inProgress}`);
    console.log(`  Done:          ${counts.done}`);
    console.log(`  Retrying (!):  ${counts.failed1}`);
    console.log(`  Retrying (!!): ${counts.failed2}`);
    console.log(`  Gave up (!!!): ${counts.gaveUp}`);
    console.log("");
  });

program
  .command("start")
  .description("Start the daemon — continuously runs tasks from the queue")
  .action(async () => {
    const check = preflight(process.cwd());

    for (const err of check.errors) {
      console.error(`  Error: ${err}`);
    }
    for (const warn of check.warnings) {
      console.warn(`  Warning: ${warn}`);
    }

    if (!check.ok) {
      process.exit(1);
    }

    console.log("");

    await runDaemon({ projectDir: process.cwd() });
  });

program
  .command("add")
  .description("Add a task to the queue")
  .argument("<text>", "Task description")
  .action((text: string) => {
    try {
      addTask(process.cwd(), text);
      console.log(`Added: ${text}`);
    } catch (e: unknown) {
      console.error((e as Error).message);
      process.exit(1);
    }
  });

program
  .command("reset")
  .description("Reset all gave-up [!!!] tasks back to pending [ ]")
  .action(() => {
    const count = resetGaveUpTasks(process.cwd());

    if (count === 0) {
      console.log("  No gave-up tasks to reset.");
    } else {
      console.log(`  Reset ${count} task(s) back to pending.`);
    }
  });

program
  .command("remote")
  .description("Open a VS Code tunnel for phone access (QR code)")
  .option("--name <name>", "Tunnel name", hostname())
  .action(async (opts: { name: string }) => {
    try {
      checkCodeCli();
    } catch (e: unknown) {
      console.error((e as Error).message);
      process.exit(1);
    }

    console.log("Starting VS Code tunnel...");

    try {
      const { url, process: tunnelProc } = await startTunnel(opts.name);

      console.log("");
      console.log(`  URL: ${url}`);
      console.log("");
      qrcode.generate(url, { small: true }, (code: string) => {
        console.log(code);
      });
      console.log("  Scan the QR code or open the URL on your phone");
      console.log("  Press Ctrl+C to stop the tunnel");
      console.log("");

      const cleanup = () => {
        tunnelProc.kill();
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    } catch (e: unknown) {
      console.error((e as Error).message);
      process.exit(1);
    }
  });

program.parse();
