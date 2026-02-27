import { Command } from "commander";
import { VERSION } from "./types.js";
import { initProject } from "./init.js";
import { getTaskCounts, resetGaveUpTasks } from "./tasks.js";
import { preflight, runDaemon } from "./daemon.js";

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

program.parse();
