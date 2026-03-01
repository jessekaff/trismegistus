# trismegistus

A local persistent daemon that runs Claude Code sessions from a task queue. Add tasks to a markdown file, start the daemon, and walk away — it works through your list overnight, retries failures with context, and lets you steer it from your phone.

## Install

```bash
npm install -g trismegistus
```

This gives you the `tmg` command globally — use it from any project.

### Prerequisites

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (`npm install -g @anthropic-ai/claude-code`)

## Quick Start

```bash
# Initialize in your project
tmg init

# Add tasks from the CLI
tmg add "Migrate user model to TypeScript"
tmg add "Write tests for the payment module"

# Start the daemon
tmg start
```

The daemon picks up tasks one at a time, runs each in a full Claude Code session with `--dangerously-skip-permissions`, commits the work, and moves on to the next.

## Commands

| Command | Description |
|---------|-------------|
| `tmg init` | Create `.trismegistus/` folder with config, tasks, notes, and README; adds transient files to `.gitignore` |
| `tmg add "task"` | Add a task to the queue |
| `tmg start` | Start the daemon — runs tasks continuously until the queue is empty |
| `tmg status` | Show counts of pending, in-progress, done, retrying, and gave-up tasks |
| `tmg remote` | Open a VS Code tunnel with QR code for phone access |
| `tmg reset` | Reset all gave-up `[!!!]` tasks back to pending `[ ]` |
| `tmg -v` | Show version |

## Task File Format

Tasks live in `.trismegistus/tasks.md` — plain markdown with checkbox syntax:

```markdown
- [ ] Add authentication to the API
- [ ] Write tests for the payment module
- [ ] Refactor database queries to use connection pooling
```

The daemon updates statuses as it works:

| Marker | Meaning |
|--------|---------|
| `[ ]` | Pending — waiting to run |
| `[~]` | In progress — currently running |
| `[x]` | Done |
| `[!]` | Failed once — will retry |
| `[!!]` | Failed twice — will retry |
| `[!!!]` | Gave up — exceeded max retries |

## Workflows & Use Cases

### Run tasks overnight

The core use case. Queue up a list of tasks before bed, start the daemon, and wake up to completed work.

```bash
# Add your tasks
cat >> .trismegistus/tasks.md << 'EOF'
- [ ] Migrate user model to TypeScript
- [ ] Add input validation to all API routes
- [ ] Write integration tests for the checkout flow
EOF

# Start and let it run
tmg start
```

Each task gets a full Claude Code session with autonomous permissions — it can read files, write code, run commands, and commit.

### Leave notes for Claude

While the daemon is running, drop notes in `.trismegistus/notes.md`. The daemon reads and clears them before starting the next task — so you can steer it locally or from any device that can edit the file.

```bash
echo "Use Prisma instead of raw SQL for the database tasks" >> .trismegistus/notes.md
```

Notes are passed to Claude with priority, so you can redirect approach, add context, or give instructions without stopping the daemon. You can even ask Claude to add new tasks — it will edit `tasks.md` itself, and the daemon picks them up next cycle.

### Add tasks while it's running

The task file is just markdown. Add new lines while the daemon is running and it will pick them up when the current task finishes.

```bash
echo "- [ ] Fix the bug in the login form" >> .trismegistus/tasks.md
```

### Monitor from your phone

`tmg remote` creates a secure tunnel through Microsoft's Azure relay and prints a QR code. Scan it on your phone to get a full editor UI — including terminal access — right in the browser. No port forwarding or same-network requirement.

Works with both VS Code and Cursor — it auto-detects which editor you're using and runs the correct tunnel command.

```bash
tmg remote
```

Prerequisites: VS Code (`code`) or Cursor (`cursor`) CLI installed, GitHub account (one-time device auth on first use).

You can set a custom tunnel name:

```bash
tmg remote --name my-machine
```

### Check progress remotely

```bash
tmg status
```

```
  TMG Status
  ─────────────
  Pending:       3
  In Progress:   1
  Done:          5
  Retrying (!):  0
  Retrying (!!): 0
  Gave up (!!!): 1
```

### Retry failed tasks

When a task fails 3 times, it's marked `[!!!]` and skipped. After fixing the underlying issue, reset all gave-up tasks:

```bash
tmg reset
tmg start
```

### Automatic handoff between retries

When a task fails, Claude writes a handoff summary to `.trismegistus/handoff`. The next attempt receives this context so it can pick up where the previous session left off rather than starting from scratch.

## Configuration

Edit `.trismegistus/config` to tune the daemon:

```
MAX_RETRIES=3           # Attempts per task before giving up
TIMEOUT_MINUTES=30      # Max runtime per task
IDLE_POLL_SECONDS=10    # Poll interval when no tasks available
TASK_DELAY_SECONDS=5    # Pause between tasks
```

## How It Works

1. `tmg start` runs preflight checks (directory exists, Claude CLI installed)
2. The daemon polls `tasks.md` for the next pending or retryable task
3. It reads any human notes from `notes.md` (then clears the file)
4. It reads any handoff context from a previous failed attempt
5. It spawns `claude --dangerously-skip-permissions` with a constructed prompt
6. On success: marks the task `[x]` and moves on
7. On failure: escalates the status (`[ ]` -> `[!]` -> `[!!]` -> `[!!!]`), saves handoff context, and retries
8. When the queue is empty, it idles and watches for new tasks

## Project Structure

```
.trismegistus/
  config          # Daemon configuration (committed)
  README.md       # Explains the folder to collaborators (committed)
  tasks.md        # Your task queue (gitignored)
  notes.md        # Notes for Claude, cleared after each read (gitignored)
  handoff         # Context passed between retry attempts (gitignored, auto-managed)
```

`tmg init` automatically adds the transient files (`tasks.md`, `notes.md`, `handoff`) to your project's `.gitignore`. The `config` and `README.md` are committed so team members share daemon settings and understand the folder.

## License

MIT
