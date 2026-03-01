Start the Trismegistus daemon to continuously run tasks from the queue.

**Important:** `tmg start` is a long-running daemon that needs its own terminal. Do NOT run it inline here.

Run this command in a **separate terminal**:

```
tmg start
```

The daemon:
- Picks up pending tasks from `.trismegistus/tasks.md`
- Opens a VS Code tunnel for remote editor access (QR code)
- Idles and watches for new tasks when the queue is empty

**Note:** To monitor sessions remotely, enable remote control in your Claude Code settings (`remote_control: true` for all sessions).

$ARGUMENTS
