import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseTasks,
  readTasks,
  getNextTask,
  setTaskStatus,
  getTaskCounts,
  resetGaveUpTasks,
  addTask,
  readAndClearNotes,
  readHandoff,
  writeHandoff,
  deleteHandoff,
  getAttemptFromStatus,
  getFailureStatus,
} from "../src/tasks.js";
import { DIR_NAME, TASKS_FILE, NOTES_FILE, HANDOFF_FILE } from "../src/types.js";

let tmpDir: string;
let tmgDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tmg-test-"));
  tmgDir = join(tmpDir, DIR_NAME);
  mkdirSync(tmgDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTasks(content: string) {
  writeFileSync(join(tmgDir, TASKS_FILE), content);
}

function readTasksFile(): string {
  return readFileSync(join(tmgDir, TASKS_FILE), "utf-8");
}

describe("parseTasks", () => {
  it("parses all task status types", () => {
    const content = [
      "- [ ] Pending task",
      "- [~] In progress",
      "- [x] Done task",
      "- [!] Failed once",
      "- [!!] Failed twice",
      "- [!!!] Gave up",
    ].join("\n");

    const tasks = parseTasks(content);
    expect(tasks).toHaveLength(6);
    expect(tasks[0]).toEqual({ status: " ", text: "Pending task", line: 1 });
    expect(tasks[1]).toEqual({ status: "~", text: "In progress", line: 2 });
    expect(tasks[2]).toEqual({ status: "x", text: "Done task", line: 3 });
    expect(tasks[3]).toEqual({ status: "!", text: "Failed once", line: 4 });
    expect(tasks[4]).toEqual({ status: "!!", text: "Failed twice", line: 5 });
    expect(tasks[5]).toEqual({ status: "!!!", text: "Gave up", line: 6 });
  });

  it("ignores comments and blank lines", () => {
    const content = "# Comment\n\n- [ ] Real task\n# Another comment\n";
    const tasks = parseTasks(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe("Real task");
  });

  it("returns empty array for empty content", () => {
    expect(parseTasks("")).toEqual([]);
  });
});

describe("getNextTask", () => {
  it("returns first pending task", () => {
    writeTasks("- [x] Done\n- [ ] First pending\n- [ ] Second pending");
    const task = getNextTask(tmpDir);
    expect(task?.text).toBe("First pending");
    expect(task?.status).toBe(" ");
  });

  it("prefers pending over retryable", () => {
    writeTasks("- [!] Failed\n- [ ] Pending");
    const task = getNextTask(tmpDir);
    expect(task?.text).toBe("Pending");
  });

  it("returns retryable task when no pending", () => {
    writeTasks("- [x] Done\n- [!] Retry me");
    const task = getNextTask(tmpDir);
    expect(task?.text).toBe("Retry me");
  });

  it("returns null when all tasks are done or gave up", () => {
    writeTasks("- [x] Done\n- [!!!] Gave up");
    expect(getNextTask(tmpDir)).toBeNull();
  });

  it("returns null for empty task file", () => {
    writeTasks("# Just a comment\n");
    expect(getNextTask(tmpDir)).toBeNull();
  });
});

describe("setTaskStatus", () => {
  it("updates a task status", () => {
    writeTasks("- [ ] My task");
    setTaskStatus(tmpDir, "My task", "~");
    expect(readTasksFile()).toBe("- [~] My task");
  });

  it("only updates the first matching task", () => {
    writeTasks("- [ ] Task A\n- [ ] Task B");
    setTaskStatus(tmpDir, "Task A", "x");
    const content = readTasksFile();
    expect(content).toContain("- [x] Task A");
    expect(content).toContain("- [ ] Task B");
  });

  it("returns false when task not found", () => {
    writeTasks("- [ ] Task A");
    const result = setTaskStatus(tmpDir, "Nonexistent", "x");
    expect(result).toBe(false);
    expect(readTasksFile()).toBe("- [ ] Task A");
  });

  it("returns true when task is updated", () => {
    writeTasks("- [ ] Task A");
    const result = setTaskStatus(tmpDir, "Task A", "x");
    expect(result).toBe(true);
  });

  it("handles failure status escalation", () => {
    writeTasks("- [ ] Failing task");
    setTaskStatus(tmpDir, "Failing task", "!");
    expect(readTasksFile()).toContain("- [!] Failing task");

    setTaskStatus(tmpDir, "Failing task", "!!");
    expect(readTasksFile()).toContain("- [!!] Failing task");

    setTaskStatus(tmpDir, "Failing task", "!!!");
    expect(readTasksFile()).toContain("- [!!!] Failing task");
  });
});

describe("getTaskCounts", () => {
  it("counts all status types", () => {
    writeTasks([
      "- [ ] P1",
      "- [ ] P2",
      "- [~] IP1",
      "- [x] D1",
      "- [x] D2",
      "- [x] D3",
      "- [!] F1",
      "- [!!] F2",
      "- [!!!] G1",
    ].join("\n"));

    expect(getTaskCounts(tmpDir)).toEqual({
      pending: 2,
      inProgress: 1,
      done: 3,
      failed1: 1,
      failed2: 1,
      gaveUp: 1,
    });
  });

  it("returns all zeros for empty file", () => {
    writeTasks("# Empty\n");
    expect(getTaskCounts(tmpDir)).toEqual({
      pending: 0,
      inProgress: 0,
      done: 0,
      failed1: 0,
      failed2: 0,
      gaveUp: 0,
    });
  });
});

describe("resetGaveUpTasks", () => {
  it("resets gave-up tasks to pending", () => {
    writeTasks("- [!!!] Task A\n- [x] Task B\n- [!!!] Task C");
    const count = resetGaveUpTasks(tmpDir);
    expect(count).toBe(2);
    const content = readTasksFile();
    expect(content).toContain("- [ ] Task A");
    expect(content).toContain("- [x] Task B");
    expect(content).toContain("- [ ] Task C");
  });

  it("returns 0 when no gave-up tasks", () => {
    writeTasks("- [x] Done\n- [ ] Pending");
    expect(resetGaveUpTasks(tmpDir)).toBe(0);
  });
});

describe("addTask", () => {
  it("appends a task with correct format", () => {
    writeTasks("- [ ] Existing task\n");
    addTask(tmpDir, "New task");
    expect(readTasksFile()).toBe("- [ ] Existing task\n- [ ] New task\n");
  });

  it("handles file without trailing newline", () => {
    writeTasks("- [ ] Existing task");
    addTask(tmpDir, "New task");
    expect(readTasksFile()).toBe("- [ ] Existing task\n- [ ] New task\n");
  });

  it("appends to empty file", () => {
    writeTasks("");
    addTask(tmpDir, "First task");
    expect(readTasksFile()).toBe("- [ ] First task\n");
  });

  it("throws when tasks file does not exist", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "tmg-empty-"));
    expect(() => addTask(emptyDir, "Nope")).toThrow("Run `tmg init` first");
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it("throws when task text is empty", () => {
    writeTasks("- [ ] Existing task\n");
    expect(() => addTask(tmpDir, "")).toThrow("Task text cannot be empty");
    expect(() => addTask(tmpDir, "   ")).toThrow("Task text cannot be empty");
  });
});

describe("readAndClearNotes", () => {
  it("reads non-comment lines and clears the file", () => {
    const notesPath = join(tmgDir, NOTES_FILE);
    writeFileSync(notesPath, "# Header\nImportant note\nAnother note\n");

    const notes = readAndClearNotes(tmpDir);
    expect(notes).toBe("Important note\nAnother note");

    const cleared = readFileSync(notesPath, "utf-8");
    expect(cleared).toBe("# Notes for Claude — write here, cleared after each read\n");
  });

  it("returns empty string when no notes file", () => {
    expect(readAndClearNotes(tmpDir)).toBe("");
  });

  it("returns empty string when only comments", () => {
    writeFileSync(join(tmgDir, NOTES_FILE), "# Just a header\n");
    expect(readAndClearNotes(tmpDir)).toBe("");
  });
});

describe("handoff", () => {
  it("writes and reads handoff content", () => {
    writeHandoff(tmpDir, "Left off at step 3");
    expect(readHandoff(tmpDir)).toBe("Left off at step 3");
  });

  it("returns empty string when no handoff file", () => {
    expect(readHandoff(tmpDir)).toBe("");
  });

  it("deletes handoff file", () => {
    writeHandoff(tmpDir, "Some context");
    deleteHandoff(tmpDir);
    expect(readHandoff(tmpDir)).toBe("");
  });
});

describe("getAttemptFromStatus", () => {
  it("returns correct attempt number", () => {
    expect(getAttemptFromStatus(" ")).toBe(1);
    expect(getAttemptFromStatus("!")).toBe(2);
    expect(getAttemptFromStatus("!!")).toBe(3);
  });
});

describe("getFailureStatus", () => {
  it("returns correct failure status", () => {
    expect(getFailureStatus(1)).toBe("!");
    expect(getFailureStatus(2)).toBe("!!");
    expect(getFailureStatus(3)).toBe("!!!");
  });
});
