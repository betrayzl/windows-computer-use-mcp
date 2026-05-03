import { spawn } from 'child_process';

const serverPath = 'D:/windows-computer-use-mcp/bundle/index.js';
let requestId = 0;

async function callRawTool(server, name, args = {}) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } };
    server.stdin.write(JSON.stringify(request) + '\n');
    const timer = setTimeout(() => reject(new Error('Timeout')), 15000);
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
            if (response.error) reject(new Error(response.error.message));
            else resolve(response.result);
            return;
          }
        } catch {}
      }
    };
    server.stdout.on('data', onData);
  });
}

async function runDiagnostics() {
  console.log('========================================');
  console.log('🔬 RAW DIAGNOSTIC — 核心功能原始输出检验');
  console.log('========================================\n');

  const server = spawn('node', [serverPath]);
  server.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('JSON-RPC')) console.log('[Server]', msg.trim());
  });

  // 等待服务器启动
  await new Promise(r => setTimeout(r, 2000));

  try {
    // 1. 视觉能力 —— 截图
    console.log('📸 1. Screenshot (raw)');
    try {
      const res = await callRawTool(server, 'screenshot');
      const rawText = res.content[0].text;
      console.log('   Raw length:', rawText.length);
      // 检查是否以 data:image 开头
      const startsCorrectly = rawText.startsWith('data:image/') || rawText.startsWith('{"base64":"data:image/');
      console.log('   Starts with image header:', startsCorrectly);
      if (!startsCorrectly) console.log('   ❗ First 80 chars:', rawText.substring(0, 80));
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    // 2. 视觉能力 —— 显示器信息
    console.log('\n🖥️  2. Display Geometry (raw)');
    try {
      const res = await callRawTool(server, 'get_display_size');
      const text = res.content[0].text;
      console.log('   Raw output:', text);
      const parsed = JSON.parse(text);
      console.log('   Parsed:', parsed);
      console.log('   Has scaleFactor:', typeof parsed.scaleFactor === 'number');
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    // 3. 键鼠能力 —— 单键与组合键
    console.log('\n⌨️  3. Keyboard — single key (Escape)');
    try {
      await callRawTool(server, 'key', { sequence: 'escape' });
      console.log('   ✅ No error');
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    console.log('\n⌨️  4. Keyboard — combo key (Shift+A)');
    try {
      await callRawTool(server, 'key', { sequence: 'shift+a' });
      console.log('   ✅ No error (Shift+A sent)');
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    console.log('\n🖱️  5. Mouse — move');
    try {
      await callRawTool(server, 'move_mouse', { x: 300, y: 300 });
      console.log('   ✅ No error');
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    console.log('\n🖱️  6. Mouse — click');
    try {
      await callRawTool(server, 'click', { x: 300, y: 300, button: 'left' });
      console.log('   ✅ No error');
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    // 4. 剪贴板 —— 原始读写闭环
    console.log('\n📋 7. Clipboard — write & read raw');
    try {
      const testText = 'RAW_DIAG_' + Date.now();
      await callRawTool(server, 'write_clipboard', { text: testText });
      const res = await callRawTool(server, 'read_clipboard');
      let rawText = res.content[0].text;
      console.log('   Raw clipboard text:', rawText);
      console.log('   Raw length:', rawText.length);
      // 尝试智能剥离可能的多层 JSON 引号
      let cleaned = rawText.trim();
      try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed === 'string') cleaned = parsed;
      } catch {}
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1);
      }
      console.log('   Cleaned text:', cleaned);
      console.log('   Match:', cleaned === testText);
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    // 5. 前台应用识别
    console.log('\n🪟 8. Frontmost App (raw)');
    try {
      const res = await callRawTool(server, 'get_frontmost_app');
      const text = res.content[0].text;
      console.log('   Raw output:', text);
      const parsed = JSON.parse(text);
      console.log('   Has displayName:', !!parsed.displayName);
      console.log('   Has bundleId:', !!parsed.bundleId);
      console.log('   bundleId:', parsed.bundleId);
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    // 6. 应用生命周期闭环（精简版）
    console.log('\n📝 9. App Lifecycle (Notepad open/close)');
    try {
      console.log('   Opening notepad...');
      await callRawTool(server, 'open_app', { path: 'notepad.exe' });
      await new Promise(r => setTimeout(r, 1500));
      
      console.log('   Checking foreground...');
      const fgRes = await callRawTool(server, 'get_frontmost_app');
      const fgApp = JSON.parse(fgRes.content[0].text);
      const isNotepad = (fgApp.bundleId || '').toLowerCase().includes('notepad');
      console.log('   Notepad in foreground:', isNotepad);
      
      console.log('   Typing text...');
      await callRawTool(server, 'type', { text: 'Diagnostic OK' });
      await new Promise(r => setTimeout(r, 300));
      
      console.log('   Focusing and closing...');
      await callRawTool(server, 'focus_app', { processName: 'notepad' });
      await new Promise(r => setTimeout(r, 300));
      await callRawTool(server, 'key', { sequence: 'alt+f4' });
      await new Promise(r => setTimeout(r, 1000));
      
      const afterRes = await callRawTool(server, 'get_frontmost_app');
      const afterApp = JSON.parse(afterRes.content[0].text);
      const stillNotepad = (afterApp.bundleId || '').toLowerCase().includes('notepad');
      console.log('   Notepad closed successfully:', !stillNotepad);
    } catch (e) {
      console.log('   ❌ FAILED:', e.message);
    }

    console.log('\n========================================');
    console.log('🏁 DIAGNOSTIC COMPLETE');
    console.log('请检查以上输出，确认所有功能是否完整');
    console.log('========================================');

  } finally {
    server.kill();
    setTimeout(() => process.exit(0), 500);
  }
}

runDiagnostics();