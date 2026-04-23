import { spawn } from 'child_process';

const serverPath = 'D:/windows-computer-use-mcp/bundle/index.js';
let requestId = 0;

async function callTool(server, method, params, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    const timer = setTimeout(() => {
      server.stdout.removeListener('data', onData);
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    let buffer = '';
    const onData = (data) => {
      buffer += data.toString();
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
            if (response.error) reject(new Error(response.error.message || 'Unknown error'));
            else resolve(response.result);
            return;
          }
        } catch (e) { /* partial JSON */ }
      }
    };
    server.stdout.on('data', onData);
  });
}

function parseFrontmostApp(rawText) {
  try { return JSON.parse(rawText); } catch { return {}; }
}

async function isProcessInForeground(server, call, processName) {
  const result = await call(server, 'tools/call', { name: 'get_frontmost_app', arguments: {} });
  const app = parseFrontmostApp(result.content[0].text);
  return (app.bundleId || '').toLowerCase().includes(processName.toLowerCase());
}

async function waitForCondition(conditionFn, { timeout = 10000, interval = 500 } = {}, label = 'Condition') {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await conditionFn()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

// —— 修正后的关闭函数：先强制焦点，再发 Alt+F4 ——
async function closeNotepadSafely(server, call) {
  // 强制激活记事本（确保 Alt+F4 不会错发给其他窗口）
  await call(server, 'tools/call', { name: 'focus_app', arguments: { processName: 'notepad' } });
  await new Promise(r => setTimeout(r, 500));

  // 发送 Alt+F4
  await call(server, 'tools/call', { name: 'key', arguments: { sequence: 'alt+f4' } });
  // 给窗口足够时间关闭
  await new Promise(r => setTimeout(r, 1000));
}

class ScenarioTester {
  constructor(server) { this.server = server; }
  async runScenario(name, steps) {
    console.log(`\n🎬 STARTING SCENARIO: ${name}`);
    try {
      for (const step of steps) {
        console.log(`  ➡️ Executing: ${step.description}`);
        try {
          const result = await callTool(this.server, 'tools/call', { name: 'get_frontmost_app', arguments: {} });
          const app = parseFrontmostApp(result.content[0].text);
          console.log(`    [DEBUG] Current Frontmost App before step: displayName="${app.displayName}", bundleId="${app.bundleId}"`);
        } catch (e) {
          console.log(`    [DEBUG] Could not get frontmost app: ${e.message}`);
        }
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

async function runAutomatedTest() {
  console.log('====================================================');
  console.log('🚀 STARTING SCENARIO-BASED LONG-CHAIN TEST SUITE');
  console.log('====================================================');

  const server = spawn('node', [serverPath]);
  server.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('JSON-RPC')) console.log(`[Server Log] ${msg.trim()}`);
  });

  const tester = new ScenarioTester(server);
  try {
    // 场景 1
    await tester.runScenario('Notepad Lifecycle Closed-Loop', [
      {
        description: 'Open Notepad',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'open_app', arguments: { path: 'notepad.exe' } });
        }
      },
      {
        description: 'Wait for Notepad active',
        action: async (s, call) => {
          await waitForCondition(() => isProcessInForeground(s, call, 'notepad'), { timeout: 10000 }, 'Notepad focus');
        }
      },
      {
        description: 'Type greeting',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'type', arguments: { text: 'Loop Test Successful!' } });
        }
      },
      {
        description: 'Close Notepad (focus + Alt+F4)',
        action: async (s, call) => {
          await closeNotepadSafely(s, call);
        }
      },
      {
        description: 'Verify Notepad gone',
        action: async (s, call) => {
          await waitForCondition(async () => !(await isProcessInForeground(s, call, 'notepad')), { timeout: 10000 }, 'Notepad disappearance');
        }
      }
    ]);

    // 场景 2
    await tester.runScenario('Clipboard & Focus Workflow', [
      {
        description: 'Write clipboard',
        action: async (s, call) => {
          const text = 'Scenario Data ' + Date.now();
          await call(s, 'tools/call', { name: 'write_clipboard', arguments: { text } });
          global.lastClipboardText = text;
        }
      },
      {
        description: 'Open Notepad',
        action: async (s, call) => {
          await call(s, 'tools/call', { name: 'open_app', arguments: { path: 'notepad.exe' } });
        }
      },
      {
        description: 'Wait for Notepad',
        action: async (s, call) => {
          await waitForCondition(() => isProcessInForeground(s, call, 'notepad'), { timeout: 10000 }, 'Notepad focus');
        }
      },
      {
        description: 'Paste clipboard content',
        action: async (s, call) => {
          // 清空并输入新内容
          await call(s, 'tools/call', { name: 'key', arguments: { sequence: 'ctrl+a' } });
          await new Promise(r => setTimeout(r, 200));
          await call(s, 'tools/call', { name: 'key', arguments: { sequence: 'delete' } });
          await new Promise(r => setTimeout(r, 200));
          await call(s, 'tools/call', { name: 'type', arguments: { text: global.lastClipboardText } });
        }
      },
      {
        description: 'Close Notepad (focus + Alt+F4)',
        action: async (s, call) => {
          await closeNotepadSafely(s, call);
        }
      },
      {
        description: 'Final check',
        action: async (s, call) => {
          await waitForCondition(async () => !(await isProcessInForeground(s, call, 'notepad')), { timeout: 10000 }, 'Notepad disappearance');
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