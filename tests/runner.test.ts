import { describe, it, expect, vi } from "vitest";
import { runClaude, type PtySpawnFn } from "../src/runner.js";
import type { IPty, IDisposable } from "node-pty";

interface MockPty {
  pid: number;
  cols: number;
  rows: number;
  process: string;
  handleFlowControl: boolean;
  onData: IPty["onData"];
  onExit: IPty["onExit"];
  write: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  resize: () => void;
  clear: () => void;
  pause: () => void;
  resume: () => void;
  _emitData: (data: string) => void;
  _emitExit: (exitCode: number) => void;
}

function createMockPty(): MockPty {
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(e: { exitCode: number; signal?: number }) => void> = [];

  const mock: MockPty = {
    pid: 12345,
    cols: 120,
    rows: 40,
    process: "claude",
    handleFlowControl: false,
    write: vi.fn(),
    kill: vi.fn(() => {
      setTimeout(() => {
        for (const fn of exitListeners) fn({ exitCode: 0 });
      }, 0);
    }),
    resize() {},
    clear() {},
    pause() {},
    resume() {},
    onData(listener: (data: string) => void): IDisposable {
      dataListeners.push(listener);
      return { dispose() {} };
    },
    onExit(listener: (e: { exitCode: number; signal?: number }) => void): IDisposable {
      exitListeners.push(listener);
      return { dispose() {} };
    },
    _emitData(data: string) {
      for (const fn of dataListeners) fn(data);
    },
    _emitExit(exitCode: number) {
      for (const fn of exitListeners) fn({ exitCode });
    },
  };

  return mock;
}

function createMockSpawnFn(mockPty: MockPty): PtySpawnFn {
  return (_file, _args, _options) => mockPty as unknown as IPty;
}

describe("runClaude", () => {
  it("sends /remote-control then the prompt when Claude is ready", async () => {
    const mock = createMockPty();
    const spawnFn = createMockSpawnFn(mock);
    const onRemoteUrl = vi.fn();

    const promise = runClaude({
      prompt: "Fix the bug",
      timeoutMs: 30000,
      projectDir: "/tmp",
      spawnFn,
      onRemoteUrl,
    });

    // Simulate Claude showing its ready prompt
    mock._emitData("Welcome to Claude Code!\n\n> ");

    // Should have sent /remote-control
    expect(mock.write).toHaveBeenCalledWith("/remote-control\r");

    // Simulate remote-control response with URL
    mock._emitData("Remote control enabled.\nSession URL: https://claude.ai/code/abc123\n\n> ");

    expect(onRemoteUrl).toHaveBeenCalledWith("https://claude.ai/code/abc123");

    // Should have sent the task prompt
    expect(mock.write).toHaveBeenCalledWith("Fix the bug\r");

    // Simulate task completion — Claude returns to prompt after output
    const longOutput = "Working on the bug...\n".repeat(10);
    mock._emitData(longOutput + "\nDone!\n\n> ");

    // Kill should have been called (task complete detected)
    expect(mock.kill).toHaveBeenCalled();

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  it("handles timeout", async () => {
    const mock = createMockPty();

    // Override kill to emit exit with timedOut behavior
    mock.kill = vi.fn(() => {
      // Don't auto-exit — let the runner's timeout handler deal with it
      setTimeout(() => mock._emitExit(0), 0);
    });

    const spawnFn = createMockSpawnFn(mock);

    // Use a very short timeout
    const promise = runClaude({
      prompt: "test",
      timeoutMs: 50,
      projectDir: "/tmp",
      spawnFn,
    });

    // Don't emit any ready prompt — let it time out
    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(124);
    expect(mock.kill).toHaveBeenCalled();
  });

  it("returns failure for non-zero exit", async () => {
    const mock = createMockPty();

    // Override kill to NOT auto-exit
    mock.kill = vi.fn();

    const spawnFn = createMockSpawnFn(mock);

    const promise = runClaude({
      prompt: "test",
      timeoutMs: 30000,
      projectDir: "/tmp",
      spawnFn,
    });

    // Simulate Claude crashing before showing prompt
    mock._emitExit(1);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("passes correct args to pty.spawn", async () => {
    const mock = createMockPty();
    // Override kill to not auto-exit
    mock.kill = vi.fn();

    let capturedArgs: { file: string; args: string[]; cwd: string } | null = null;

    const spawnFn: PtySpawnFn = (file, args, options) => {
      capturedArgs = { file, args: args as string[], cwd: options.cwd as string };
      return mock as unknown as IPty;
    };

    const promise = runClaude({
      prompt: "do something",
      timeoutMs: 30000,
      projectDir: "/my/project",
      spawnFn,
    });

    // Exit immediately
    mock._emitExit(0);
    await promise;

    expect(capturedArgs).toEqual({
      file: "claude",
      args: ["--dangerously-skip-permissions"],
      cwd: "/my/project",
    });
  });

  it("proceeds without remote URL if none appears", async () => {
    const mock = createMockPty();
    const spawnFn = createMockSpawnFn(mock);
    const onRemoteUrl = vi.fn();

    const promise = runClaude({
      prompt: "Fix it",
      timeoutMs: 30000,
      projectDir: "/tmp",
      spawnFn,
      onRemoteUrl,
    });

    // Simulate Claude ready
    mock._emitData("Welcome to Claude!\n\n> ");
    expect(mock.write).toHaveBeenCalledWith("/remote-control\r");

    // Simulate response without URL — lots of output (>2000 chars) then prompt
    const noUrlOutput = "Remote control is not available in this environment. ".repeat(50);
    mock._emitData(noUrlOutput + "\n\n> ");

    // Should send the prompt after seeing enough output and a ready indicator
    expect(mock.write).toHaveBeenCalledWith("Fix it\r");
    expect(onRemoteUrl).not.toHaveBeenCalled();

    // Complete
    const taskOutput = "Fixed the thing!\n".repeat(10);
    mock._emitData(taskOutput + "\n\n> ");
    expect(mock.kill).toHaveBeenCalled();

    const result = await promise;
    expect(result.success).toBe(true);
  });
});
