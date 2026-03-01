import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { preflight, runDaemon } from "../src/daemon.js";
import { initProject } from "../src/init.js";
import type { PtySpawnFn } from "../src/runner.js";
import type { IPty, IDisposable } from "node-pty";
import { DIR_NAME, TASKS_FILE, NOTES_FILE, HANDOFF_FILE } from "../src/types.js";

let tmpDir: string;
let tmgDir: string;
let logs: string[];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tmg-test-"));
  tmgDir = join(tmpDir, DIR_NAME);
  logs = [];
  initProject(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTasks(content: string) {
  writeFileSync(join(tmgDir, TASKS_FILE), content);
}

function readTasks(): string {
  return readFileSync(join(tmgDir, TASKS_FILE), "utf-8");
}

function writeConfig(content: string) {
  writeFileSync(join(tmgDir, "config"), content);
}

function writeNotes(content: string) {
  writeFileSync(join(tmgDir, NOTES_FILE), content);
}

/**
 * Creates a mock PtySpawnFn that simulates the interactive session:
 * 1. Emits a ready prompt
 * 2. Receives the task prompt
 * 3. Emits task output and completion
 * 4. Exits with the given code
 */
function mockPtySpawn(exitCode: number, opts?: { onPromptWritten?: (prompt: string) => void }): PtySpawnFn {
  return (_file, _args, _options) => {
    const dataListeners: Array<(data: string) => void> = [];
    const exitListeners: Array<(e: { exitCode: number; signal?: number }) => void> = [];

    const pty: IPty = {
      pid: 12345,
      cols: 120,
      rows: 40,
      process: "claude",
      handleFlowControl: false,
      onData(listener: (data: string) => void): IDisposable {
        dataListeners.push(listener);
        return { dispose() {} };
      },
      onExit(listener: (e: { exitCode: number; signal?: number }) => void): IDisposable {
        exitListeners.push(listener);
        return { dispose() {} };
      },
      write(data: string) {
        opts?.onPromptWritten?.(data);
        // Simulate task processing and completion
        setTimeout(() => {
          const output = "Working...\n".repeat(15) + "\nDone!\n\n> ";
          for (const fn of dataListeners) fn(output);
        }, 2);
      },
      kill(_signal?: string) {
        setTimeout(() => {
          for (const fn of exitListeners) fn({ exitCode });
        }, 0);
      },
      resize() {},
      clear() {},
      pause() {},
      resume() {},
    };

    // Emit initial ready prompt
    setTimeout(() => {
      for (const fn of dataListeners) fn("Welcome to Claude!\n\n> ");
    }, 1);

    return pty;
  };
}

/** Mock that simulates an immediate failure */
function failPtySpawn(exitCode: number): PtySpawnFn {
  return (_file, _args, _options) => {
    const exitListeners: Array<(e: { exitCode: number; signal?: number }) => void> = [];

    const pty: IPty = {
      pid: 12345,
      cols: 120,
      rows: 40,
      process: "claude",
      handleFlowControl: false,
      onData(_listener: (data: string) => void): IDisposable {
        return { dispose() {} };
      },
      onExit(listener: (e: { exitCode: number; signal?: number }) => void): IDisposable {
        exitListeners.push(listener);
        return { dispose() {} };
      },
      write() {},
      kill(_signal?: string) {
        setTimeout(() => {
          for (const fn of exitListeners) fn({ exitCode });
        }, 0);
      },
      resize() {},
      clear() {},
      pause() {},
      resume() {},
    };

    // Exit immediately with error code
    setTimeout(() => {
      for (const fn of exitListeners) fn({ exitCode });
    }, 1);

    return pty;
  };
}

describe("preflight", () => {
  it("fails when .trismegistus/ does not exist", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "tmg-empty-"));
    const result = preflight(emptyDir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("tmg init");
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it("fails when tasks.md is missing", () => {
    const noTasksDir = mkdtempSync(join(tmpdir(), "tmg-notasks-"));
    mkdirSync(join(noTasksDir, DIR_NAME));
    const result = preflight(noTasksDir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("tasks.md");
    rmSync(noTasksDir, { recursive: true, force: true });
  });
});

describe("runDaemon", () => {
  it("completes a successful task", async () => {
    writeTasks("- [ ] Build feature");
    writeConfig("TIMEOUT_MINUTES=1\nTASK_DELAY_SECONDS=0\nIDLE_POLL_SECONDS=0\n");

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: mockPtySpawn(0),
      maxIterations: 2,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [x] Build feature");
    expect(logs.some((l) => l.includes("Done: Build feature"))).toBe(true);
  });

  it("retries a failed task with escalating status", async () => {
    writeTasks("- [ ] Flaky task");
    writeConfig("MAX_RETRIES=3\nTIMEOUT_MINUTES=1\nTASK_DELAY_SECONDS=0\nIDLE_POLL_SECONDS=0\n");

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: failPtySpawn(1),
      maxIterations: 1,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [!] Flaky task");
    expect(existsSync(join(tmgDir, HANDOFF_FILE))).toBe(true);

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: failPtySpawn(1),
      maxIterations: 1,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [!!] Flaky task");

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: failPtySpawn(1),
      maxIterations: 1,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [!!!] Flaky task");
    expect(logs.some((l) => l.includes("Gave up"))).toBe(true);
    expect(existsSync(join(tmgDir, HANDOFF_FILE))).toBe(false);
  });

  it("handles timeout correctly", async () => {
    writeTasks("- [ ] Slow task");
    writeConfig("MAX_RETRIES=3\nTIMEOUT_MINUTES=1\nTASK_DELAY_SECONDS=0\nIDLE_POLL_SECONDS=0\n");

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: failPtySpawn(124),
      maxIterations: 1,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [!] Slow task");
    expect(logs.some((l) => l.includes("Exited (124)"))).toBe(true);
  });

  it("reads and clears notes before task", async () => {
    writeTasks("- [ ] Some task");
    writeNotes("# Header\nFocus on the API endpoint\n");
    writeConfig("TIMEOUT_MINUTES=1\nTASK_DELAY_SECONDS=0\nIDLE_POLL_SECONDS=0\n");

    let capturedPrompt = "";
    const capturingSpawn = mockPtySpawn(0, {
      onPromptWritten(prompt) {
        capturedPrompt = prompt;
      },
    });

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: capturingSpawn,
      maxIterations: 2,
      onLog: (msg) => logs.push(msg),
    });

    expect(capturedPrompt).toContain("Focus on the API endpoint");
    expect(capturedPrompt).toContain("NOTES FROM HUMAN");

    const notesContent = readFileSync(join(tmgDir, NOTES_FILE), "utf-8");
    expect(notesContent).not.toContain("Focus on the API endpoint");
  });

  it("includes handoff context in retry prompt", async () => {
    writeTasks("- [!] Retry task");
    writeFileSync(join(tmgDir, HANDOFF_FILE), "Left off at step 3");
    writeConfig("MAX_RETRIES=3\nTIMEOUT_MINUTES=1\nTASK_DELAY_SECONDS=0\nIDLE_POLL_SECONDS=0\n");

    let capturedPrompt = "";
    const capturingSpawn = mockPtySpawn(0, {
      onPromptWritten(prompt) {
        capturedPrompt = prompt;
      },
    });

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: capturingSpawn,
      maxIterations: 2,
      onLog: (msg) => logs.push(msg),
    });

    expect(capturedPrompt).toContain("Left off at step 3");
    expect(capturedPrompt).toContain("CONTEXT FROM PREVIOUS ATTEMPT");
    expect(capturedPrompt).toContain("attempt 2/3");
  });

  it("cleans up handoff on success", async () => {
    writeTasks("- [!] Task with handoff");
    writeFileSync(join(tmgDir, HANDOFF_FILE), "Some context");
    writeConfig("MAX_RETRIES=3\nTIMEOUT_MINUTES=1\nTASK_DELAY_SECONDS=0\nIDLE_POLL_SECONDS=0\n");

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: mockPtySpawn(0),
      maxIterations: 2,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [x] Task with handoff");
    expect(existsSync(join(tmgDir, HANDOFF_FILE))).toBe(false);
  });

  it("idles when no tasks are available", async () => {
    writeTasks("# Empty task list\n");
    writeConfig("IDLE_POLL_SECONDS=0\nTASK_DELAY_SECONDS=0\n");

    await runDaemon({
      projectDir: tmpDir,
      spawnFn: mockPtySpawn(0),
      maxIterations: 2,
      onLog: (msg) => logs.push(msg),
    });

    expect(logs.filter((l) => l.includes("No tasks")).length).toBe(2);
  });
});
