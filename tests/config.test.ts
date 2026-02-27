import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseConfigFile, loadConfig } from "../src/config.js";
import { DEFAULT_CONFIG, DIR_NAME, CONFIG_FILE } from "../src/types.js";

describe("parseConfigFile", () => {
  it("parses valid key=value pairs", () => {
    const content = `MAX_RETRIES=5\nTIMEOUT_MINUTES=60`;
    expect(parseConfigFile(content)).toEqual({
      maxRetries: 5,
      timeoutMinutes: 60,
    });
  });

  it("ignores comments and blank lines", () => {
    const content = `# A comment\n\nMAX_RETRIES=2\n# another\n`;
    expect(parseConfigFile(content)).toEqual({ maxRetries: 2 });
  });

  it("ignores unrecognized keys", () => {
    const content = `UNKNOWN_KEY=99\nMAX_RETRIES=4`;
    expect(parseConfigFile(content)).toEqual({ maxRetries: 4 });
  });

  it("ignores invalid values (negative, non-numeric)", () => {
    const content = `MAX_RETRIES=abc\nTIMEOUT_MINUTES=-5`;
    expect(parseConfigFile(content)).toEqual({});
  });

  it("accepts zero values", () => {
    const content = `IDLE_POLL_SECONDS=0\nTASK_DELAY_SECONDS=0`;
    expect(parseConfigFile(content)).toEqual({
      idlePollSeconds: 0,
      taskDelaySeconds: 0,
    });
  });

  it("handles values with extra whitespace", () => {
    const content = `  MAX_RETRIES  =  7  `;
    expect(parseConfigFile(content)).toEqual({ maxRetries: 7 });
  });

  it("returns empty object for empty content", () => {
    expect(parseConfigFile("")).toEqual({});
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "tmg-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    expect(loadConfig(tmpDir)).toEqual(DEFAULT_CONFIG);
  });

  it("merges partial overrides with defaults", () => {
    const configDir = join(tmpDir, DIR_NAME);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, CONFIG_FILE), "MAX_RETRIES=5\n");

    expect(loadConfig(tmpDir)).toEqual({
      ...DEFAULT_CONFIG,
      maxRetries: 5,
    });
  });

  it("returns defaults for a config file with only comments", () => {
    const configDir = join(tmpDir, DIR_NAME);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, CONFIG_FILE), "# just a comment\n");

    expect(loadConfig(tmpDir)).toEqual(DEFAULT_CONFIG);
  });
});
