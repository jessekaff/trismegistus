import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

// Mock child_process before importing tunnel module
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

import { execFileSync, spawn } from "node:child_process";
import { detectEditorCli, isVSCodeAvailable, isCursorDetected, startTunnel } from "../src/tunnel.js";

const mockExecFileSync = vi.mocked(execFileSync);
const mockSpawn = vi.mocked(spawn);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TERM_PROGRAM;
  delete process.env.CURSOR_TRACE_DIR;
});

describe("detectEditorCli", () => {
  it("returns 'cursor' when TERM_PROGRAM is cursor", () => {
    process.env.TERM_PROGRAM = "cursor";
    expect(detectEditorCli()).toBe("cursor");
  });

  it("returns 'cursor' when CURSOR_TRACE_DIR is set", () => {
    process.env.CURSOR_TRACE_DIR = "/tmp/cursor";
    expect(detectEditorCli()).toBe("cursor");
  });

  it("returns 'code' by default", () => {
    expect(detectEditorCli()).toBe("code");
  });
});

describe("isVSCodeAvailable", () => {
  it("returns true when code CLI exists", () => {
    mockExecFileSync.mockReturnValue("");
    expect(isVSCodeAvailable()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith("which", ["code"], {
      stdio: "ignore",
    });
  });

  it("returns false when code CLI is missing", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    expect(isVSCodeAvailable()).toBe(false);
  });
});

describe("isCursorDetected", () => {
  it("returns true when TERM_PROGRAM is cursor", () => {
    process.env.TERM_PROGRAM = "cursor";
    expect(isCursorDetected()).toBe(true);
  });

  it("returns false by default", () => {
    expect(isCursorDetected()).toBe(false);
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

  it("rejects when code CLI is not available", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });

    await expect(startTunnel("test-machine")).rejects.toThrow('"code" CLI not found');
  });

  it("resolves with URL when stdout contains tunnel URL", async () => {
    // isVSCodeAvailable check
    mockExecFileSync.mockReturnValue("");
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");

    child.stdout.push(
      "Open this link in your browser https://vscode.dev/tunnel/test-machine\n",
    );

    const result = await promise;
    expect(result.url).toBe("https://vscode.dev/tunnel/test-machine");
    expect(result.process).toBe(child);

    // Should always use "code" CLI
    expect(mockSpawn).toHaveBeenCalledWith(
      "code",
      ["tunnel", "--name", "test-machine", "--accept-server-license-terms"],
      expect.any(Object),
    );
  });

  it("rejects when process exits before URL appears", async () => {
    mockExecFileSync.mockReturnValue("");
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");

    child.stderr.push("some error\n");
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("code tunnel exited with code 1");
  });

  it("rejects on process error", async () => {
    mockExecFileSync.mockReturnValue("");
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");

    child.emit("error", new Error("spawn failed"));

    await expect(promise).rejects.toThrow("spawn failed");
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();
    mockExecFileSync.mockReturnValue("");
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");
    const resultPromise = promise.catch((err: Error) => err);

    await vi.advanceTimersByTimeAsync(120_000);

    const err = await resultPromise;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("Timed out waiting for tunnel URL");
    expect(child.kill).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("includes stderr in timeout error when available", async () => {
    vi.useFakeTimers();
    mockExecFileSync.mockReturnValue("");
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as any);

    const promise = startTunnel("test-machine");
    const resultPromise = promise.catch((err: Error) => err);

    child.stderr.push("To grant access, open this URL...\n");
    await vi.advanceTimersByTimeAsync(120_000);

    const err = await resultPromise;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("To grant access");

    vi.useRealTimers();
  });
});
