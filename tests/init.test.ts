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
  CONFIG_TEMPLATE,
  TASKS_TEMPLATE,
  NOTES_TEMPLATE,
} from "../src/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tmg-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("initProject", () => {
  it("creates .trismegistus directory with all files", () => {
    const result = initProject(tmpDir);

    expect(result.created).toEqual([CONFIG_FILE, TASKS_FILE, NOTES_FILE]);
    expect(result.skipped).toEqual([]);

    const tmgDir = join(tmpDir, DIR_NAME);
    expect(existsSync(tmgDir)).toBe(true);
    expect(readFileSync(join(tmgDir, CONFIG_FILE), "utf-8")).toBe(CONFIG_TEMPLATE);
    expect(readFileSync(join(tmgDir, TASKS_FILE), "utf-8")).toBe(TASKS_TEMPLATE);
    expect(readFileSync(join(tmgDir, NOTES_FILE), "utf-8")).toBe(NOTES_TEMPLATE);
  });

  it("is idempotent — skips existing files", () => {
    initProject(tmpDir);

    // Modify a file
    const tasksPath = join(tmpDir, DIR_NAME, TASKS_FILE);
    writeFileSync(tasksPath, "- [ ] My custom task\n");

    const result = initProject(tmpDir);

    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([CONFIG_FILE, TASKS_FILE, NOTES_FILE]);

    // Verify custom content was preserved
    expect(readFileSync(tasksPath, "utf-8")).toBe("- [ ] My custom task\n");
  });

  it("creates only missing files when some exist", () => {
    const tmgDir = join(tmpDir, DIR_NAME);
    mkdirSync(tmgDir, { recursive: true });
    writeFileSync(join(tmgDir, CONFIG_FILE), "MAX_RETRIES=5\n");

    const result = initProject(tmpDir);

    expect(result.created).toEqual([TASKS_FILE, NOTES_FILE]);
    expect(result.skipped).toEqual([CONFIG_FILE]);

    // Existing file preserved
    expect(readFileSync(join(tmgDir, CONFIG_FILE), "utf-8")).toBe("MAX_RETRIES=5\n");
  });
});
