#!/usr/bin/env node
/**
 * My Curator — Local MCP Server
 *
 * Exposes the user's private Curator wiki to MCP-compatible LLM clients
 * (Claude Desktop, etc.) via stdio transport.
 *
 * This server is spawned as a child process by the MCP client — it does NOT
 * require the main Curator web app to be running. It only reads markdown files
 * from the domains folder and responds to tool calls.
 *
 * Usage:
 *   node mcp/server.js [--domains-path /path/to/domains]
 *
 * The generated Claude Desktop config always passes --domains-path explicitly,
 * so behaviour is deterministic regardless of cwd.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStorageAdapter } from './storage/local.js';
import { registerTools } from './tools/index.js';

const args = process.argv.slice(2);
const domainsPathIdx = args.indexOf('--domains-path');
const domainsPath = domainsPathIdx !== -1 ? args[domainsPathIdx + 1] : null;

const storage = createStorageAdapter({ domainsPath });

const server = new Server(
  {
    name: 'my-curator',
    version: '1.0.0',
  },
  {
    capabilities: { tools: {} },
  },
);

registerTools(server, storage);

const transport = new StdioServerTransport();
await server.connect(transport);

// stdio keeps the process alive — exits when the client disconnects.
