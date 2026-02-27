import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(import.meta.dirname, "..", "src", "cli.ts");

function run(args: string[], cwd?: string): string {
  return execFileSync("npx", ["tsx", CLI, ...args], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf-8",
    timeout: 10000,
  });
}

describe("CLI", () => {
  it("shows version with --version", () => {
    const output = run(["--version"]);
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("shows help with --help", () => {
    const output = run(["--help"]);
    expect(output).toContain("Trismegistus");
    expect(output).toContain("init");
    expect(output).toContain("start");
    expect(output).toContain("status");
    expect(output).toContain("reset");
  });

  it("init creates .trismegistus folder", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "tmg-cli-"));
    try {
      const output = run(["init"], tmpDir);
      expect(output).toContain("Created config");
      expect(output).toContain("Created tasks.md");
      expect(output).toContain("Created notes.md");

      // Second init skips existing files
      const output2 = run(["init"], tmpDir);
      expect(output2).toContain("Skipped config");
      expect(output2).toContain("Skipped tasks.md");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("status shows task counts after init", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "tmg-cli-"));
    try {
      run(["init"], tmpDir);
      const output = run(["status"], tmpDir);
      expect(output).toContain("Pending:");
      expect(output).toContain("Done:");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("reset with no gave-up tasks", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "tmg-cli-"));
    try {
      run(["init"], tmpDir);
      const output = run(["reset"], tmpDir);
      expect(output).toContain("No gave-up tasks");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
