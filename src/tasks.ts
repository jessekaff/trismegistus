import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  Task,
  TaskStatus,
  DIR_NAME,
  TASKS_FILE,
  NOTES_FILE,
  HANDOFF_FILE,
  STATUS_PRIORITY,
} from "./types.js";

const TASK_REGEX = /^- \[([^\]]*)\] (.+)$/;

function tasksPath(projectDir: string): string {
  return join(projectDir, DIR_NAME, TASKS_FILE);
}

function notesPath(projectDir: string): string {
  return join(projectDir, DIR_NAME, NOTES_FILE);
}

function handoffPath(projectDir: string): string {
  return join(projectDir, DIR_NAME, HANDOFF_FILE);
}

export function parseTasks(content: string): Task[] {
  const tasks: Task[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TASK_REGEX);
    if (match) {
      const status = match[1] as TaskStatus;
      tasks.push({ status, text: match[2], line: i + 1 });
    }
  }

  return tasks;
}

export function readTasks(projectDir: string): Task[] {
  const path = tasksPath(projectDir);
  if (!existsSync(path)) return [];
  return parseTasks(readFileSync(path, "utf-8"));
}

export function getNextTask(projectDir: string): Task | null {
  const tasks = readTasks(projectDir);

  for (const status of STATUS_PRIORITY) {
    const task = tasks.find((t) => t.status === status);
    if (task) return task;
  }

  return null;
}

export function setTaskStatus(
  projectDir: string,
  taskText: string,
  newStatus: TaskStatus,
): void {
  const path = tasksPath(projectDir);
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TASK_REGEX);
    if (match && match[2] === taskText) {
      lines[i] = `- [${newStatus}] ${taskText}`;
      break;
    }
  }

  writeFileSync(path, lines.join("\n"));
}

export function getTaskCounts(projectDir: string): Record<string, number> {
  const tasks = readTasks(projectDir);
  return {
    pending: tasks.filter((t) => t.status === " ").length,
    inProgress: tasks.filter((t) => t.status === "~").length,
    done: tasks.filter((t) => t.status === "x").length,
    failed1: tasks.filter((t) => t.status === "!").length,
    failed2: tasks.filter((t) => t.status === "!!").length,
    gaveUp: tasks.filter((t) => t.status === "!!!").length,
  };
}

export function resetGaveUpTasks(projectDir: string): number {
  const path = tasksPath(projectDir);
  if (!existsSync(path)) return 0;

  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TASK_REGEX);
    if (match && match[1] === "!!!") {
      lines[i] = `- [ ] ${match[2]}`;
      count++;
    }
  }

  if (count > 0) writeFileSync(path, lines.join("\n"));
  return count;
}

export function readAndClearNotes(projectDir: string): string {
  const path = notesPath(projectDir);
  if (!existsSync(path)) return "";

  const content = readFileSync(path, "utf-8");
  const notes = content
    .split("\n")
    .filter((l) => !l.startsWith("#") && l.trim() !== "")
    .slice(0, 50)
    .join("\n");

  writeFileSync(
    path,
    "# Notes for Claude — write here, cleared after each read\n",
  );
  return notes;
}

export function readHandoff(projectDir: string): string {
  const path = handoffPath(projectDir);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function writeHandoff(projectDir: string, content: string): void {
  writeFileSync(handoffPath(projectDir), content);
}

export function deleteHandoff(projectDir: string): void {
  const path = handoffPath(projectDir);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function getAttemptFromStatus(status: TaskStatus): number {
  switch (status) {
    case "!":
      return 2;
    case "!!":
      return 3;
    default:
      return 1;
  }
}

export function getFailureStatus(attempt: number): TaskStatus {
  if (attempt === 1) return "!";
  if (attempt === 2) return "!!";
  return "!!!";
}
