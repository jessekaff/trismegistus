import { describe, it, expect, vi } from "vitest";
import { runClaude, type SpawnFn } from "../src/runner.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

function createMockChild(): ChildProcess & { _exit: (code: number) => void; _error: (err: Error) => void } {
  const emitter = new EventEmitter();
  const child = Object.assign(emitter, {
    pid: 12345,
    stdin: null,
    stdout: null,
    stderr: null,
    stdio: [null, null, null] as const,
    connected: false,
    exitCode: null as number | null,
    signalCode: null as string | null,
    spawnargs: [] as string[],
    spawnfile: "",
    killed: false,
    kill: vi.fn(() => {
      setTimeout(() => emitter.emit("exit", 0, null), 0);
      return true;
    }),
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    [Symbol.dispose]: vi.fn(),
    _exit(code: number) {
      emitter.emit("exit", code, null);
    },
    _error(err: Error) {
      emitter.emit("error", err);
    },
  });
  return child as unknown as ChildProcess & { _exit: (code: number) => void; _error: (err: Error) => void };
}

describe("runClaude", () => {
  it("spawns claude with -p and the prompt", async () => {
    const child = createMockChild();
    let capturedArgs: { command: string; args: string[]; cwd: string } | null = null;

    const spawnFn: SpawnFn = (command, args, cwd) => {
      capturedArgs = { command, args, cwd };
      setTimeout(() => child._exit(0), 0);
      return child;
    };

    const result = await runClaude({
      prompt: "Fix the bug",
      timeoutMs: 30000,
      projectDir: "/my/project",
      spawnFn,
    });

    expect(capturedArgs).toEqual({
      command: "claude",
      args: ["-p", "Fix the bug", "--dangerously-skip-permissions"],
      cwd: "/my/project",
    });
    expect(result.success).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it("returns failure for non-zero exit", async () => {
    const child = createMockChild();
    const spawnFn: SpawnFn = () => {
      setTimeout(() => child._exit(1), 0);
      return child;
    };

    const result = await runClaude({
      prompt: "test",
      timeoutMs: 30000,
      projectDir: "/tmp",
      spawnFn,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("handles timeout", async () => {
    const child = createMockChild();
    const spawnFn: SpawnFn = () => child;

    const result = await runClaude({
      prompt: "test",
      timeoutMs: 50,
      projectDir: "/tmp",
      spawnFn,
    });

    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(124);
    expect(child.kill).toHaveBeenCalled();
  });

  it("handles spawn error", async () => {
    const child = createMockChild();
    const spawnFn: SpawnFn = () => {
      setTimeout(() => child._error(new Error("ENOENT")), 0);
      return child;
    };

    const result = await runClaude({
      prompt: "test",
      timeoutMs: 30000,
      projectDir: "/tmp",
      spawnFn,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});
