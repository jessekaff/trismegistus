import { execFileSync, spawn, type ChildProcess } from "node:child_process";

export type EditorCli = "cursor" | "code";

export function detectEditorCli(): EditorCli {
  // Cursor sets TERM_PROGRAM=cursor in its integrated terminal
  if (process.env.TERM_PROGRAM === "cursor") return "cursor";

  // Cursor also sets VSCODE_PID but with a different resolvedShell
  // Check for Cursor-specific env vars
  if (process.env.CURSOR_TRACE_DIR) return "cursor";

  return "code";
}

function cliExists(cli: string): boolean {
  try {
    execFileSync("which", [cli], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function checkCodeCli(): EditorCli {
  const detected = detectEditorCli();

  if (cliExists(detected)) return detected;

  // Fall back to the other option
  const fallback: EditorCli = detected === "cursor" ? "code" : "cursor";
  if (cliExists(fallback)) return fallback;

  throw new Error(
    `Neither "cursor" nor "code" CLI found. Install VS Code or Cursor, or download the standalone CLI: https://code.visualstudio.com/docs/editor/command-line`,
  );
}

export interface TunnelResult {
  url: string;
  process: ChildProcess;
}

export function startTunnel(name: string, cli: EditorCli = "code"): Promise<TunnelResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      cli,
      ["tunnel", "--name", name, "--accept-server-license-terms"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    let settled = false;
    const TIMEOUT_MS = 60_000;

    function settle(fn: () => void) {
      if (!settled) {
        settled = true;
        fn();
      }
    }

    const timer = setTimeout(() => {
      child.kill();
      const msg = stderr
        ? `Timed out waiting for tunnel URL. stderr:\n${stderr}`
        : "Timed out waiting for tunnel URL. You may need to authenticate — run `code tunnel` manually first.";
      settle(() => reject(new Error(msg)));
    }, TIMEOUT_MS);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/(https:\/\/(?:vscode|cursor)\.dev\/tunnel\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        settle(() => resolve({ url: match[1], process: child }));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      settle(() => reject(err));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      settle(() => reject(new Error(`code tunnel exited with code ${code}. stderr:\n${stderr}`)));
    });
  });
}
