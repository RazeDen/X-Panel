/**
 * npm run mcp - MCP server for Claude Desktop (stdio). Exposes the dashboard data as tools.
 *
 * Claude Desktop starts this process from its own working directory, so it first moves to the
 * project root (the folder above scripts/) to find .env and data/analytics.db.
 * stdout carries the MCP protocol: anything else must go to stderr.
 */
import path from "node:path";

console.log = console.error;
console.info = console.error;
const root = path.resolve(path.dirname(process.argv[1] ?? "."), "..");
process.chdir(root);

async function main() {
  const { loadEnv } = await import("../src/lib/env");
  loadEnv();
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { createMcpServer } = await import("../src/lib/mcp/server");
  await createMcpServer().connect(new StdioServerTransport());
  console.error(`x-analytics MCP server running (project: ${root})`);
}

main().catch((err) => {
  console.error(`x-analytics MCP server failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
