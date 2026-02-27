import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DIR_NAME,
  CONFIG_FILE,
  TASKS_FILE,
  NOTES_FILE,
  CONFIG_TEMPLATE,
  TASKS_TEMPLATE,
  NOTES_TEMPLATE,
} from "./types.js";

interface InitResult {
  created: string[];
  skipped: string[];
}

export function initProject(projectDir: string): InitResult {
  const tmgDir = join(projectDir, DIR_NAME);
  const result: InitResult = { created: [], skipped: [] };

  if (!existsSync(tmgDir)) {
    mkdirSync(tmgDir, { recursive: true });
  }

  const files: Array<{ name: string; content: string }> = [
    { name: CONFIG_FILE, content: CONFIG_TEMPLATE },
    { name: TASKS_FILE, content: TASKS_TEMPLATE },
    { name: NOTES_FILE, content: NOTES_TEMPLATE },
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

  return result;
}
