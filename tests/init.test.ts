import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initProject } from "../src/init.js";
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
} from "../src/types.js";

let tmpDir: string;

const commandPaths = CLAUDE_COMMANDS.map((c) => `.claude/commands/${c.name}`);

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tmg-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("initProject", () => {
  it("creates .trismegistus directory with all files", () => {
    const result = initProject(tmpDir);

    expect(result.created).toEqual([
      TASKS_FILE, NOTES_FILE, CONFIG_FILE, README_FILE,
      ...commandPaths, ".gitignore entries",
    ]);
    expect(result.skipped).toEqual([]);

    const tmgDir = join(tmpDir, DIR_NAME);
    expect(existsSync(tmgDir)).toBe(true);
    expect(readFileSync(join(tmgDir, CONFIG_FILE), "utf-8")).toBe(CONFIG_TEMPLATE);
    expect(readFileSync(join(tmgDir, TASKS_FILE), "utf-8")).toBe(TASKS_TEMPLATE);
    expect(readFileSync(join(tmgDir, NOTES_FILE), "utf-8")).toBe(NOTES_TEMPLATE);
    expect(readFileSync(join(tmgDir, README_FILE), "utf-8")).toBe(README_TEMPLATE);

    // Verify claude commands were created
    const commandsDir = join(tmpDir, ".claude", "commands");
    expect(existsSync(commandsDir)).toBe(true);
    for (const cmd of CLAUDE_COMMANDS) {
      expect(existsSync(join(commandsDir, cmd.name))).toBe(true);
    }

    // Verify .gitignore was created with transient file entries
    const gitignore = readFileSync(join(tmpDir, ".gitignore"), "utf-8");
    for (const entry of GITIGNORE_ENTRIES) {
      expect(gitignore).toContain(entry);
    }
  });

  it("is idempotent — preserves user data, updates managed files", () => {
    initProject(tmpDir);

    // Modify user data
    const tasksPath = join(tmpDir, DIR_NAME, TASKS_FILE);
    writeFileSync(tasksPath, "- [ ] My custom task\n");

    const result = initProject(tmpDir);

    const updatedCommands = commandPaths.map((p) => `${p} (updated)`);
    expect(result.created).toEqual([
      `${CONFIG_FILE} (updated)`,
      `${README_FILE} (updated)`,
      ...updatedCommands,
    ]);
    expect(result.skipped).toEqual([TASKS_FILE, NOTES_FILE]);

    // Verify user data was preserved
    expect(readFileSync(tasksPath, "utf-8")).toBe("- [ ] My custom task\n");

    // Verify managed files were updated to latest templates
    const tmgDir = join(tmpDir, DIR_NAME);
    expect(readFileSync(join(tmgDir, CONFIG_FILE), "utf-8")).toBe(CONFIG_TEMPLATE);
    expect(readFileSync(join(tmgDir, README_FILE), "utf-8")).toBe(README_TEMPLATE);
  });

  it("creates only missing user files when some exist", () => {
    const tmgDir = join(tmpDir, DIR_NAME);
    mkdirSync(tmgDir, { recursive: true });
    writeFileSync(join(tmgDir, TASKS_FILE), "- [ ] Existing task\n");

    const result = initProject(tmpDir);

    expect(result.created).toEqual([
      NOTES_FILE, CONFIG_FILE, README_FILE, ...commandPaths, ".gitignore entries",
    ]);
    expect(result.skipped).toEqual([TASKS_FILE]);

    // User data preserved
    expect(readFileSync(join(tmgDir, TASKS_FILE), "utf-8")).toBe("- [ ] Existing task\n");
  });

  it("appends to existing .gitignore without duplicating", () => {
    writeFileSync(join(tmpDir, ".gitignore"), "node_modules/\n");
    initProject(tmpDir);

    const gitignore = readFileSync(join(tmpDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("node_modules/");
    for (const entry of GITIGNORE_ENTRIES) {
      expect(gitignore).toContain(entry);
    }

    // Run again — should not duplicate
    const result = initProject(tmpDir);
    expect(result.created).not.toContain(".gitignore entries");

    const gitignore2 = readFileSync(join(tmpDir, ".gitignore"), "utf-8");
    for (const entry of GITIGNORE_ENTRIES) {
      const count = gitignore2.split(entry).length - 1;
      expect(count).toBe(1);
    }
  });
});
