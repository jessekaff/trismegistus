Start the Trismegistus daemon to continuously run tasks from the queue.

**Important:** `tmg start` is a long-running daemon that needs its own terminal. Do NOT run it inline here.

Run this command in a **separate terminal**:

```
tmg start
```

The daemon:
- Picks up pending tasks from `.trismegistus/tasks.md`
- Opens a VS Code tunnel for remote editor access (QR code)
- Activates /remote-control for each Claude session so you can monitor from claude.ai/code or the Claude mobile app
- Idles and watches for new tasks when the queue is empty

$ARGUMENTS
