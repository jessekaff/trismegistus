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
  onRemoteUrl?: (url: string) => void;
}

// Strip ANSI escape codes for pattern matching
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

export function runClaude(opts: RunClaudeOptions): Promise<RunResult> {
  const {
    prompt,
    timeoutMs,
    projectDir,
    spawnFn = pty.spawn,
    onRemoteUrl,
  } = opts;

  return new Promise((resolve) => {
    let timedOut = false;
    let settled = false;
    let outputBuffer = "";
    let remoteUrlSent = false;
    let promptSent = false;
    let remoteControlSent = false;
    let readyForInput = false;

    const child = spawnFn("claude", ["--dangerously-skip-permissions"], {
      cols: 120,
      rows: 40,
      cwd: projectDir,
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

      // Step 1: Wait for Claude's interactive prompt to be ready
      // Claude Code shows a prompt like ">" or "╰─" or similar when ready for input
      if (!remoteControlSent && isReadyForInput(clean)) {
        remoteControlSent = true;
        readyForInput = true;
        // Reset buffer before sending command
        outputBuffer = "";
        child.write("/remote-control\r");
        return;
      }

      // Step 2: After /remote-control, parse for the URL
      if (remoteControlSent && !remoteUrlSent) {
        const urlMatch = clean.match(/(https:\/\/claude\.ai\/code\/[^\s]+)/);
        if (urlMatch) {
          remoteUrlSent = true;
          onRemoteUrl?.(urlMatch[1]);
        }
      }

      // Step 3: After remote-control is set up, wait for ready prompt then send the task
      if (remoteControlSent && !promptSent && remoteUrlSent) {
        // Wait for next ready prompt after /remote-control output
        if (isReadyForInput(clean)) {
          promptSent = true;
          outputBuffer = "";
          child.write(prompt + "\r");
          return;
        }
      }

      // Step 4: If remote-control didn't produce a URL within reasonable output,
      // send the prompt anyway (remote-control might not be available)
      if (remoteControlSent && !promptSent && !remoteUrlSent && clean.length > 2000) {
        // Assume remote-control output is done, send prompt
        if (isReadyForInput(clean)) {
          promptSent = true;
          outputBuffer = "";
          child.write(prompt + "\r");
          return;
        }
      }

      // Step 5: After task prompt sent, detect completion
      if (promptSent) {
        // Claude returns to idle prompt when done — detect the input indicator
        // after substantial output (task processing)
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
// Claude Code interactive mode shows various prompt indicators
function isReadyForInput(output: string): boolean {
  const lines = output.split("\n");
  // Check the last few lines for prompt-like patterns
  const tail = lines.slice(-5).join("\n");
  // Claude Code typically shows ">" at the end when ready, or a prompt character
  // It may also show a box-drawing character prompt
  return /[>❯]\s*$/.test(tail) || /╰─\s*$/.test(tail) || /\$\s*$/.test(tail);
}

// Detect when Claude has finished processing the task
function isTaskComplete(output: string): boolean {
  const lines = output.split("\n");
  const tail = lines.slice(-5).join("\n");
  // After processing, Claude returns to its input prompt
  return /[>❯]\s*$/.test(tail) || /╰─\s*$/.test(tail);
}
