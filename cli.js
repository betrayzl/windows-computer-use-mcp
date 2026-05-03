#!/usr/bin/env node

/**
 * Windows Computer Use MCP Server — CLI Entry Point
 *
 * Usage:
 *   npx windows-computer-use-mcp
 *   windows-computer-use
 *
 * This starts the MCP server on stdio.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, 'bundle', 'index.js');

const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

child.on('exit', (code) => process.exit(code || 0));
