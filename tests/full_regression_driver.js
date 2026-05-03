import { spawn } from 'child_process';

const serverPath = 'D:/windows-computer-use-mcp/bundle/index.js';
let requestId = 0;

async function callTool(server, method, params, timeoutMs = 30000) {
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
            if (response.error) {
              reject(new Error(response.error.message || 'Unknown error'));
            } else {
              resolve(response.result);
            }
            return;
          }
        } catch (e) { /* 忽略不完整 JSON */ }
      }
    };
    server.stdout.on('data', onData);
  });
}

async function isProcessInForeground(server, processName) {
  const result = await callTool(server, 'tools/call', {
    name: 'get_frontmost_app',
    arguments: {}
  });
  const app = JSON.parse(result.content[0].text);
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

class TestRunner {
  constructor(server) {
    this.server = server;
    this.passed = 0;
    this.failed = 0;
  }

  async runTest(name, fn) {
    console.log(`\n🔍 ${name}`);
    try {
      await fn(this.server);
      console.log(`  ✅ PASSED`);
      this.passed++;
    } catch (err) {
      console.log(`  ❌ FAILED — ${err.message}`);
      this.failed++;
    }
  }

  printSummary() {
    console.log('\n================================================');
    console.log(`✅ PASSED: ${this.passed}  |  ❌ FAILED: ${this.failed}`);
    console.log('================================================');
    if (this.failed === 0) {
      console.log('🎉 ALL REGRESSION TESTS PASSED');
    } else {
      console.log('⚠️  Some tests failed. Review output above.');
    }
  }
}

async function runFullRegression() {
  console.log('================================================');
  console.log('🚀 FULL REGRESSION TEST SUITE (Phase 1 Baseline)');
  console.log('================================================');

  const server = spawn('node', [serverPath]);
  server.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('JSON-RPC')) console.log(`[Server] ${msg.trim()}`);
  });

  const runner = new TestRunner(server);

  try {
    // ---- 1. 非破坏性感知 ----
    await runner.runTest('Screenshot returns valid content', async () => {
      const res = await callTool(server, 'tools/call', { name: 'screenshot', arguments: {} });
      const content = res.content[0].text;
      let base64 = content;
      try { const p = JSON.parse(content); base64 = p.base64 || content; } catch {}
      if (!base64.startsWith('data:image/') && base64.length < 100) throw new Error('No valid image data');
    });

    await runner.runTest('Get display size', async () => {
      const res = await callTool(server, 'tools/call', { name: 'get_display_size', arguments: {} });
      const geo = JSON.parse(res.content[0].text);
      if (!geo.width || !geo.height || !geo.scaleFactor) throw new Error('Incomplete geometry');
    });

    await runner.runTest('List installed apps', async () => {
      const res = await callTool(server, 'tools/call', { name: 'list_installed_apps', arguments: {} });
      const apps = JSON.parse(res.content[0].text);
      if (!Array.isArray(apps)) throw new Error('Not an array');
    });

    await runner.runTest('Get frontmost app returns valid object', async () => {
      const res = await callTool(server, 'tools/call', { name: 'get_frontmost_app', arguments: {} });
      const app = JSON.parse(res.content[0].text);
      if (!app.displayName && !app.bundleId) throw new Error('Empty app info');
    });

    // ---- 2. 剪贴板 ----
    await runner.runTest('Write & read clipboard', async () => {
      const testText = 'REG_TEST_' + Date.now();
      await callTool(server, 'tools/call', { name: 'write_clipboard', arguments: { text: testText } });
      const res = await callTool(server, 'tools/call', { name: 'read_clipboard', arguments: {} });
      const text = res.content[0].text.trim();
      if (text !== testText) throw new Error(`Mismatch: expected "${testText}", got "${text}"`);
    });

    // ---- 3. 键鼠操作 ----
    await runner.runTest('Move mouse', async () => {
      await callTool(server, 'tools/call', { name: 'move_mouse', arguments: { x: 200, y: 200 } });
    });

    await runner.runTest('Click', async () => {
      await callTool(server, 'tools/call', { name: 'click', arguments: { x: 200, y: 200, button: 'left' } });
    });

    await runner.runTest('Scroll', async () => {
      await callTool(server, 'tools/call', { name: 'scroll', arguments: { x: 200, y: 200, dx: 0, dy: 120 } });
    });

    await runner.runTest('Drag', async () => {
      await callTool(server, 'tools/call', { name: 'drag', arguments: { from: { x: 200, y: 200 }, to: { x: 300, y: 300 } } });
    });

    await runner.runTest('Single key (Esc)', async () => {
      await callTool(server, 'tools/call', { name: 'key', arguments: { sequence: 'escape' } });
    });

    await runner.runTest('Combo key (Ctrl+A)', async () => {
      await callTool(server, 'tools/call', { name: 'key', arguments: { sequence: 'ctrl+a' } });
    });

    // ---- 4. 应用生命周期 ----
    const processName = 'notepad';  // 使用 const 避免后续修改，确保作用域正确

    // 清理可能遗留的记事本进程
    await runner.runTest('Cleanup existing Notepad', async () => {
      let attempts = 0;
      while (await isProcessInForeground(server, processName) && attempts < 3) {
        await callTool(server, 'tools/call', { name: 'focus_app', arguments: { processName } });
        await new Promise(r => setTimeout(r, 300));
        await callTool(server, 'tools/call', { name: 'key', arguments: { sequence: 'alt+f4' } });
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
      }
      if (await isProcessInForeground(server, processName)) {
        throw new Error('Unable to clean up existing Notepad before test');
      }
    });

    await runner.runTest('Open Notepad', async () => {
      await callTool(server, 'tools/call', { name: 'open_app', arguments: { path: 'notepad.exe' } });
      await waitForCondition(() => isProcessInForeground(server, processName), { timeout: 10000 }, 'Notepad foreground');
    });

    await runner.runTest('Type text into Notepad', async () => {
      await callTool(server, 'tools/call', { name: 'type', arguments: { text: 'Full Regression OK' } });
      await new Promise(r => setTimeout(r, 300));
    });

    await runner.runTest('Focus Notepad explicitly', async () => {
      await callTool(server, 'tools/call', { name: 'focus_app', arguments: { processName } });
      await new Promise(r => setTimeout(r, 500));
      if (!(await isProcessInForeground(server, processName))) {
        throw new Error('Notepad not frontmost after focus_app');
      }
    });

    await runner.runTest('Close Notepad with Alt+F4 and verify', async () => {
      await callTool(server, 'tools/call', { name: 'focus_app', arguments: { processName } });
      await new Promise(r => setTimeout(r, 300));
      await callTool(server, 'tools/call', { name: 'key', arguments: { sequence: 'alt+f4' } });
      await new Promise(r => setTimeout(r, 1000));
      if (await isProcessInForeground(server, processName)) {
        throw new Error('Notepad still in foreground after Alt+F4');
      }
    });

    runner.printSummary();
  } catch (err) {
    console.error('\nFATAL ERROR DURING REGRESSION:', err.message);
  } finally {
    console.log('\nShutting down MCP server...');
    server.kill();
    console.log('Done.');
  }
}

runFullRegression();