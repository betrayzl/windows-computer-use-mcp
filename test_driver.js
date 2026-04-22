import { spawn } from 'child_process';
import path from 'path';

const serverPath = 'D:/windows-computer-use-mcp/bundle/index.js';
let requestId = 0;

/**
 * Core tool caller with timeout support
 */
async function callTool(server, method, params, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

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
            if (response.error) {
              reject(new Error(response.error.message || 'Unknown error'));
            } else {
              resolve(response.result);
            }
            return;
          }
        } catch (e) {
          // Ignore partial JSON lines
        }
      }
    };

    server.stdout.on('data', onData);
  });
}

/**
 * Polling-based wait utility
 */
async function waitForCondition(conditionFn, { timeout = 10000, interval = 500 } = {}, label = "Condition") {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await conditionFn();
    if (result) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

/**
 * Scenario Engine
 */
class ScenarioTester {
  constructor(server) {
    this.server = server;
  }

  async runScenario(name, steps) {
    console.log(`\n🎬 STARTING SCENARIO: ${name}`);
    try {
      for (const step of steps) {
        console.log(`  ➡️ Executing: ${step.description}`);
        await step.action(this.server, callTool);
      }
      console.log(`✅ SCENARIO COMPLETED SUCCESSFULLY: ${name}\n`);
    } catch (err) {
      console.error(`❌ SCENARIO FAILED: ${name}`);
      console.error(`   Reason: ${err.message}\n`);
      throw err;
    }
  }
}

/**
 * Main Test Runner
 */
async function runAutomatedTest() {
  console.log('====================================================');
  console.log('🚀 STARTING SCENARIO-BASED LONG-CHAIN TEST SUITE');
  console.log('====================================================');

  const server = spawn('node', [serverPath]);

  server.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('JSON-RPC')) {
      console.log(`[Server Log] ${msg.trim()}`);
    }
  });

  const tester = new ScenarioTester(server);

  try {
    // --- SCENARIO 1: Notepad Lifecycle Closed-Loop (Enhanced with robust activation) ---
    await tester.runScenario('Notepad Lifecycle Closed-Loop', [
      {
        description: 'Open Notepad',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'open_app', arguments: { path: 'notepad.exe' } });
        }
      },
      {
        description: 'Wait for Notepad to be active (Polling)',
        action: async (s, call) => {
          await waitForCondition(
            async () => {
              const app = await call(s, 'tools/call', { name: 'get_frontmost_app', arguments: {} });
              return app.content[0].text.toLowerCase().includes('notepad');
            },
            { timeout: 10000 },
            'Notepad window presence and focus'
          );
        }
      },
      {
        description: 'Type greeting',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'type', arguments: { text: 'Loop Test Successful!' } });
        }
      },
      {
        description: 'Close Notepad (Alt+F4)',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'key', arguments: { sequence: 'alt+f4' } });
        }
      },
      {
        description: 'Verify Notepad is gone (Polling)',
        action: async (s, call) => {
          await waitForCondition(
            async () => {
              const app = await call(s, 'tools/call', { name: 'get_frontmost_app', arguments: {} });
              return !app.content[0].text.toLowerCase().includes('notepad');
            },
            { timeout: 10000 },
            'Notepad window disappearance'
          );
        }
      }
    ]);

    // --- SCENARIO 2: Clipboard & Multi-tasking ---
    await tester.runScenario('Clipboard & Focus Workflow', [
      {
        description: 'Write to clipboard',
        action: async (s, call) => {
          const text = 'Scenario Data ' + Date.now();
          await call(s, 'tools/call', { name: 'write_clipboard', arguments: { text } });
          global.lastClipboardText = text;
        }
      },
      {
        description: 'Open Notepad to verify clipboard',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'open_app', arguments: { path: 'notepad.exe' } });
        }
      },
      {
        description: 'Wait for Notepad to be active (Polling)',
        action: async (s, call) => {
          await waitForCondition(async () => {
            const app = await call(s, 'tools/call', { name: 'get_frontmost_app', arguments: {} });
            return app.content[0].text.toLowerCase().includes('notepad');
          }, { timeout: 10000 }, 'Notepad focus');
        }
      },
      {
        description: 'Type clipboard content',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'type', arguments: { text: global.lastClipboardText } });
        }
      },
      {
        description: 'Close Notepad',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'key', arguments: { sequence: 'alt+f4' } });
        }
      },
      {
        description: 'Final check: Notepad is gone',
        action: async (s, call) => {
          await waitForCondition(async () => {
            const app = await call(s, 'tools/call', { name: 'get_frontmost_app', arguments: {} });
            return !app.content[0].text.toLowerCase().includes('notepad');
          }, { timeout: 10000 }, 'Notepad disappearance');
        }
      }
    ]);

    console.log('\n====================================================');
    console.log('🎉 ALL SCENARIOS COMPLETED SUCCESSFULLY');
    console.log('====================================================');

  } catch (err) {
    console.error('\n❌ TEST SUITE CRASHED!');
    console.error('Error details:', err.message);
  } finally {
    console.log('\nCleaning up server...');
    server.kill();
    console.log('Done.');
  }
}

runAutomatedTest();
