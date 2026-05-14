import { spawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";

export interface BrowserOpenCommand {
  command: string;
  args: string[];
}

export interface BrowserOpenResult {
  ok: boolean;
  command: BrowserOpenCommand;
  error?: Error;
}

type BrowserSpawn = (command: string, args: string[], options: SpawnOptions) => BrowserChild;

interface BrowserChild {
  once(event: "spawn", listener: () => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  unref?: () => void;
}

export function browserOpenCommand(url: string, platform: NodeJS.Platform = process.platform): BrowserOpenCommand {
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  return { command: "xdg-open", args: [url] };
}

export async function openBrowser(
  url: string,
  options: { platform?: NodeJS.Platform; spawn?: BrowserSpawn } = {}
): Promise<BrowserOpenResult> {
  const command = browserOpenCommand(url, options.platform);
  const spawnBrowser = options.spawn ?? ((cmd, args, spawnOptions) => spawn(cmd, args, spawnOptions) as ChildProcess);

  return new Promise(resolve => {
    let settled = false;
    const settle = (result: BrowserOpenResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child: BrowserChild;
    try {
      child = spawnBrowser(command.command, command.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
    } catch (error) {
      settle({ ok: false, command, error: error instanceof Error ? error : new Error(String(error)) });
      return;
    }

    child.once("spawn", () => {
      child.unref?.();
      settle({ ok: true, command });
    });
    child.once("error", error => {
      settle({ ok: false, command, error });
    });
  });
}
