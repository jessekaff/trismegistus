import { execFileSync, spawn, type ChildProcess } from "node:child_process";

export type EditorCli = "cursor" | "code";

export function detectEditorCli(): EditorCli {
  // Cursor sets TERM_PROGRAM=cursor in its integrated terminal
  if (process.env.TERM_PROGRAM === "cursor") return "cursor";

  // Cursor also sets CURSOR_TRACE_DIR
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

export function isVSCodeAvailable(): boolean {
  return cliExists("code");
}

export function isCursorDetected(): boolean {
  return detectEditorCli() === "cursor";
}

export interface TunnelResult {
  url: string;
  process: ChildProcess;
}

export interface TunnelOptions {
  onOutput?: (line: string) => void;
}

export function startTunnel(name: string, options: TunnelOptions = {}): Promise<TunnelResult> {
  if (!isVSCodeAvailable()) {
    return Promise.reject(
      new Error(
        '"code" CLI not found. Install VS Code or download the standalone CLI: https://code.visualstudio.com/docs/editor/command-line',
      ),
    );
  }

  // Tunnel labels must match [\w-=]{1,50} — strip dots and invalid chars
  const safeName = name.replace(/[^\w-=]/g, "").slice(0, 50) || "tmg-tunnel";

  return new Promise((resolve, reject) => {
    const child = spawn(
      "code",
      ["tunnel", "--name", safeName, "--accept-server-license-terms"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    let settled = false;
    const TIMEOUT_MS = 120_000;

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
        : `Timed out waiting for tunnel URL. You may need to authenticate — run \`code tunnel\` manually first.`;
      settle(() => reject(new Error(msg)));
    }, TIMEOUT_MS);

    function handleOutput(text: string, isStderr: boolean) {
      if (isStderr) stderr += text;
      if (options.onOutput) {
        for (const line of text.split("\n").filter(Boolean)) {
          options.onOutput(line);
        }
      }
      const match = text.match(/(https:\/\/vscode\.dev\/tunnel\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        settle(() => resolve({ url: match[1], process: child }));
      }
    }

    child.stderr?.on("data", (chunk: Buffer) => handleOutput(chunk.toString(), true));
    child.stdout?.on("data", (chunk: Buffer) => handleOutput(chunk.toString(), false));

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
