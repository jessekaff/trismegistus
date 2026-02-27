import { execFileSync, spawn, type ChildProcess } from "node:child_process";

export function checkCodeCli(): void {
  try {
    execFileSync("which", ["code"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "VS Code CLI (code) not found. Install VS Code or download the standalone CLI: https://code.visualstudio.com/docs/editor/command-line",
    );
  }
}

export interface TunnelResult {
  url: string;
  process: ChildProcess;
}

export function startTunnel(name: string): Promise<TunnelResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "code",
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
      const match = text.match(/(https:\/\/vscode\.dev\/tunnel\/[^\s]+)/);
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
