import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WindowsComputerExecutor } from './executor.js';
const executor = new WindowsComputerExecutor();
const server = new Server({
    name: 'windows-computer-use',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
/**
 * Asserts that the given arguments match the expected type.
 * Throws an error if arguments are missing or invalid.
 */
function assertArgs(args, name) {
    if (!args || typeof args !== 'object') {
        throw new Error(`Tool "${name}" requires arguments, but none were provided.`);
    }
    return args;
}
const TOOLS = [
    {
        name: 'screenshot',
        description: 'Capture the screen and return it as a base64 encoded JPEG.',
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
];
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: TOOLS,
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        let result;
        switch (name) {
            case 'screenshot': {
                const { exclude } = assertArgs(args, name);
                if (exclude) {
                    result = await executor.screenshot({ excludeProcessNames: exclude });
                }
                else {
                    result = await executor.screenshot({});
                }
                break;
            }
            case 'get_display_size': {
                result = await executor.getDisplaySize();
                break;
            }
            case 'move_mouse': {
                const { x, y } = assertArgs(args, name);
                await executor.moveMouse(x, y);
                result = { success: true };
                break;
            }
            case 'click': {
                const { x, y, button, count, processName } = assertArgs(args, name);
                await executor.click(x, y, button || 'left', count || 1, processName);
                result = { success: true };
                break;
            }
            case 'drag': {
                const { from, to } = assertArgs(args, name);
                await executor.drag(from, to);
                result = { success: true };
                break;
            }
            case 'scroll': {
                const { x, y, dx, dy } = assertArgs(args, name);
                await executor.scroll(x, y, dx || 0, dy || 0);
                result = { success: true };
                break;
            }
            case 'key': {
                const { sequence } = assertArgs(args, name);
                await executor.key(sequence);
                result = { success: true };
                break;
            }
            case 'type': {
                const { text } = assertArgs(args, name);
                await executor.type(text);
                result = { success: true };
                break;
            }
            case 'get_frontmost_app': {
                result = await executor.getFrontmostApp();
                break;
            }
            case 'hide_windows': {
                const { process_names } = assertArgs(args, name);
                result = await executor.hideWindows(process_names);
                break;
            }
            case 'unhide_windows': {
                const { handles } = assertArgs(args, name);
                await executor.unhideWindows(handles);
                result = { success: true };
                break;
            }
            case 'list_installed_apps': {
                result = await executor.listInstalledApps();
                break;
            }
            case 'open_app': {
                const { path } = assertArgs(args, name);
                await executor.openApp(path);
                result = { success: true };
                break;
            }
            case 'focus_app': {
                const { processName } = assertArgs(args, name);
                const success = await executor.focusApp(processName);
                result = { success };
                break;
            }
            case 'read_clipboard': {
                result = await executor.readClipboard();
                break;
            }
            case 'write_clipboard': {
                const { text } = assertArgs(args, name);
                await executor.writeClipboard(text);
                result = { success: true };
                break;
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: error.message }],
            isError: true,
        };
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Windows Computer Use MCP Server running on stdio');
//# sourceMappingURL=index.js.map