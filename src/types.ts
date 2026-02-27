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

export const CLAUDE_COMMANDS: Array<{ name: string; content: string }> = [
  {
    name: "tmg.md",
    content: `Start the Trismegistus daemon to continuously run tasks from the queue.

Run: \`tmg start\`

The daemon picks up pending tasks from \`.trismegistus/tasks.md\` and executes them one by one, idling and watching for new tasks when the queue is empty.

$ARGUMENTS
`,
  },
  {
    name: "tmg-status.md",
    content: `Show the current Trismegistus task queue status.

Run: \`tmg status\`

$ARGUMENTS
`,
  },
  {
    name: "tmg-todo.md",
    content: `Add a new task to the Trismegistus task queue.

Run: \`tmg add "<task description>"\`

Task to add: $ARGUMENTS
`,
  },
  {
    name: "tmg-notes.md",
    content: `Add notes to the Trismegistus notes file for the daemon's next task run.

Run: \`tmg notes "<notes text>"\`

The notes are appended to \`.trismegistus/notes.md\` without clearing existing content. Notes are only cleared by the daemon when it reads them during a task run.

Notes to add: $ARGUMENTS
`,
  },
  {
    name: "tmg-remote.md",
    content: `Start a VS Code tunnel for remote/mobile access to this workspace.

Run: \`tmg remote\`

If a tunnel name is provided, run: \`tmg remote --name <name>\`

Tunnel name (optional): $ARGUMENTS
`,
  },
];
