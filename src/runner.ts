import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { RunResult } from "./types.js";

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: SpawnOptions,
) => ChildProcess;

export function runClaude(
  prompt: string,
  timeoutMs: number,
  projectDir: string,
  spawnFn: SpawnFn = spawn,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const ac = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, timeoutMs);

    const child = spawnFn(
      "claude",
      ["--dangerously-skip-permissions", "-p", prompt],
      {
        cwd: projectDir,
        stdio: "inherit",
        signal: ac.signal,
      },
    );

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        success: !timedOut && code === 0,
        exitCode: timedOut ? 124 : (code ?? 1),
        timedOut,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        exitCode: 1,
        timedOut: timedOut || err.name === "AbortError",
      });
    });
  });
}
