import * as pty from "node-pty";
import type { RunResult } from "./types.js";

export interface PtySpawnFn {
  (file: string, args: string[], options: pty.IPtyForkOptions): pty.IPty;
}

export interface RunClaudeOptions {
  prompt: string;
  timeoutMs: number;
  projectDir: string;
  idleTimeoutMs?: number;
  spawnFn?: PtySpawnFn;
  startupDelayMs?: number;
}

export function runClaude(opts: RunClaudeOptions): Promise<RunResult> {
  const {
    prompt,
    timeoutMs,
    projectDir,
    idleTimeoutMs = 60_000,
    spawnFn = pty.spawn,
    startupDelayMs = 5000,
  } = opts;

  return new Promise((resolve) => {
    let timedOut = false;
    let idledOut = false;
    let settled = false;
    let promptSent = false;
    let gotFirstData = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let outputAfterPrompt = 0;

    // Minimum bytes of output after prompt to consider idle as success.
    // Prevents false "success" when prompt fails to submit and Claude
    // just sits idle. A real Claude response produces thousands of bytes.
    const MIN_OUTPUT_FOR_SUCCESS = 500;

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
        if (idleTimer) clearTimeout(idleTimer);
        resolve(result);
      }
    }

    function resetIdleTimer() {
      if (!promptSent || settled) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        // No output for idleTimeoutMs — Claude is likely done and waiting
        // for input. Kill the process gracefully.
        idledOut = true;
        child.kill();
      }, idleTimeoutMs);
    }

    child.onData((data: string) => {
      // Stream Claude's output to the terminal so the user can see progress
      process.stdout.write(data);

      // Track output volume after prompt to detect false completions
      if (promptSent) outputAfterPrompt += data.length;

      // Reset idle timer on every output — Claude is still working
      resetIdleTimer();

      // On first data, wait for Claude to fully start up then send the prompt
      if (!gotFirstData) {
        gotFirstData = true;
        setTimeout(() => {
          if (!promptSent && !settled) {
            promptSent = true;
            // Write the prompt text, then press Enter to submit
            child.write(prompt);
            setTimeout(() => child.write("\r"), 500);
          }
        }, startupDelayMs);
      }
    });

    child.onExit(({ exitCode }) => {
      // Idle timeout is success ONLY if Claude produced substantial output
      // (prevents false success when prompt fails to submit)
      const idleSuccess = idledOut && outputAfterPrompt >= MIN_OUTPUT_FOR_SUCCESS;

      settle({
        success: idleSuccess || (!timedOut && !idledOut && exitCode === 0),
        exitCode: timedOut ? 124 : exitCode,
        timedOut,
      });
    });
  });
}
