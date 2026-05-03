import { spawn } from 'child_process';
import path from 'path';

const serverPath = 'D:/windows-computer-use-mcp/bundle/index.js';
let requestId = 0;

async function callTool(server, method, params, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = { jsonrpc: '2.0', id, method, params };
    server.stdin.write(JSON.stringify(request) + '\n');

    const timer = setTimeout(() => {
      server.stdout.removeListener('data', onData);
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let buffer = '';
    const onData = (data) => {
      const chunk = data.toString();
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const response = JSON.parse(trimmed);
          if (response.id === id) {
            clearTimeout(timer);
            server.stdout.removeListener('data', onData);
            resolve(response);
          }
        } catch (e) {}
      }
    };
    server.stdout.on('data', onData);
  });
}

async function debugScreenshot() {
  console.log('🚀 Starting raw screenshot debug...');
  const server = spawn('node', [serverPath]);

  server.stderr.on('data', (data) => {
    console.log(`[Server Error Log] ${data.toString().trim()}`);
  });

  try {
    const res = await callTool(server, 'tools/call', { name: 'screenshot', arguments: {} });
    console.log('\n--- RAW OUTPUT START ---');
    console.log('Type:', typeof res.result.content[0].text);
    console.log('Length:', res.result.content[0].text.length);
    console.log('Content Preview (first 500 chars):');
    console.log(res.result.content[0].text.substring(0, 500));
    console.log('--- RAW OUTPUT END ---\n');
  } catch (err) {
    console.error('❌ Error during screenshot call:', err.message);
  } finally {
    server.kill();
    console.log('Done.');
  }
}

debugScreenshot();
