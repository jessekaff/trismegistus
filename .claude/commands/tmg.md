Start the Trismegistus daemon to continuously run tasks from the queue.

Run: `tmg start`

The daemon picks up pending tasks from `.trismegistus/tasks.md` and executes them one by one, idling and watching for new tasks when the queue is empty.

$ARGUMENTS
