import { Command } from "commander";
import { createRequire } from "node:module";
import { hostname } from "node:os";
import qrcode from "qrcode-terminal";
import { initProject } from "./init.js";
import { addTask, appendNotes, getTaskCounts, resetGaveUpTasks } from "./tasks.js";
import { preflight, runDaemon } from "./daemon.js";
import { detectEditorCli, isVSCodeAvailable, isCursorDetected, startTunnel } from "./tunnel.js";

const program = new Command();

program
  .name("tmg")
  .description("Trismegistus — Task Manager for Claude Code")
  .version(
    (() => {
      const req = createRequire(import.meta.url);
      return (req("../package.json") as { version: string }).version;
    })(),
    "-v, --version",
  );

program
  .command("init")
  .description("Create .trismegistus/ folder in current directory")
  .action(() => {
    const result = initProject(process.cwd());

    for (const name of result.created) {
      if (name.endsWith("(updated)")) {
        console.log(`  Updated ${name.replace(" (updated)", "")}`);
      } else {
        console.log(`  Created ${name}`);
      }
    }
    for (const name of result.skipped) {
      console.log(`  Skipped ${name}`);
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
  .option("--no-tunnel", "Skip VS Code tunnel setup")
  .action(async (opts: { tunnel: boolean }) => {
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

    // Tunnel setup
    let tunnelProc: import("node:child_process").ChildProcess | null = null;

    if (opts.tunnel) {
      const editor = detectEditorCli();

      if (editor === "cursor" || !isVSCodeAvailable()) {
        if (isCursorDetected()) {
          console.log("  Note: Remote tunnels only work with VS Code, not Cursor.");
        } else {
          console.log("  Note: VS Code CLI not found — skipping tunnel.");
        }
        console.log("  Tip: Enable remote control in your Claude Code settings to monitor sessions from claude.ai/code.");
        console.log("");
      } else {
        // VS Code available — start tunnel
        const tunnelName = hostname();
        console.log("  Starting VS Code tunnel...\n");

        try {
          const { url, process: tp } = await startTunnel(tunnelName, {
            onOutput(line) {
              const deviceCodeMatch = line.match(/use code\s+([A-Z0-9]{4}-[A-Z0-9]{4})/i);
              const deviceUrlMatch = line.match(/(https:\/\/github\.com\/login\/device)/);
              if (deviceCodeMatch || deviceUrlMatch) {
                console.log("");
                if (deviceUrlMatch) {
                  console.log(`  Open: ${deviceUrlMatch[1]}`);
                }
                if (deviceCodeMatch) {
                  console.log(`  Code: ${deviceCodeMatch[1]}`);
                }
                console.log("");
              } else if (line.includes("Creating tunnel")) {
                console.log(`  ${line.replace(/^\[.*?\]\s*\w+\s*/, "")}`);
              }
            },
          });

          tunnelProc = tp;
          console.log("");
          console.log(`  VS Code tunnel: ${url}`);
          console.log("");
          qrcode.generate(url, { small: true }, (code: string) => {
            console.log(code);
          });
          console.log("  Scan QR to access editor remotely");
          console.log("");
        } catch (e: unknown) {
          console.warn(`  Warning: Tunnel failed — ${e instanceof Error ? e.message : String(e)}`);
          console.warn("  Continuing without tunnel.\n");
        }
      }
    }

    // Cleanup handler
    const cleanup = () => {
      tunnelProc?.kill();
      process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Start daemon
    await runDaemon({
      projectDir: process.cwd(),
    });
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
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

program
  .command("notes")
  .description("Append notes for the daemon's next task run")
  .argument("<text>", "Notes to add")
  .action((text: string) => {
    try {
      appendNotes(process.cwd(), text);
      console.log(`Added note: ${text}`);
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
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
  .option("--name <name>", "Tunnel name")
  .action(async (opts: { name?: string }) => {
    if (isCursorDetected()) {
      console.warn("  Warning: Remote tunnels only work with VS Code, not Cursor.");
      console.warn("  Attempting anyway with VS Code CLI...\n");
    }

    if (!isVSCodeAvailable()) {
      console.error(
        '  Error: "code" CLI not found. Install VS Code or download the standalone CLI:\n  https://code.visualstudio.com/docs/editor/command-line',
      );
      process.exit(1);
    }

    const tunnelName = opts.name ?? hostname();
    console.log("Starting VS Code tunnel...\n");

    try {
      const { url, process: tunnelProc } = await startTunnel(tunnelName, {
        onOutput(line) {
          const deviceCodeMatch = line.match(/use code\s+([A-Z0-9]{4}-[A-Z0-9]{4})/i);
          const deviceUrlMatch = line.match(/(https:\/\/github\.com\/login\/device)/);
          if (deviceCodeMatch || deviceUrlMatch) {
            console.log("");
            if (deviceUrlMatch) {
              console.log(`  Open: ${deviceUrlMatch[1]}`);
            }
            if (deviceCodeMatch) {
              console.log(`  Code: ${deviceCodeMatch[1]}`);
            }
            console.log("");
          } else if (line.includes("Creating tunnel")) {
            console.log(`  ${line.replace(/^\[.*?\]\s*\w+\s*/, "")}`);
          }
        },
      });

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
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

program.parse();
