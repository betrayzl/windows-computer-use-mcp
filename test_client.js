import { spawn } from 'child_process';
import path from 'path';

// 服务器路径
const serverPath = 'D:/windows-computer-use-mcp/bundle/index.js';

// 创建测试函数
async function callTool(process, method, params) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    };

    console.log(`[Test Client] Sending request: ${method}`);
    process.stdin.write(JSON.stringify(request) + '\n');

    process.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === request.id) {
          resolve(response.result);
        }
      } catch (e) {
        // Ignore non-JSON output
      }
    });

    process.stderr.on('data', (data) => {
      // We don't want to flood the console with server logs
    });

    // 设置超时
    setTimeout(() => reject(new Error('Timeout')), 10000);
  });
}

async function runTest() {
  console.log('🚀 Starting Automated Test Client...');

  const server = spawn('node', [serverPath]);

  // 监听服务器日志（stderr）
  server.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('JSON-RPC')) {
        console.log(`[Server Log] ${msg.trim()}`);
    }
  });

  try {
    // 1. 测试 get_display_size
    console.log('\n--- Testing get_display_size ---');
    const displaySize = await callTool(server, 'tools/call', {
      name: 'get_display_size',
      arguments: {}
    });
    console.log('✅ Result:', JSON.stringify(displaySize, null, 2));

    // 2. 测试 screenshot
    console.log('\n--- Testing screenshot ---');
    const screenshot = await callTool(server, 'tools/call', {
      name: 'screenshot',
      arguments: { exclude: [] }
    });
    console.log('✅ Result: Screenshot returned (base64 length:', screenshot.content[0].text.length, 'bytes)');

    console.log('\n✨ All initial tests passed!');
  } catch (err) {
    console.error('\n❌ Test Failed:', err.message);
  } finally {
    server.kill();
  }
}

runTest();
