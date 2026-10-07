#!/bin/sh
# Entry point for Claude Desktop's MCP connection over SSH (npm run mcp:install -- --ssh user@host).
# Runs the stdio MCP server from this checkout as the xpanel service user; stdout is the protocol.
cd "$(dirname "$0")/.." || exit 1
if [ "$(id -u)" = "0" ] && id xpanel >/dev/null 2>&1; then
  exec runuser -u xpanel -- env HOME=/opt/x-panel node node_modules/tsx/dist/cli.mjs scripts/mcp.ts
fi
exec node node_modules/tsx/dist/cli.mjs scripts/mcp.ts
