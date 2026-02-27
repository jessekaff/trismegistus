import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

// Mock child_process before importing tunnel module
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

import { execFileSync, spawn } from "node:child_process";
import { checkCodeCli, startTunnel } from "../src/tunnel.js";

const mockExecFileSync = vi.mocked(execFileSync);
const mockSpawn = vi.mocked(spawn);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkCodeCli", () => {
  it("does not throw when code CLI is found", () => {
    mockExecFileSync.mockReturnValue("");
    expect(() => checkCodeCli()).not.toThrow();
    expect(mockExecFileSync).toHaveBeenCalledWith("which", ["code"], {
      stdio: "ignore",
    });
  });

  it("throws when code CLI is not found", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    expect(() => checkCodeCli()).toThrow("VS Code CLI (code) not found");
  });
});

describe("startTunnel", () => {
  function createMockChild() {
    const child = new EventEmitter() as any;
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = vi.fn();
    return child;
  }

  it("resolves with URL when stdout contains tunnel URL", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");

    // Simulate the tunnel printing its URL
    child.stdout.push(
      "Open this link in your browser https://vscode.dev/tunnel/test-machine\n",
    );

    const result = await promise;
    expect(result.url).toBe("https://vscode.dev/tunnel/test-machine");
    expect(result.process).toBe(child);
  });

  it("rejects when process exits before URL appears", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");

    child.stderr.push("some error\n");
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("code tunnel exited with code 1");
  });

  it("rejects on process error", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");

    child.emit("error", new Error("spawn failed"));

    await expect(promise).rejects.toThrow("spawn failed");
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");
    const resultPromise = promise.catch((err: Error) => err);

    await vi.advanceTimersByTimeAsync(60_000);

    const err = await resultPromise;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("Timed out waiting for tunnel URL");
    expect(child.kill).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("includes stderr in timeout error when available", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const resultPromise = promise.catch((err: Error) => err);

    child.stderr.push("To grant access, open this URL...\n");
    await vi.advanceTimersByTimeAsync(60_000);

    const err = await resultPromise;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("To grant access");

    vi.useRealTimers();
  });
});
