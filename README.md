# Windows Computer Use MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI agents with comprehensive Windows desktop automation capabilities. Enables AI to see, understand, and interact with the Windows UI through structured data — not screenshots.

## Features

### Screen Perception
- **`perceive`** — Smart screen awareness. Returns all UI elements (buttons, text, icons) as structured data with positions, types, and labels. Automatically detects window occlusion and warns when targets are obscured.
- **`describe_screen`** — Text description of the current screen state (foreground app, display, UI elements).
- **`get_ui_elements`** — Raw UI Automation element tree for any process window.
- **`get_desktop_icons`** — Desktop shortcut icons with names and coordinates. Automatically shows desktop (Win+D) before scanning.
- **`show_desktop`** — Minimize all windows to show the desktop.

### Input Simulation
- **`click`** / **`move_mouse`** / **`drag`** / **`scroll`** — Full mouse control with optional auto-focus (brings target window to foreground before clicking).
- **`key`** — Keyboard shortcuts (e.g., `ctrl+c`, `alt+f4`, `meta+d`).
- **`type`** — Text input.

### Window Management
- **`focus_app`** — Activate and bring a window to foreground by process name. Uses 6-level strategy including UI Automation bypass for elevated windows (UIPI).
- **`open_app`** — Launch or activate applications.
- **`hide_windows`** / **`unhide_windows`** — Temporarily hide windows for unobstructed screenshots.
- **`get_window_rect`** — Get window bounding rectangle for targeted region capture.

### Other
- **`capture_region`** — Low-cost (5k tokens) region screenshot.
- **`screenshot`** — Full screen capture (50k tokens, use sparingly).
- **`list_installed_apps`** — Enumerate installed applications.
- **`clipboard`** — Read/write system clipboard.

## Architecture

```
AI Agent (e.g., OPENCLAW)
    ↕ MCP Protocol (stdio)
Windows Computer Use MCP Server
    ├── TypeScript Layer (src/)
    │   ├── index.ts       — MCP tool definitions & protocol handlers
    │   ├── executor.ts    — High-level API, DPI scaling, coordinate conversion
    │   ├── utils.ts       — Monitor info, logical↔physical coordinate mapping
    │   └── types.ts       — TypeScript interfaces
    │
    └── Rust Native Module (native/src/)
        ├── uia.rs         — UI Automation (IUIAutomation) for element tree
        ├── window.rs      — Window management, focus, desktop discovery
        ├── input.rs       — Keyboard/mouse simulation via enigo
        ├── capture.rs     — DXGI screen capture
        └── apps.rs        — Installed app enumeration
```

### Coordinate System
The server uses **global logical coordinates** throughout:
- UIA physical coordinates ÷ DPI scale = logical coordinates
- All tools accept/return logical coordinates
- Automatic physical ↔ logical conversion handles multi-monitor setups with different DPI scales

## Quick Start

### Prerequisites
- Node.js 20+
- Rust toolchain (for native module compilation)

### Build
```bash
node build.js
```

### Run
```bash
node bundle/index.js
```

### MCP Client Configuration
Add to your MCP client config (e.g., OPENCLAW, Claude Desktop):
```json
{
  "mcpServers": {
    "windows-computer-use": {
      "command": "node",
      "args": ["path/to/bundle/index.js"]
    }
  }
}
```

## Usage Guide for AI Agents

### Recommended Workflow
```
1. perceive()                     → Understand current screen state
2. perceive({ targetProcess })    → Check if target app is in foreground
   ↳ If warning: focus_app() first
3. get_desktop_icons()            → Get desktop shortcuts (auto-shows desktop)
4. click({ x, y, processName }) → Click with auto-focus
5. verify with perceive() again   → Confirm result
```

### Avoiding Window Occlusion
- **Desktop icons**: Use `get_desktop_icons()` — it auto-shows desktop
- **App windows**: Always pass `processName` to `click()` for auto-focus before clicking
- **Check before acting**: `perceive()` returns a `warning` field if target is obscured
- **Force foreground**: Call `focus_app()` before interacting with a specific window

## v1.1.0 — Smart Perception & Occlusion Awareness

- Fixed UIA coordinate double-scaling bug (physical→logical conversion)
- New coordinate system: global logical coordinates consistent across multi-monitor
- `perceive()` now detects window occlusion and returns `warning` + `foreground` fields
- New `show_desktop()` tool (Win+D)
- `get_desktop_icons()` auto-shows desktop before scanning
- Tool descriptions rewritten with usage scenarios, examples, and occlusion guidance
- MCP Prompts: `avoid_occlusion`, `use_desktop`, `open_app_by_desktop`
