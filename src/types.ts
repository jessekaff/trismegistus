export type TaskStatus = " " | "~" | "x" | "!" | "!!" | "!!!";

export interface Task {
  status: TaskStatus;
  text: string;
  line: number;
}

export interface Config {
  maxRetries: number;
  timeoutMinutes: number;
  idlePollSeconds: number;
  taskDelaySeconds: number;
}

export interface RunResult {
  success: boolean;
  exitCode: number;
  timedOut: boolean;
}

export const DEFAULT_CONFIG: Config = {
  maxRetries: 3,
  timeoutMinutes: 30,
  idlePollSeconds: 10,
  taskDelaySeconds: 5,
};

export const VERSION = "0.1.0";

export const DIR_NAME = ".trismegistus";
export const CONFIG_FILE = "config";
export const TASKS_FILE = "tasks.md";
export const NOTES_FILE = "notes.md";
export const HANDOFF_FILE = "handoff";

export const TASKS_TEMPLATE = `# Tasks — one per line
# - [ ] = pending   - [x] = done
# - [!] = failed once (retrying)  - [!!] = twice  - [!!!] = gave up

- [ ] Example: replace with your first real task
`;

export const NOTES_TEMPLATE = `# Notes for Claude — write here, cleared after each read
`;

export const CONFIG_TEMPLATE = `# Trismegistus Configuration
MAX_RETRIES=3
TIMEOUT_MINUTES=30
IDLE_POLL_SECONDS=10
TASK_DELAY_SECONDS=5
`;

export const STATUS_PRIORITY: TaskStatus[] = [" ", "!", "!!"];
