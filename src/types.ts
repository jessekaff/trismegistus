export type TaskStatus = " " | "~" | "x" | "!" | "!!" | "!!!";

export interface Task {
  status: TaskStatus;
  text: string;
  line: number;
}

export interface Config {
  maxRetries: number;
  timeoutMinutes: number;
  idleTimeoutSeconds: number;
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
  idleTimeoutSeconds: 15,
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
IDLE_TIMEOUT_SECONDS=15
IDLE_POLL_SECONDS=10
TASK_DELAY_SECONDS=5
`;

export const STATUS_PRIORITY: TaskStatus[] = [" ", "!", "!!"];

export const README_FILE = "README.md";

export const README_TEMPLATE = `# .trismegistus

This project uses [Trismegistus](https://www.npmjs.com/package/trismegistus) — a local daemon that runs Claude Code sessions from a task queue.

## Getting started

\`\`\`bash
npm install -D trismegistus
npx tmg init      # already done if you see this file
npx tmg add "your task here"
npx tmg start     # runs tasks autonomously
\`\`\`

## Files in this directory

| File | Tracked | Purpose |
|------|---------|---------|
| \`config\` | Yes | Daemon settings (retries, timeouts) — shared with team |
| \`README.md\` | Yes | This file |
| \`tasks.md\` | No | Personal task queue (gitignored) |
| \`notes.md\` | No | Notes for Claude, cleared after each read (gitignored) |
| \`handoff\` | No | Retry context between failed attempts (gitignored) |

## Commands

- \`tmg add "task"\` — Add a task to the queue
- \`tmg start\` — Start the daemon
- \`tmg status\` — Show task counts
- \`tmg notes "text"\` — Leave notes for Claude's next run
- \`tmg reset\` — Reset gave-up tasks back to pending
- \`tmg remote\` — Start a VS Code tunnel for mobile access
`;

export const GITIGNORE_ENTRIES = [
  ".trismegistus/tasks.md",
  ".trismegistus/notes.md",
  ".trismegistus/handoff",
];

export const CLAUDE_COMMANDS: Array<{ name: string; content: string }> = [
  {
    name: "tmg.md",
    content: `Start the Trismegistus daemon to continuously run tasks from the queue.

**Important:** \`tmg start\` is a long-running daemon that needs its own terminal. Do NOT run it inline here.

Run this command in a **separate terminal**:

\`\`\`
tmg start
\`\`\`

The daemon:
- Picks up pending tasks from \`.trismegistus/tasks.md\`
- Opens a VS Code tunnel for remote editor access (QR code)
- Idles and watches for new tasks when the queue is empty

**Note:** To monitor sessions remotely, enable remote control in your Claude Code settings (\`remote_control: true\` for all sessions).

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
