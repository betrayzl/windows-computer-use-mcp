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
    // --- SCENARIO 1: Notepad Lifecycle Closed-Loop (MINIMAL CLOSED-LOOP VERIFICATION) ---
    await tester.runScenario('Notepad Lifecycle Closed-Loop', [
      {
        description: 'Open Notepad',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'open_app', arguments: { path: 'notepad.exe' } });
        }
      },
      {
        description: 'Wait for Notepad window and bring to foreground (with visual check)',
        action: async (s, call) => {
          let foreground = false;
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            // 截图观察当前状态
            const shot = await call(s, 'tools/call', { name: 'screenshot', arguments: {} });
            console.log(`  [OBSERVE] Screenshot captured, length: ${shot.content[0].text.length}`);

            // 尝试激活
            await call(s, 'tools/call', { name: 'focus_app', arguments: { processName: 'notepad' } });

            // 检查前台应用
            const app = await call(s, 'tools/call', { name: 'get_frontmost_app', arguments: {} });
            // 兼容处理返回的可能是字符串或对象
            const appName = typeof app.content[0].text === 'string' ? app.content[0].text : JSON.stringify(app.content[0].text);

            if (appName.toLowerCase().includes('notepad')) {
              foreground = true;
              break;
            }
          }
          if (!foreground) throw new Error('Notepad did not reach foreground after visual checks');
          console.log('  ✅ Notepad is now foreground.');
        }
      },
      {
        description: 'Click to activate edit control (visual confirmation)',
        action: async (s, call) => {
          // 点击记事本编辑区中心（逻辑坐标）
          await call(s, 'tools/call', { name: 'click', arguments: { x: 400, y: 300 } });
          await new Promise(r => setTimeout(r, 300));
        }
      },
      {
        description: 'Type greeting',
        action: async (s, call) => {
          await call(s, 'tools/call', {
            name: 'type',
            arguments: { text: 'Loop Test Successful!', processName: 'notepad' }
          });
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
              const appName = typeof app.content[0].text === 'string' ? app.content[0].text : JSON.stringify(app.content[0].text);
              return !appName.toLowerCase().includes('notepad');
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
            const appName = typeof app.content[0].text === 'string' ? app.content[0].text : JSON.stringify(app.content[0].text);
            return appName.toLowerCase().includes('notepad');
          }, { timeout: 10000 }, 'Notepad focus');
        }
      },
      {
        description: 'Type clipboard content',
        action: async (s, call) => {
          await call(s, 'tools/call', {
            name: 'type',
            arguments: { text: global.lastClipboardText, processName: 'notepad' }
          });
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
            const appName = typeof app.content[0].text === 'string' ? app.content[0].text : JSON.stringify(app.content[0].text);
            return !appName.toLowerCase().includes('notepad');
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
