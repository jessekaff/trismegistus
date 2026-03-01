import * as pty from "node-pty";
import type { RunResult } from "./types.js";

export interface PtySpawnFn {
  (file: string, args: string[], options: pty.IPtyForkOptions): pty.IPty;
}

export interface RunClaudeOptions {
  prompt: string;
  timeoutMs: number;
  projectDir: string;
  spawnFn?: PtySpawnFn;
}

// Strip ANSI escape codes for pattern matching
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

export function runClaude(opts: RunClaudeOptions): Promise<RunResult> {
  const { prompt, timeoutMs, projectDir, spawnFn = pty.spawn } = opts;

  return new Promise((resolve) => {
    let timedOut = false;
    let settled = false;
    let outputBuffer = "";
    let promptSent = false;

    const child = spawnFn("claude", ["--dangerously-skip-permissions"], {
      cols: 120,
      rows: 40,
      cwd: projectDir,
      env: process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    function settle(result: RunResult) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    }

    child.onData((data: string) => {
      outputBuffer += data;
      const clean = stripAnsi(outputBuffer);

      // Wait for Claude's interactive prompt to be ready, then send the task
      if (!promptSent && isReadyForInput(clean)) {
        promptSent = true;
        outputBuffer = "";
        child.write(prompt + "\r");
        return;
      }

      // After task prompt sent, detect completion
      if (promptSent) {
        if (clean.length > 100 && isTaskComplete(clean)) {
          child.kill();
        }
      }
    });

    child.onExit(({ exitCode }) => {
      settle({
        success: !timedOut && exitCode === 0,
        exitCode: timedOut ? 124 : exitCode,
        timedOut,
      });
    });
  });
}

// Detect when Claude Code is ready for input
function isReadyForInput(output: string): boolean {
  const lines = output.split("\n");
  const tail = lines.slice(-5).join("\n");
  return /[>❯]\s*$/.test(tail) || /╰─\s*$/.test(tail) || /\$\s*$/.test(tail);
}

// Detect when Claude has finished processing the task
function isTaskComplete(output: string): boolean {
  const lines = output.split("\n");
  const tail = lines.slice(-5).join("\n");
  return /[>❯]\s*$/.test(tail) || /╰─\s*$/.test(tail);
}
