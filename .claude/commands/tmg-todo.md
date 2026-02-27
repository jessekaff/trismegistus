Add a new task to the Trismegistus task queue.

Open `.trismegistus/tasks.md` and append a new pending task line in the format:
```
- [ ] <task description>
```

The task description is: $ARGUMENTS

If no task description is provided, ask the user what task they want to add.

If `.trismegistus/tasks.md` does not exist, tell the user to run `tmg init` first.
