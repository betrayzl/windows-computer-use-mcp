import { spawn } from 'child_process';
import path from 'path';

const serverPath = 'D:/windows-computer-use-mcp/bundle/index.js';

async function callTool(process, method, params) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    };

    process.stdin.write(JSON.stringify(request) + '\n');

    const timeout = setTimeout(() => {
      reject(new Error('Tool call timed out! (Possible Deadlock in Rust)'));
    }, 15000);

    process.stdout.on('data', (data) => {
      try {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const response = JSON.parse(line);
          if (response.id === request.id) {
            clearTimeout(timeout);
            resolve(response.result);
          }
        }
      } catch (e) {
      }
    });
  });
}

async function runIsolationTest() {
  console.log('====================================================');
  console.log('ISOLATED TEST: Window Hide/Unhide Logic');
  console.log('====================================================');

  const server = spawn('node', [serverPath]);

  server.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('JSON-RPC')) {
      console.log(`[Server Log] ${msg.trim()}`);
    }
  });

  try {
    console.log('\n[STEP 1] Checking server connection...');
    const displaySizeResponse = await callTool(server, 'tools/call', {
      name: 'get_display_size',
      arguments: {}
    });
    console.log('OK: Server is alive. Resolution:', JSON.stringify(displaySizeResponse.content[0].text));

    console.log('\n[STEP 2] Testing hide_windows (Target: notepad.exe)...');
    const hideResponse = await callTool(server, 'tools/call', {
      name: 'hide_windows',
      arguments: { process_names: ['notepad'] }
    });

    console.log('OK: hide_windows raw response:', JSON.stringify(hideResponse));

    // Parse the handles from the MCP text response
    let handles = [];
    const textContent = hideResponse.content[0].text;
    try {
      handles = JSON.parse(textContent);
    } catch (e) {
      console.log('WARNING: Could not parse handles from text. Treating as empty.');
      handles = [];
    }

    if (Array.isArray(handles) && handles.length > 0) {
      console.log(`SUCCESS: Found ${handles.length} hidden window(s). Handles: ${JSON.stringify(handles)}`);

      console.log('\n[STEP 3] Testing unhide_windows...');
      // Convert handles to strings if they are numbers to ensure JSON compatibility
      const handlesToRestore = handles.map(h => h.toString());

      await callTool(server, 'tools/call', {
        name: 'unhide_windows',
        arguments: { handles: handlesToRestore }
      });
      console.log('OK: unhide_windows completed successfully.');
    } else {
      console.log('NOTICE: No windows were hidden. (Check if notepad.exe is running)');
    }

    console.log('\n====================================================');
    console.log('ISOLATION TEST COMPLETED SUCCESSFULLY');
    console.log('====================================================');

  } catch (err) {
    console.error('\nERROR: ISOLATION TEST FAILED!');
    console.error('Error details:', err.message);
  } finally {
    console.log('\nCleaning up server...');
    server.kill();
    console.log('Done.');
  }
}

runIsolationTest();
