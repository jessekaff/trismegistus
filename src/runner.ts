import { spawn, type ChildProcess } from "node:child_process";
import type { RunResult } from "./types.js";

export interface SpawnFn {
  (command: string, args: string[], cwd: string): ChildProcess;
}

function defaultSpawn(command: string, args: string[], cwd: string): ChildProcess {
  return spawn(command, args, { cwd, stdio: "ignore" });
}

export interface RunClaudeOptions {
  prompt: string;
  timeoutMs: number;
  projectDir: string;
  spawnFn?: SpawnFn;
}

export function runClaude(opts: RunClaudeOptions): Promise<RunResult> {
  const { prompt, timeoutMs, projectDir, spawnFn = defaultSpawn } = opts;

  return new Promise((resolve) => {
    let timedOut = false;
    let settled = false;

    const child = spawnFn(
      "claude",
      ["-p", prompt, "--dangerously-skip-permissions"],
      projectDir,
    );

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

    child.on("exit", (code) => {
      settle({
        success: !timedOut && code === 0,
        exitCode: timedOut ? 124 : (code ?? 1),
        timedOut,
      });
    });

    child.on("error", () => {
      settle({ success: false, exitCode: 1, timedOut: false });
    });
  });
}
