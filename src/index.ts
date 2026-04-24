import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WindowsComputerExecutor } from './executor.js';

const executor = new WindowsComputerExecutor();

const server = new Server(
  {
    name: 'windows-computer-use',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Asserts that the given arguments match the expected type.
 * Throws an error if arguments are missing or invalid.
 */
function assertArgs<T>(args: unknown, name: string): T {
  if (!args || typeof args !== 'object') {
    throw new Error(`Tool "${name}" requires arguments, but none were provided.`);
  }
  return args as T;
}

const TOOLS: any[] = [
  {
    name: 'screenshot',
    description: '[EXPENSIVE ~50k tokens] Capture the screen as JPEG. Use only when visual confirmation is necessary. Prefer get_ui_elements, get_frontmost_app, and get_display_size for understanding screen state.',
    inputSchema: {
      type: 'object',
      properties: {
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of process names to exclude from the screenshot (windows will be hidden temporarily).',
        },
      },
    },
  },
  {
    name: 'get_display_size',
    description: 'Get the current display geometry (width, height, and scale factor).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'move_mouse',
    description: 'Move the mouse cursor to the specified logical coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'click',
    description: 'Click the mouse at the specified logical coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', enum: ['left', 'right', 'middle'] },
        count: { type: 'number', default: 1 },
        processName: { type: 'string', description: 'Optional: The process name to ensure is in focus before clicking.' }
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'drag',
    description: 'Drag the mouse from a starting position to an ending position.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
        },
        to: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
        },
      },
      required: ['to'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the mouse wheel.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        dx: { type: 'number' },
        dy: { type: 'number' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'key',
    description: 'Press a key or key combination. Supports single keys (e.g., "escape", "enter") and combinations separated by "+" (e.g., "alt+f4", "ctrl+c", "ctrl+shift+escape").',
    inputSchema: {
      type: 'object',
      properties: {
        sequence: { type: 'string', description: 'The key or key combination to press. Use "+" between keys for combinations.' },
      },
      required: ['sequence'],
    },
  },
  {
    name: 'type',
    description: 'Type a string of text.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_frontmost_app',
    description: 'Get information about the currently focused application.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'hide_windows',
    description: 'Hide windows belonging to specific processes.',
    inputSchema: {
      type: 'object',
      properties: {
        process_names: { type: 'array', items: { type: 'string' } },
      },
      required: ['process_names'],
    },
  },
  {
    name: 'unhide_windows',
    description: 'Restore windows that were previously hidden.',
    inputSchema: {
      type: 'object',
      properties: {
        handles: { type: 'array', items: { type: 'number' } },
      },
      required: ['handles'],
    },
  },
  {
    name: 'list_installed_apps',
    description: 'List all installed applications.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'open_app',
    description: 'Open an application by its path or command.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'focus_app',
    description: 'Activate and bring a window to the foreground by its process name (e.g., "notepad").',
    inputSchema: {
      type: 'object',
      properties: {
        processName: {
          type: 'string',
          description: 'Process name to focus (e.g., "notepad", "chrome")'
        }
      },
      required: ['processName']
    }
  },
  {
    name: 'read_clipboard',
    description: 'Read the current clipboard content.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'write_clipboard',
    description: 'Write text to the clipboard.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_window_rect',
    description: 'Get the bounding rectangle (physical coordinates) of a window by process name. Use with capture_region to screenshot just that window.',
    inputSchema: {
      type: 'object',
      properties: {
        processName: { type: 'string', description: 'Process name (e.g., "notepad", "chrome")' },
      },
      required: ['processName'],
    },
  },
  {
    name: 'capture_region',
    description: '[LOWER COST ~5k tokens vs full screenshot] Capture a specific screen region as base64 JPEG. Region coordinates are in physical pixels. Use get_window_rect to find window coordinates first.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Region left (physical pixels)' },
        y: { type: 'number', description: 'Region top (physical pixels)' },
        width: { type: 'number', description: 'Region width (physical pixels)' },
        height: { type: 'number', description: 'Region height (physical pixels)' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'get_ui_elements',
    description: `[LOW COST ~500 tokens] Returns structured UI element tree of the currently focused window. Each element includes name, control type, bounding rectangle, enabled/visible state. Prefer this over screenshot for understanding what's on screen.`,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'wait',
    description: 'Wait for a specified duration (in seconds). Use this to allow UI rendering to complete before the next operation.',
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: 'Duration in seconds' },
      },
      required: ['duration'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result: any;
    switch (name) {
      case 'screenshot': {
        const { exclude } = assertArgs<{ exclude?: string[] }>(args, name);
        const screenshotResult = exclude
          ? await executor.screenshot({ excludeProcessNames: exclude })
          : await executor.screenshot({});
        return {
          content: [{
            type: 'image',
            data: screenshotResult.base64,
            mimeType: 'image/jpeg',
          }],
        };
      }
      case 'get_display_size': {
        result = await executor.getDisplaySize();
        break;
      }
      case 'move_mouse': {
        const { x, y } = assertArgs<{ x: number; y: number }>(args, name);
        await executor.moveMouse(x, y);
        result = { success: true };
        break;
      }
      case 'click': {
        const { x, y, button, count, processName } = assertArgs<{ x: number; y: number; button?: string; count?: number; processName?: string }>(args, name);
        await executor.click(x, y, (button as 'left' | 'right' | 'middle') || 'left', count || 1, processName);
        result = { success: true };
        break;
      }
      case 'drag': {
        const { from, to } = assertArgs<{ from: { x: number; y: number }; to: { x: number; y: number } }>(args, name);
        await executor.drag(from, to);
        result = { success: true };
        break;
      }
      case 'scroll': {
        const { x, y, dx, dy } = assertArgs<{ x: number; y: number; dx?: number; dy?: number }>(args, name);
        await executor.scroll(x, y, dx || 0, dy || 0);
        result = { success: true };
        break;
      }
      case 'key': {
        const { sequence } = assertArgs<{ sequence: string }>(args, name);
        await executor.key(sequence);
        result = { success: true };
        break;
      }
      case 'type': {
        const { text } = assertArgs<{ text: string }>(args, name);
        await executor.type(text);
        result = { success: true };
        break;
      }
      case 'get_frontmost_app': {
        result = await executor.getFrontmostApp();
        break;
      }
      case 'hide_windows': {
        const { process_names } = assertArgs<{ process_names: string[] }>(args, name);
        result = await executor.hideWindows(process_names);
        break;
      }
      case 'unhide_windows': {
        const { handles } = assertArgs<{ handles: number[] }>(args, name);
        await executor.unhideWindows(handles);
        result = { success: true };
        break;
      }
      case 'list_installed_apps': {
        result = await executor.listInstalledApps();
        break;
      }
      case 'open_app': {
        const { path } = assertArgs<{ path: string }>(args, name);
        await executor.openApp(path);
        result = { success: true };
        break;
      }
      case 'focus_app': {
        const { processName } = assertArgs<{ processName: string }>(args, name);
        const success = await executor.focusApp(processName);
        result = { success };
        break;
      }
      case 'read_clipboard': {
        result = await executor.readClipboard();
        break;
      }
      case 'write_clipboard': {
        const { text } = assertArgs<{ text: string }>(args, name);
        await executor.writeClipboard(text);
        result = { success: true };
        break;
      }
      case 'get_window_rect': {
        const { processName } = assertArgs<{ processName: string }>(args, name);
        result = await executor.getWindowRect(processName);
        break;
      }
      case 'capture_region': {
        const { x, y, width, height } = assertArgs<{ x: number; y: number; width: number; height: number }>(args, name);
        const quality = 0.75;
        const maxW = Math.floor(Math.max(width, 1));
        const maxH = Math.floor(Math.max(height, 1));
        const base64 = await executor.captureRegion(Math.floor(x), Math.floor(y), Math.floor(width), Math.floor(height), quality, maxW, maxH);
        if (typeof base64 === 'string' && base64.startsWith('{"base64":')) {
          try { const p = JSON.parse(base64); if (p.base64) return { content: [{ type: 'image', data: p.base64, mimeType: 'image/jpeg' }] }; } catch(e) {}
        }
        return { content: [{ type: 'image', data: base64, mimeType: 'image/jpeg' }] };
      }
      case 'get_ui_elements': {
        result = await executor.getUiElements();
        break;
      }
      case 'wait': {
        const { duration } = assertArgs<{ duration: number }>(args, name);
        await executor.wait(duration);
        result = { success: true };
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: error.message }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Windows Computer Use MCP Server running on stdio');
