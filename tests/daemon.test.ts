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
import { EventEmitter } from "node:events";
import { preflight, runDaemon } from "../src/daemon.js";
import { initProject } from "../src/init.js";
import type { SpawnFn } from "../src/runner.js";
import type { ChildProcess } from "node:child_process";
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

function createMockChild(exitCode: number): ChildProcess {
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
    kill: () => {
      setTimeout(() => emitter.emit("exit", exitCode, null), 0);
      return true;
    },
    send: () => true,
    disconnect: () => {},
    unref: () => {},
    ref: () => {},
    [Symbol.dispose]: () => {},
  });
  // Exit after a short delay to simulate process completion
  setTimeout(() => emitter.emit("exit", exitCode, null), 1);
  return child as unknown as ChildProcess;
}

/**
 * Creates a mock SpawnFn that captures the prompt and exits with the given code.
 */
function mockSpawn(exitCode: number, opts?: { onPrompt?: (prompt: string) => void }): SpawnFn {
  return (_command, args, _cwd) => {
    // The prompt is the second arg: ["-p", prompt, "--dangerously-skip-permissions"]
    const prompt = args[1];
    opts?.onPrompt?.(prompt);
    return createMockChild(exitCode);
  };
}

/** Mock that simulates an immediate failure */
function failSpawn(exitCode: number): SpawnFn {
  return () => createMockChild(exitCode);
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
      spawnFn: mockSpawn(0),
      maxIterations: 2,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [x] Build feature");
    expect(logs.some((l) => l.includes("Done: Build feature"))).toBe(true);
  });

  it("retries a failed task with escalating status", async () => {
    writeTasks("- [ ] Flaky task");
    writeConfig("MAX_RETRIES=3\nTIMEOUT_MINUTES=1\nTASK_DELAY_SECONDS=0\nIDLE_POLL_SECONDS=0\n");

    // First attempt: fails
    await runDaemon({
      projectDir: tmpDir,
      spawnFn: failSpawn(1),
      maxIterations: 1,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [!] Flaky task");
    expect(existsSync(join(tmgDir, HANDOFF_FILE))).toBe(true);

    // Second attempt: fails again
    await runDaemon({
      projectDir: tmpDir,
      spawnFn: failSpawn(1),
      maxIterations: 1,
      onLog: (msg) => logs.push(msg),
    });

    expect(readTasks()).toContain("- [!!] Flaky task");

    // Third attempt: fails → gave up
    await runDaemon({
      projectDir: tmpDir,
      spawnFn: failSpawn(1),
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
      spawnFn: failSpawn(124),
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
    const capturingSpawn = mockSpawn(0, {
      onPrompt(prompt) {
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

    // Notes should be cleared
    const notesContent = readFileSync(join(tmgDir, NOTES_FILE), "utf-8");
    expect(notesContent).not.toContain("Focus on the API endpoint");
  });

  it("includes handoff context in retry prompt", async () => {
    writeTasks("- [!] Retry task");
    writeFileSync(join(tmgDir, HANDOFF_FILE), "Left off at step 3");
    writeConfig("MAX_RETRIES=3\nTIMEOUT_MINUTES=1\nTASK_DELAY_SECONDS=0\nIDLE_POLL_SECONDS=0\n");

    let capturedPrompt = "";
    const capturingSpawn = mockSpawn(0, {
      onPrompt(prompt) {
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
      spawnFn: mockSpawn(0),
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
      spawnFn: mockSpawn(0),
      maxIterations: 2,
      onLog: (msg) => logs.push(msg),
    });

    expect(logs.filter((l) => l.includes("No tasks")).length).toBe(2);
  });
});
