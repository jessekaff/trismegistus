#!/usr/bin/env bash
set -uo pipefail

VERSION="0.1.0"
PROJECT_DIR="$(pwd)"
TASKS_FILE="$PROJECT_DIR/TASKS.md"
NOTES_FILE="$PROJECT_DIR/NOTES.md"
HANDOFF_FILE="$PROJECT_DIR/.tmg-handoff"
MAX_MINUTES=30
MAX_ATTEMPTS=3

cmd_help() {
  echo ""
  echo "  tmg v${VERSION} — Task Manager for Claude Code"
  echo ""
  echo "  Usage:"
  echo "    tmg init       Create TASKS.md and NOTES.md in current directory"
  echo "    tmg start      Start running tasks from TASKS.md"
  echo "    tmg status     Show task counts"
  echo "    tmg help       Show this message"
  echo ""
}

cmd_init() {
  if [[ -f "$TASKS_FILE" ]]; then
    echo "  TASKS.md already exists."
  else
    cat > "$TASKS_FILE" << 'EOF'
# Tasks — one per line
# - [ ] = pending   - [x] = done
# - [!] = failed once (retrying)  - [!!] = twice  - [!!!] = gave up

- [ ] Example: replace with your first real task
EOF
    echo "  ✅ Created TASKS.md"
  fi

  if [[ -f "$NOTES_FILE" ]]; then
    echo "  NOTES.md already exists."
  else
    echo "# Notes for Claude — write here, cleared after each read" > "$NOTES_FILE"
    echo "  ✅ Created NOTES.md"
  fi

  echo ""
  echo "  Add your tasks to TASKS.md, then run: tmg start"
  echo ""
}

cmd_status() {
  if [[ ! -f "$TASKS_FILE" ]]; then
    echo "  No TASKS.md found. Run: tmg init"
    return
  fi

  local pending done failed_1 failed_2 failed_3 in_progress
  pending=$(grep -c '^\- \[ \]' "$TASKS_FILE" 2>/dev/null || echo 0)
  in_progress=$(grep -c '^\- \[~\]' "$TASKS_FILE" 2>/dev/null || echo 0)
  done=$(grep -c '^\- \[x\]' "$TASKS_FILE" 2>/dev/null || echo 0)
  failed_1=$(grep -c '^\- \[!\]' "$TASKS_FILE" 2>/dev/null || echo 0)
  failed_2=$(grep -c '^\- \[!!\]' "$TASKS_FILE" 2>/dev/null || echo 0)
  failed_3=$(grep -c '^\- \[!!!\]' "$TASKS_FILE" 2>/dev/null || echo 0)

  echo ""
  echo "  📋 TMG Status"
  echo "  ─────────────"
  echo "  ⏳ Pending:       $pending"
  echo "  🔄 In Progress:   $in_progress"
  echo "  ✅ Done:          $done"
  echo "  ⚠️  Retrying (!):  $failed_1"
  echo "  ⚠️  Retrying (!!): $failed_2"
  echo "  🚫 Gave up (!!!): $failed_3"
  echo ""
}

get_next_task() {
  grep -m1 '^\- \[\(  *\|~\|!\|!!\)\]' "$TASKS_FILE" | sed 's/^- \[[^]]*\] //'
}

get_task_status() {
  local task="$1"
  local escaped
  escaped=$(printf '%s' "$task" | sed 's/[[\.*^$()+?{|]/\\&/g')
  grep "^\- \[[^]]*\] ${escaped}$" "$TASKS_FILE" | sed 's/^- \[\([^]]*\)\].*/\1/' | head -1
}

set_task_status() {
  local task="$1" status="$2"
  local escaped
  escaped=$(printf '%s' "$task" | sed 's/[[\.*^$()+?{|]/\\&/g')
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^- \[[^]]*\] ${escaped}/- [${status}] ${escaped}/" "$TASKS_FILE"
  else
    sed -i "s/^- \[[^]]*\] ${escaped}/- [${status}] ${escaped}/" "$TASKS_FILE"
  fi
}

read_and_clear_notes() {
  local notes=""
  if [[ -f "$NOTES_FILE" ]]; then
    notes=$(grep -v '^#' "$NOTES_FILE" | grep -v '^$' | head -50 || true)
    echo "# Notes for Claude — write here, cleared after each read" > "$NOTES_FILE"
  fi
  echo "$notes"
}

cmd_start() {
  if [[ ! -f "$TASKS_FILE" ]]; then
    echo "  No TASKS.md found. Run: tmg init"
    exit 1
  fi

  if ! command -v claude &>/dev/null; then
    echo "  ❌ Claude Code CLI not found."
    echo "  Install: npm install -g @anthropic-ai/claude-code"
    exit 1
  fi

  echo ""
  echo "  🚀 TMG v${VERSION} — $(date)"
  echo "  Project: $PROJECT_DIR"
  echo "  Timeout: ${MAX_MINUTES}m | Max attempts: ${MAX_ATTEMPTS}"
  echo ""

  while true; do
    task=$(get_next_task || true)

    if [[ -z "$task" ]]; then
      echo "[$(date +%H:%M)] 💤 No tasks. Watching TASKS.md..."
      sleep 10
      continue
    fi

    current_status=$(get_task_status "$task")
    case "$current_status" in
      "!")  attempt=2 ;;
      "!!") attempt=3 ;;
      *)    attempt=1 ;;
    esac

    notes=$(read_and_clear_notes)
    notes_section=""
    [[ -n "$notes" ]] && notes_section="

NOTES FROM HUMAN (priority):
$notes"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "▶ [$(date +%H:%M)] $task (attempt ${attempt}/${MAX_ATTEMPTS})"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    set_task_status "$task" "~"

    handoff=""
    if [[ -f "$HANDOFF_FILE" ]]; then
      handoff="

CONTEXT FROM PREVIOUS ATTEMPT (pick up where this left off):
$(cat "$HANDOFF_FILE")"
    fi

    prompt="You are running autonomously overnight (attempt ${attempt}/${MAX_ATTEMPTS}). Complete this task fully, commit your work, don't ask questions.

If you are running low on time, write a summary of what you did and what remains to .tmg-handoff so the next session can continue.${notes_section}${handoff}

Task: $task"

    set +e
    timeout $((MAX_MINUTES * 60)) claude \
      --dangerously-skip-permissions \
      -p "$prompt"
    exit_code=$?
    set -e

    if [[ $exit_code -eq 0 ]]; then
      set_task_status "$task" "x"
      rm -f "$HANDOFF_FILE"
      echo "✅ [$(date +%H:%M)] Done: $task"

    else
      [[ $exit_code -eq 124 ]] && echo "⏰ [$(date +%H:%M)] Timed out" || echo "❌ [$(date +%H:%M)] Exited ($exit_code)"

      if [[ ! -f "$HANDOFF_FILE" ]]; then
        echo "Previous attempt $([ $exit_code -eq 124 ] && echo 'timed out' || echo 'failed'). Check git log and codebase to see what was done. Continue from there." > "$HANDOFF_FILE"
      fi

      if [[ $attempt -ge $MAX_ATTEMPTS ]]; then
        set_task_status "$task" "!!!"
        rm -f "$HANDOFF_FILE"
        echo "🚫 [$(date +%H:%M)] Gave up after ${MAX_ATTEMPTS} attempts: $task"
      else
        bangs=$(printf '!%.0s' $(seq 1 $attempt))
        set_task_status "$task" "$bangs"
        echo "  → Will retry with handoff context..."
      fi
    fi

    sleep 5
  done
}

case "${1:-help}" in
  start)  cmd_start ;;
  init)   cmd_init ;;
  status) cmd_status ;;
  -v|--version) echo "tmg v${VERSION}" ;;
  *)      cmd_help ;;
esac
