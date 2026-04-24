import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
      prompts: {},
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
    name: 'perceive',
    description: '[RECOMMENDED] 智能感知当前屏幕或指定进程窗口的 UI 状态，自动选择最低成本方式获取信息。\n'
      + '返回结构化数据：method(感知方式)、elements(UI元素列表)、description(文字描述)、display(显示信息)、\n'
      + 'foreground(当前前台应用)、warning(遮挡警告)、hint(下一步建议)。\n'
      + '如果指定了目标进程但该进程不在前台，会自动在 warning 字段中提示，避免操作被遮挡窗口。\n'
      + '这是首选工具 — 无需截图即可了解屏幕内容。\n'
      + '使用场景：\n'
      + '- 第一步操作：不传参数直接调用，获取当前焦点窗口的完整 UI 元素\n'
      + '- 查看桌面图标：传入 targetProcess: "explorer"\n'
      + '- 查看其他应用窗口：传入对应进程名如 "notepad", "chrome"\n'
      + '- 想验证某个窗口是否在前台：传入 targetProcess，检查 warning 字段\n'
      + '示例：\n'
      + '- perceive({}) → 感知当前焦点窗口\n'
      + '- perceive({ targetProcess: "wechat" }) → 检查微信窗口状态和元素',
    inputSchema: {
      type: 'object',
      properties: {
        targetProcess: {
          type: 'string',
          description: '可选，目标进程名（如 "explorer", "notepad", "chrome"）。留空则扫描当前焦点窗口。'
        }
      },
    },
  },
  {
    name: 'get_desktop_icons',
    description: '[桌面图标] 直接返回桌面所有图标的名称和坐标，无需任何参数。\n'
      + '调用此工具会自动最小化所有窗口（Win+D），确保桌面图标可见。\n'
      + '返回的坐标可直接用于 click 工具。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'show_desktop',
    description: '[显示桌面] 最小化所有窗口，显示桌面（Win+D）。\n'
      + '使用场景：\n'
      + '- 点击桌面图标前调用，确保桌面不被遮挡\n'
      + '- 需要快速回到桌面时使用\n'
      + '示例：show_desktop({})',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'describe_screen',
    description: '[PREFERRED ~1000 tokens] 返回当前屏幕的完整文字描述：前台应用、显示参数、所有可见 UI 元素的名称/类型/位置。\n'
      + '优先使用此工具代替截图，它无需图像传输，极低 Token 消耗。\n'
      + '如果此工具返回的信息不足，再考虑使用 screenshot。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_ui_elements',
    description: '[LOW COST ~500 tokens] 获取指定进程窗口或当前焦点窗口的所有 UI 元素（按钮、文本框、列表项等）。\n'
      + '每个元素包含：name(名称)、controlType(类型)、x/y/width/height(逻辑坐标，可直接用于 click)、enabled(可用)、visible(可见)、depth(层级)。\n'
      + '使用场景：\n'
      + '- 查看桌面图标：传入 processName: "explorer"\n'
      + '- 查看前台应用控件：不传参数\n'
      + '- 查看其他窗口控件：传入进程名，如 processName: "notepad" 或 "chrome"\n'
      + '示例：\n'
      + '- get_ui_elements({}) → 当前焦点窗口的 UI 元素\n'
      + '- get_ui_elements({ processName: "explorer" }) → 桌面图标列表',
    inputSchema: {
      type: 'object',
      properties: {
        processName: {
          type: 'string',
          description: '要扫描的进程名（如 "explorer", "notepad", "chrome"）。留空则扫描当前焦点窗口。'
        }
      },
    },
  },
  {
    name: 'screenshot',
    description: '[EXPENSIVE ~50k tokens] 全屏截图，返回 JPEG base64 图像。仅当 visual 确认绝对必要时使用！\n'
      + '优先使用 perceive、describe_screen、get_ui_elements 替代。\n'
      + '可选参数 exclude：暂时隐藏指定进程的窗口后再截图。',
    inputSchema: {
      type: 'object',
      properties: {
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: '要排除的进程名列表（截图前会暂时隐藏这些窗口）。',
        },
      },
    },
  },
  {
    name: 'capture_region',
    description: '[LOWER COST ~5k tokens] 截取屏幕指定区域，返回 JPEG base64。坐标使用物理像素。\n'
      + '推荐先用 get_window_rect 获取窗口位置，再截取该区域。',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '区域左边界（物理像素）' },
        y: { type: 'number', description: '区域上边界（物理像素）' },
        width: { type: 'number', description: '区域宽度（物理像素）' },
        height: { type: 'number', description: '区域高度（物理像素）' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'get_display_size',
    description: '获取当前显示器的几何信息：宽、高（像素）和缩放因子。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'move_mouse',
    description: '移动鼠标光标到指定的逻辑坐标位置。',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '目标 X 坐标（逻辑像素）' },
        y: { type: 'number', description: '目标 Y 坐标（逻辑像素）' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'click',
    description: '在指定的逻辑坐标位置点击鼠标。\n'
      + '重要：如果点击的目标属于某个应用窗口，务必传入 processName 参数，系统会自动将该窗口带到前台后再点击，避免点错或被其他窗口遮挡。\n'
      + '可选参数：button(默认 left)、count(点击次数)、processName(点击前确保该进程在前台)。\n'
      + '示例：\n'
      + '- click({ x: 500, y: 300 }) → 左键单击\n'
      + '- click({ x: 500, y: 300, button: "right" }) → 右键单击\n'
      + '- click({ x: 500, y: 300, count: 2 }) → 双击\n'
      + '- click({ x: 500, y: 300, processName: "wechat" }) → 先将微信带到前台，再点击',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '点击位置 X（逻辑像素）' },
        y: { type: 'number', description: '点击位置 Y（逻辑像素）' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: '鼠标按键（默认 left）' },
        count: { type: 'number', default: 1, description: '点击次数（默认 1，双击用 2）' },
        processName: { type: 'string', description: '可选：点击前确保该进程在前台（如 "notepad"）' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'drag',
    description: '从起点到终点拖动鼠标（按住左键拖动）。\n'
      + '示例：\n'
      + '- drag({ from: { x: 100, y: 100 }, to: { x: 300, y: 300 } }) → 从(100,100)拖到(300,300)\n'
      + '- drag({ to: { x: 300, y: 300 } }) → 从当前位置开始拖动',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
          description: '起点坐标（可选，省略则从当前位置开始）',
        },
        to: {
          type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
          description: '终点坐标',
        },
      },
      required: ['to'],
    },
  },
  {
    name: 'scroll',
    description: '在指定位置滚动鼠标滚轮。',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '滚动位置 X' },
        y: { type: 'number', description: '滚动位置 Y' },
        dx: { type: 'number', description: '水平滚动量（负值向左）' },
        dy: { type: 'number', description: '垂直滚动量（负值向上）' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'key',
    description: '发送键盘按键或组合键。\n'
      + '支持单键（"escape", "enter", "tab"）和组合键（"alt+f4", "ctrl+c", "ctrl+shift+escape"）。\n'
      + '多个按键用 "+" 连接。\n'
      + '示例：\n'
      + '- key({ sequence: "enter" }) → 按回车\n'
      + '- key({ sequence: "ctrl+c" }) → 复制\n'
      + '- key({ sequence: "alt+f4" }) → 关闭当前窗口',
    inputSchema: {
      type: 'object',
      properties: {
        sequence: { type: 'string', description: '按键或组合键，多个按键用 "+" 连接（如 "ctrl+c", "alt+f4"）' },
      },
      required: ['sequence'],
    },
  },
  {
    name: 'type',
    description: '在当前焦点窗口输入文本。\n'
      + '示例：type({ text: "hello world" }) → 输入 "hello world"',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要输入的文本内容' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_frontmost_app',
    description: '获取当前前台应用的名称和进程路径。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'focus_app',
    description: '将指定进程名的窗口带到前台（激活窗口）。\n'
      + '示例：\n'
      + '- focus_app({ processName: "notepad" }) → 激活记事本\n'
      + '- focus_app({ processName: "chrome" }) → 激活 Chrome',
    inputSchema: {
      type: 'object',
      properties: {
        processName: { type: 'string', description: '要激活的进程名（如 "notepad", "chrome"）' }
      },
      required: ['processName']
    }
  },
  {
    name: 'open_app',
    description: '通过路径或命令启动应用程序。如果应用已在运行，会尝试激活其现有窗口。\n'
      + '示例：\n'
      + '- open_app({ path: "notepad" }) → 打开记事本\n'
      + '- open_app({ path: "calc" }) → 打开计算器',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '应用路径或命令（如 "notepad", "calc"）' },
      },
      required: ['path'],
    },
  },
  {
    name: 'hide_windows',
    description: '隐藏指定进程的所有窗口（截图前排除干扰窗口时使用）。',
    inputSchema: {
      type: 'object',
      properties: {
        process_names: { type: 'array', items: { type: 'string' }, description: '要隐藏的进程名列表' },
      },
      required: ['process_names'],
    },
  },
  {
    name: 'unhide_windows',
    description: '恢复之前隐藏的窗口（传入 hide_windows 返回的 handles）。',
    inputSchema: {
      type: 'object',
      properties: {
        handles: { type: 'array', items: { type: 'number' }, description: '窗口句柄列表' },
      },
      required: ['handles'],
    },
  },
  {
    name: 'list_installed_apps',
    description: '列出系统中所有已安装的应用程序。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_window_rect',
    description: '获取指定进程窗口的边界矩形（物理像素坐标）。结合 capture_region 可截取特定窗口。\n'
      + '示例：get_window_rect({ processName: "notepad" }) → 获取记事本窗口位置和大小',
    inputSchema: {
      type: 'object',
      properties: {
        processName: { type: 'string', description: '进程名（如 "notepad", "chrome"）' },
      },
      required: ['processName'],
    },
  },
  {
    name: 'read_clipboard',
    description: '读取当前剪贴板内容。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'write_clipboard',
    description: '写入文本到剪贴板。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要写入的文本' },
      },
      required: ['text'],
    },
  },
  {
    name: 'wait',
    description: '等待指定时长（秒）。在 UI 操作后等待渲染完成时使用。\n'
      + '示例：\n'
      + '- wait({ duration: 1 }) → 等待 1 秒\n'
      + '- wait({ duration: 2.5 }) → 等待 2.5 秒',
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: '等待时长（秒，支持小数）' },
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
      case 'perceive': {
        const { targetProcess } = assertArgs<{ targetProcess?: string }>(args, name);
        result = await executor.perceive(targetProcess);
        break;
      }
      case 'get_desktop_icons': {
        result = await executor.getDesktopIcons();
        break;
      }
      case 'show_desktop': {
        await executor.showDesktop();
        result = { success: true };
        break;
      }
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
      case 'describe_screen': {
        result = { description: await executor.describeScreen() };
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
        const { processName } = assertArgs<{ processName?: string }>(args, name);
        result = await executor.getUiElements(processName);
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

// MCP Prompts: provide pre-built guidance that clients (e.g. OPENCLAW) can inject
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'use_desktop',
      description: 'How to perceive and operate the Windows desktop',
      arguments: [],
    },
    {
      name: 'open_app_by_desktop',
      description: 'How to find and open an application via desktop icons',
      arguments: [],
    },
    {
      name: 'avoid_occlusion',
      description: 'How to avoid clicking on obscured/hidden windows',
      arguments: [],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;
  if (name === 'use_desktop') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: '当你需要了解 Windows 桌面状态时，请按以下顺序使用工具：\n'
              + '1. 调用 perceive() 感知当前屏幕 — 这是首选，低成本获取 UI 元素\n'
              + '2. 如需桌面图标，调用 get_desktop_icons() 获取所有图标名称和坐标\n'
              + '3. 如需完整文字描述，调用 describe_screen()\n'
              + '4. 仅当前面所有方法都不够用时，再使用 screenshot() 截图\n\n'
              + '鼠标操作使用 click/move_mouse/drag，键盘操作使用 key/type。\n'
              + '点击坐标时，通常点击元素中心点：x + width/2, y + height/2。',
          },
        },
      ],
    };
  }
  if (name === 'open_app_by_desktop') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: '要通过桌面图标打开应用：\n'
              + '1. 调用 get_desktop_icons() 获取所有桌面图标（此工具会自动最小化遮挡窗口）\n'
              + '2. 找到目标应用的图标及其坐标 (x, y, width, height)\n'
              + '3. 计算中心点：clickX = x + width/2, clickY = y + height/2\n'
              + '4. 调用 click({ x: clickX, y: clickY, count: 2 }) 双击打开\n\n'
              + '注意：get_desktop_icons 已经自动执行了 show_desktop()，桌面图标此时应该可见。如果仍有遮挡，可调用 show_desktop() 再次清理。',
          },
        },
      ],
    };
  }
  if (name === 'avoid_occlusion') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: '避免操作被遮挡窗口的规则：\n\n'
              + '1. 操作应用窗口时，click 工具务必传入 processName 参数。例如点击微信时：\n'
              + '   click({ x: 100, y: 200, processName: "wechat" })\n'
              + '   这会自动将微信带到前台再点击，避免点错。\n\n'
              + '2. 操作桌面图标前，先调用 show_desktop() 或直接使用 get_desktop_icons()（内部已含 show_desktop）。\n\n'
              + '3. 每次操作前调用 perceive() 检查目标是否在前台。如果 perceive 返回的 warning 字段不为 null，\n'
              + '   说明目标被遮挡。先调用 focus_app() 或 show_desktop() 解决后再操作。\n\n'
              + '4. 操作后再次调用 perceive() 验证结果：检查 foreground 是否已切换为预期的应用。',
          },
        },
      ],
    };
  }
  throw new Error(`Unknown prompt: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Windows Computer Use MCP Server running on stdio');
