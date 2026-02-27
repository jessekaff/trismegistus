import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DIR_NAME,
  CONFIG_FILE,
  TASKS_FILE,
  NOTES_FILE,
  README_FILE,
  CONFIG_TEMPLATE,
  TASKS_TEMPLATE,
  NOTES_TEMPLATE,
  README_TEMPLATE,
  GITIGNORE_ENTRIES,
  CLAUDE_COMMANDS,
} from "./types.js";

interface InitResult {
  created: string[];
  skipped: string[];
}

export function initProject(projectDir: string): InitResult {
  const tmgDir = join(projectDir, DIR_NAME);
  const claudeCommandsDir = join(projectDir, ".claude", "commands");
  const result: InitResult = { created: [], skipped: [] };

  if (!existsSync(tmgDir)) {
    mkdirSync(tmgDir, { recursive: true });
  }

  if (!existsSync(claudeCommandsDir)) {
    mkdirSync(claudeCommandsDir, { recursive: true });
  }

  const files: Array<{ name: string; content: string }> = [
    { name: CONFIG_FILE, content: CONFIG_TEMPLATE },
    { name: TASKS_FILE, content: TASKS_TEMPLATE },
    { name: NOTES_FILE, content: NOTES_TEMPLATE },
    { name: README_FILE, content: README_TEMPLATE },
  ];

  for (const file of files) {
    const path = join(tmgDir, file.name);
    if (existsSync(path)) {
      result.skipped.push(file.name);
    } else {
      writeFileSync(path, file.content);
      result.created.push(file.name);
    }
  }

  for (const cmd of CLAUDE_COMMANDS) {
    const path = join(claudeCommandsDir, cmd.name);
    if (existsSync(path)) {
      result.skipped.push(`.claude/commands/${cmd.name}`);
    } else {
      writeFileSync(path, cmd.content);
      result.created.push(`.claude/commands/${cmd.name}`);
    }
  }

  // Add transient files to .gitignore
  const gitignorePath = join(projectDir, ".gitignore");
  let gitignoreContent = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf-8")
    : "";

  const missing = GITIGNORE_ENTRIES.filter(
    (entry) => !gitignoreContent.includes(entry),
  );

  if (missing.length > 0) {
    const block = missing.join("\n") + "\n";
    const needsNewline =
      gitignoreContent.length > 0 && !gitignoreContent.endsWith("\n");
    gitignoreContent += (needsNewline ? "\n" : "") + block;
    writeFileSync(gitignorePath, gitignoreContent);
    result.created.push(".gitignore entries");
  }

  return result;
}
