# Windows Computer Use MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple)](https://modelcontextprotocol.io/)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)](https://www.microsoft.com/windows)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI agents human-like control over Windows. Combines **visual perception** (screenshots) with **simulated mouse and keyboard input** to operate any application exactly the way a person would — no API integration required.

### Why This Matters

- **Works everywhere**: Any Windows application — legacy software, virtual machines, restricted platforms — can be automated via visual perception and input simulation, even when no API or webhook exists.
- **Reduces account ban risk**: On heavily regulated platforms, API-based automation is easily detected and flagged. Simulated human operations (real mouse movements, natural typing cadence) are far harder to distinguish from genuine users.
- **Layered cost efficiency**: Use fast structured perception (`perceive`, `describe_screen`) for routine checks (~1k tokens), fall back to full screenshots only when visual confirmation is needed (~5-50k tokens), and call native APIs directly when available for zero-token operations.
- **Multimodal-first design**: When paired with a vision-capable model, the AI can literally "see" the screen and reason about visual layouts, icons, images, and UI states — just like a human looking at a monitor.

## Features

### Visual Perception (Multimodal-First)
- **`screenshot`** — Full screen capture. When paired with a vision-capable model, the AI literally "sees" the screen — reading text, recognizing icons, understanding layouts just like a human looking at a monitor.
- **`capture_region`** — Targeted region screenshot (~5k tokens). Capture only the window or area you need.
- **`perceive`** — Smart screen awareness. Uses UI Automation to return structured element data (buttons, text, positions) at ~1k tokens. Automatically detects window occlusion.
- **`describe_screen`** — Text description of current screen state. No vision model needed.
- **`get_ui_elements`** — Raw UI Automation element tree. Lowest-cost perception (~500 tokens).

### Human-Like Input Simulation
- **`move_mouse`** / **`click`** / **`drag`** / **`scroll`** — Full mouse control with realistic movement. Optional `processName` auto-focuses the target window before interacting.
- **`key`** — Keyboard input including combinations (`ctrl+c`, `alt+f4`, `ctrl+shift+escape`).
- **`type`** — Text input with natural typing.

### Window & Desktop Management
- **`focus_app`** — Activate a window. Uses 6-level strategy including UI Automation bypass for elevated (admin) windows.
- **`open_app`** — Launch or switch to an application.
- **`hide_windows`** / **`unhide_windows`** — Temporarily hide windows for clean screenshots.
- **`get_window_rect`** — Get window position and size for targeted capture.
- **`show_desktop`** — Minimize all windows (Win+D).
- **`get_desktop_icons`** / **`arrange_desktop_icons`** — Read and reposition desktop shortcuts.
- **`get_frontmost_app`** — Check which window is currently in foreground.

### System Access
- **`list_installed_apps`** — Enumerate installed applications.
- **`read_clipboard`** / **`write_clipboard`** — System clipboard access.
- **`get_display_size`** — Monitor geometry and DPI scale factor.
- **`wait`** — Pause for UI animations to settle.

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
        ├── capture.rs     — DXGI hardware-accelerated screen capture
        ├── input.rs       — Keyboard/mouse simulation via enigo
        ├── uia.rs         — UI Automation element tree (low-cost perception)
        ├── window.rs      — Window management, focus, desktop icons
        └── apps.rs        — Installed application enumeration
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

### Recommended Workflow (Multimodal)
```
1. screenshot() → capture_region()     → See the screen / target area
2. Visually identify target elements   → "The login button is at bottom-right"
3. click({ x, y, processName })        → Interact
4. screenshot() / perceive()           → Verify the result visually
```

### Cost-Optimized Workflow (Non-Vision Models)
```
1. perceive()                          → Understand screen state (~1k tokens)
2. get_ui_elements({ processName })    → Get detailed UI tree (~500 tokens)
3. click({ x, y })                     → Interact using element coordinates
4. perceive() again                    → Confirm the result
```

### Avoiding Window Occlusion
- **Desktop icons**: Use `get_desktop_icons()` — it auto-shows desktop
- **App windows**: Always pass `processName` to `click()` for auto-focus before clicking
- **Check before acting**: `perceive()` returns a `warning` field if target is obscured
- **Force foreground**: Call `focus_app()` before interacting with a specific window

## v1.1.0 — Low-Cost Perception Layer + Desktop Tools

- Fixed UIA coordinate double-scaling bug (physical→logical conversion)
- New coordinate system: global logical coordinates consistent across multi-monitor
- Added `perceive()`, `describe_screen()`, `get_ui_elements()` — structured perception for non-vision models (~500-1k tokens vs ~50k for screenshots)
- `perceive()` detects window occlusion and returns `warning` + `foreground` fields
- New desktop tools: `show_desktop()`, `get_desktop_icons()`, `arrange_desktop_icons()`
- New utility tools: `capture_region()`, `get_window_rect()`, `wait()`
- MCP Prompts: `avoid_occlusion`, `use_desktop`, `open_app_by_desktop`
- Tool descriptions rewritten with usage scenarios, examples, and occlusion guidance

## Troubleshooting

**Build fails with "napi not found"**
```bash
npm install -g @napi-rs/cli
```

**Native module fails to load**
Ensure you ran `node build.js` and the Rust toolchain is installed. The build script compiles `native/` and bundles everything into `bundle/`.

**Screenshot returns black image**
This can happen when running in a virtual machine or via RDP without a GPU. Try using `describe_screen` or `perceive` instead, which use UI Automation (no GPU required).

**UI Automation returns few elements**
The target window may be elevated (running as Administrator) while the MCP server is not. Run the MCP server with the same privilege level as the target application.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture overview, and pull request guidelines.

## Security

Deep Windows system access comes with responsibility. See [SECURITY.md](SECURITY.md) for our security policy and guidelines on safe usage.

## License

[MIT](LICENSE)
