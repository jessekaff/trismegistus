import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { runClaude, type SpawnFn } from "../src/runner.js";
import type { ChildProcess } from "node:child_process";

function createMockSpawn(exitCode: number, delay = 0): SpawnFn {
  return (_cmd, _args, opts) => {
    const child = new EventEmitter() as ChildProcess;
    child.pid = 12345;
    child.stdin = null;
    child.stdout = null;
    child.stderr = null;

    const timer = setTimeout(() => {
      child.emit("close", exitCode);
    }, delay);

    // Simulate real child process behavior on abort
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        child.emit("close", null);
      });
    }

    return child;
  };
}

function createErrorSpawn(errorName = "Error"): SpawnFn {
  return (_cmd, _args, _opts) => {
    const child = new EventEmitter() as ChildProcess;
    child.pid = undefined;
    child.stdin = null;
    child.stdout = null;
    child.stderr = null;

    setTimeout(() => {
      const err = new Error("spawn failed");
      err.name = errorName;
      child.emit("error", err);
    }, 0);

    return child;
  };
}

describe("runClaude", () => {
  it("returns success for exit code 0", async () => {
    const result = await runClaude("test prompt", 30000, "/tmp", createMockSpawn(0));
    expect(result).toEqual({ success: true, exitCode: 0, timedOut: false });
  });

  it("returns failure for non-zero exit code", async () => {
    const result = await runClaude("test prompt", 30000, "/tmp", createMockSpawn(1));
    expect(result).toEqual({ success: false, exitCode: 1, timedOut: false });
  });

  it("detects timeout", async () => {
    // Spawn that takes 500ms, with 50ms timeout
    const result = await runClaude(
      "test prompt",
      50,
      "/tmp",
      createMockSpawn(0, 500),
    );
    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
  });

  it("handles spawn errors", async () => {
    const result = await runClaude("test prompt", 30000, "/tmp", createErrorSpawn());
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("passes correct arguments to spawn", async () => {
    let capturedArgs: { cmd: string; args: string[]; cwd: string } | null = null;

    const spySpawn: SpawnFn = (cmd, args, opts) => {
      capturedArgs = { cmd, args, cwd: opts.cwd as string };
      const child = new EventEmitter() as ChildProcess;
      child.pid = 1;
      child.stdin = null;
      child.stdout = null;
      child.stderr = null;
      setTimeout(() => child.emit("close", 0), 0);
      return child;
    };

    await runClaude("do something", 30000, "/my/project", spySpawn);
    expect(capturedArgs).toEqual({
      cmd: "claude",
      args: ["--dangerously-skip-permissions", "-p", "do something"],
      cwd: "/my/project",
    });
  });
});
