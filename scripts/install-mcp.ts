/**
 * npm run mcp:install - registers this project's MCP server ("x-analytics") in Claude Desktop.
 *
 * Claude Desktop keeps its config in memory and rewrites the file when it saves its own settings,
 * so the entry must be added while the app is fully closed. This script refuses to run while
 * Claude Desktop is open (override with --force), backs the file up, and only touches
 * mcpServers.x-analytics. Paths are taken from where the project lives now, so re-run it after
 * moving the folder. CLAUDE_CONFIG_PATH overrides the config location (used by tests).
 *
 * Remote mode (the project runs on a server): npm run mcp:install -- --ssh root@host [--remote-dir /opt/x-panel/app]
 * makes Claude Desktop start the MCP server on that host over SSH (key-based login required,
 * BatchMode so it never waits for a password). Nothing is exposed on the server: the protocol runs
 * over the SSH session's stdin/stdout.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
const force = process.argv.includes("--force");
const argValue = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sshHost = argValue("--ssh");
const remoteDir = argValue("--remote-dir") ?? "/opt/x-panel/app";
const SERVER = "x-analytics";

function configPath(): string {
  if (process.env.CLAUDE_CONFIG_PATH) return process.env.CLAUDE_CONFIG_PATH;
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

/** True when the Claude Desktop app (not the Claude Code CLI) is running. */
function desktopRunning(): boolean {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("powershell", ["-NoProfile", "-Command", "Get-Process -Name claude -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }"], { encoding: "utf8" });
      return /WindowsApps\\Claude_|AnthropicClaude/i.test(out);
    }
    if (process.platform === "darwin") return execFileSync("pgrep", ["-f", "Claude.app/Contents/MacOS"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    // pgrep exits non-zero when nothing matches
  }
  return false;
}

const slash = (p: string) => p.split(path.sep).join("/");
function sshCommand(): string {
  const win = path.join(process.env.WINDIR ?? "C:/Windows", "System32", "OpenSSH", "ssh.exe");
  return process.platform === "win32" && fs.existsSync(win) ? slash(win) : "ssh";
}
const entry = sshHost
  ? {
      command: sshCommand(),
      args: [
        "-o", "BatchMode=yes", "-o", "ServerAliveInterval=30", "-o", "ConnectTimeout=15", sshHost,
        // A plain script path (no shell operators), so no local shell can split the remote command.
        `${remoteDir}/scripts/mcp-remote.sh`,
      ],
      // Windows OpenSSH exits silently without ProgramData, which MCP clients may not pass on.
      ...(process.platform === "win32" ? { env: { ProgramData: process.env.ProgramData ?? "C:/ProgramData" } } : {}),
    }
  : {
      command: slash(process.execPath),
      args: [slash(path.join(root, "node_modules", "tsx", "dist", "cli.mjs")), slash(path.join(root, "scripts", "mcp.ts"))],
    };

function main() {
  if (!sshHost && !fs.existsSync(path.join(root, "node_modules", "tsx", "dist", "cli.mjs"))) {
    throw new Error("node_modules/tsx is missing. Run npm install first.");
  }
  if (!process.env.CLAUDE_CONFIG_PATH && !force && desktopRunning()) {
    throw new Error("Claude Desktop is running. Quit it completely first (tray icon -> Quit, or File -> Exit), then run this again. It would otherwise overwrite the change.");
  }
  const file = configPath();
  let config: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, "utf8");
    config = raw.trim() ? JSON.parse(raw) : {};
    const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(file, backup);
    console.log(`Backup: ${backup}`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const servers = (config.mcpServers && typeof config.mcpServers === "object" ? config.mcpServers : {}) as Record<string, unknown>;
  const existed = SERVER in servers;
  config.mcpServers = { ...servers, [SERVER]: entry };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  console.log(`${existed ? "Updated" : "Added"} "${SERVER}" in ${file}`);
  console.log(`  command: ${entry.command}`);
  for (const a of entry.args) console.log(`  arg:     ${a}`);
  console.log("\nNow start Claude Desktop. The tools appear under the + / tools menu of a chat (server \"x-analytics\").");
}

try {
  main();
} catch (err) {
  console.error(`mcp:install failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
