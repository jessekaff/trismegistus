import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig } from "./config.js";
import {
  getNextTask,
  setTaskStatus,
  readAndClearNotes,
  readHandoff,
  writeHandoff,
  deleteHandoff,
  getAttemptFromStatus,
  getFailureStatus,
} from "./tasks.js";
import { runClaude, type PtySpawnFn } from "./runner.js";
import { createRequire } from "node:module";
import { DIR_NAME, TASKS_FILE } from "./types.js";

const require = createRequire(import.meta.url);
const VERSION = (require("../package.json") as { version: string }).version;
import type { Config } from "./types.js";

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function preflight(projectDir: string): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check .trismegistus directory
  const tmgDir = join(projectDir, DIR_NAME);
  if (!existsSync(tmgDir)) {
    errors.push(`.trismegistus/ not found. Run: tmg init`);
    return { ok: false, errors, warnings };
  }

  // Check tasks.md
  if (!existsSync(join(tmgDir, TASKS_FILE))) {
    errors.push(`tasks.md not found in .trismegistus/. Run: tmg init`);
    return { ok: false, errors, warnings };
  }

  // Check Claude CLI installed
  try {
    execFileSync("which", ["claude"], { stdio: "ignore" });
  } catch {
    errors.push(
      "Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code",
    );
    return { ok: false, errors, warnings };
  }

  // Check Claude CLI works
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch {
    warnings.push(
      "Claude CLI found but 'claude --version' failed. Authentication may be needed.",
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

function buildPrompt(
  taskText: string,
  attempt: number,
  maxRetries: number,
  notes: string,
  handoff: string,
): string {
  let prompt = `You are an autonomous agent (attempt ${attempt}/${maxRetries}). Complete this task fully without asking questions.

WORKFLOW:
1. Break the task into subtasks. Use the Agent tool to spawn sub-agents for independent work when it makes sense.
2. Plan before coding — understand the codebase first, then implement.
3. Run tests and verify your work before finishing.
4. Commit your changes with a clear commit message.

If you cannot finish in time, write a summary of what you did and what remains to .trismegistus/handoff so the next session can continue.`;

  if (notes) {
    prompt += `\n\nNOTES FROM HUMAN (priority):\n${notes}`;
  }

  if (handoff) {
    prompt += `\n\nCONTEXT FROM PREVIOUS ATTEMPT (pick up where this left off):\n${handoff}`;
  }

  prompt += `\n\nTask: ${taskText}`;
  return prompt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DaemonOptions {
  projectDir: string;
  spawnFn?: PtySpawnFn;
  maxIterations?: number; // For testing — limits loop iterations
  onLog?: (msg: string) => void;
  startupDelayMs?: number; // For testing — override Claude startup wait
}

export async function runDaemon(opts: DaemonOptions): Promise<void> {
  const { projectDir, spawnFn, maxIterations, onLog, startupDelayMs } = opts;
  const log = onLog ?? ((msg: string) => console.log(msg));
  const config = loadConfig(projectDir);

  log(`  TMG v${VERSION} — ${new Date().toLocaleString()}`);
  log(`  Project: ${projectDir}`);
  log(`  Timeout: ${config.timeoutMinutes}m | Idle: ${config.idleTimeoutSeconds}s | Max retries: ${config.maxRetries}`);
  log("");

  let iterations = 0;

  while (true) {
    if (maxIterations !== undefined && iterations >= maxIterations) break;
    iterations++;

    const task = getNextTask(projectDir);

    if (!task) {
      log(`[${time()}] No tasks. Watching...`);
      await sleep(config.idlePollSeconds * 1000);
      continue;
    }

    const attempt = getAttemptFromStatus(task.status);
    const notes = readAndClearNotes(projectDir);
    const handoff = readHandoff(projectDir);

    log("");
    log("━".repeat(47));
    log(`▶ [${time()}] ${task.text} (attempt ${attempt}/${config.maxRetries})`);
    log("━".repeat(47));

    setTaskStatus(projectDir, task.text, "~");

    const prompt = buildPrompt(
      task.text,
      attempt,
      config.maxRetries,
      notes,
      handoff,
    );

    const result = await runClaude({
      prompt,
      timeoutMs: config.timeoutMinutes * 60 * 1000,
      idleTimeoutMs: config.idleTimeoutSeconds * 1000,
      projectDir,
      spawnFn,
      startupDelayMs,
    });

    if (result.success) {
      setTaskStatus(projectDir, task.text, "x");
      deleteHandoff(projectDir);
      log(`[${time()}] Done: ${task.text}`);
    } else {
      if (result.timedOut) {
        log(`[${time()}] Timed out`);
      } else {
        log(`[${time()}] Exited (${result.exitCode})`);
      }

      // Write default handoff if Claude didn't write one
      if (!existsSync(join(projectDir, DIR_NAME, "handoff"))) {
        const reason = result.timedOut ? "timed out" : "failed";
        writeHandoff(
          projectDir,
          `Previous attempt ${reason}. Check git log and codebase to see what was done. Continue from there.`,
        );
      }

      if (attempt >= config.maxRetries) {
        setTaskStatus(projectDir, task.text, "!!!");
        deleteHandoff(projectDir);
        log(`Gave up after ${config.maxRetries} attempts: ${task.text}`);
      } else {
        const failStatus = getFailureStatus(attempt);
        setTaskStatus(projectDir, task.text, failStatus);
        log(`  → Will retry with handoff context...`);
      }
    }

    await sleep(config.taskDelaySeconds * 1000);
  }
}

function time(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}
