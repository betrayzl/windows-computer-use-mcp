# Windows Computer Use MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple)](https://modelcontextprotocol.io/)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)](https://www.microsoft.com/windows)
[![npm](https://img.shields.io/npm/v/@betrayzl/windows-computer-use-mcp)](https://www.npmjs.com/package/@betrayzl/windows-computer-use-mcp)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI agents human-like control over Windows. Combines **visual perception** (screenshots) with **simulated mouse and keyboard input** to operate any application exactly the way a person would — no API integration required.

### Why This Matters

- **Works everywhere**: Any Windows application — legacy software, virtual machines, restricted platforms — can be automated via visual perception and input simulation, even when no API or webhook exists.
- **Reduces account ban risk**: On heavily regulated platforms, API-based automation is easily detected and flagged. Simulated human operations (real mouse movements, natural typing cadence) are far harder to distinguish from genuine users.
- **Layered cost efficiency**: Use fast structured perception (`perceive`, `describe_screen`) for routine checks (~1k tokens), fall back to full screenshots only when visual confirmation is needed (~5-50k tokens), and call native APIs directly when available for zero-token operations.
- **Multimodal-first design**: When paired with a vision-capable model, the AI can literally "see" the screen and reason about visual layouts, icons, images, and UI states — just like a human looking at a monitor.

## Project Story

This project was built by someone who **doesn't know how to code**.

The author is a Genshin Impact player who wanted AI to help with repetitive in-game tasks — farming, map clearing, daily commissions. The goal was simple: let AI see the screen and operate the game just like a human would, reducing the grind without risking account bans from API-based automation.

### Built with a $300 GPU and a Local Model

The entire project was developed using **Claude Code + a local Gemma 4 26B Q4 quantized model** running on a single **RTX 5060 Ti 16G** — the best hardware the author could access. No cloud compute, no engineering team, no prior programming experience.

The author estimated cloud API costs would be too expensive for the volume of iteration needed, so everything was done locally. The tradeoff: a small local model that frequently made mistakes, wrote broken code, and struggled to maintain context across restarts.

### The "AI Error Corrector" Workflow

Despite not understanding code syntax, the author discovered a workflow that made development possible:

1. **Maintain a clear logical chain** — know exactly what the project is supposed to do, step by step
2. **When the AI gets stuck** — identify *where* the problem is, even without knowing *how* to fix it in code
3. **Point the AI at the problem** — describe what went wrong and what the expected behavior should be
4. **The AI self-corrects** — with clear guidance, even a small model can break out of dead ends

> "I don't understand code, but I know my project's logic inside and out. When something breaks, I know exactly where to look. I became an AI error corrector — the AI writes, I review, the AI fixes. That loop works even if you've never written a line of code."

### One Month from Zero to Open Source

From the first `npm install` to this release: **about one month**. The author learned what Node.js is, what Rust does, how MCP works, and what "compilation" means — all through conversations with Claude Code. Every concept in this project was explained by AI to someone hearing it for the first time.

The author notes that using a cloud model (like the Claude Opus powering this session) would have made development significantly easier — faster iteration, fewer mistakes, better code generation. But the constraint of a small local model forced a deep understanding of the project's logic, which turned out to be the real skill that made this possible.

### What's Next

The current version works, but the author's vision goes further: integrating specialized **Agents** and purpose-built models to handle complex multi-step tasks with better reliability. The end goal is an AI that can truly play games alongside humans — not as a bot, but as a collaborative agent that sees and operates the screen like a person.

---

**Key takeaway**: You don't need to be a programmer to build software with AI. You need clear thinking, a logical chain, and the willingness to be the AI's "error corrector."

---

## Table of Contents

- [Project Story](#project-story)
- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Installation

### Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| **Windows** | 10 or 11 | `winver` |
| **Node.js** | ≥ 20.0.0 | `node --version` |

### Method 1: Install from npm (Recommended)

```bash
npm install -g @betrayzl/windows-computer-use-mcp
```

This installs a **pre-built package** — no Rust compiler needed. After installation, configure your MCP client to launch:

```
node C:\Users\<你的用户名>\AppData\Roaming\npm\node_modules\@betrayzl\windows-computer-use-mcp\bundle\index.js
```

Or find the exact path with:

```bash
npm root -g
```

### Method 2: Download Pre-built Release

1. Go to [Releases](https://github.com/betrayzl/windows-computer-use-mcp/releases)
2. Download the latest `windows-computer-use-mcp-v*.zip`
3. Extract anywhere
4. Double-click `start.bat`, or run `node bundle/index.js`

No Rust compiler required.

### Method 3: Build from Source

Requires **Rust** stable toolchain in addition to Node.js.

```bash
git clone https://github.com/betrayzl/windows-computer-use-mcp.git
cd windows-computer-use-mcp
npm install
node build.js
```

The build script performs four stages:

1. **Compile Rust native module** — `napi build --platform --release` in `native/`
2. **Compile TypeScript** — `tsc` compiles `src/` → `dist/`
3. **Bundle with ncc** — `@vercel/ncc` bundles `dist/index.js` into a single `bundle/index.js`
4. **Copy native binary** — The compiled `.node` file is copied to `bundle/win-cu-native.node`

A successful build outputs:

```
✨ Build complete!
📦 Output location: bundle/
👉 You can now configure your MCP client to use: node bundle/index.js
```

### Troubleshooting Build

<details>
<summary><strong>Build fails with "napi not found"</strong></summary>

```bash
npm install -g @napi-rs/cli
```

Then run `node build.js` again.
</details>

<details>
<summary><strong>Native module fails to load</strong></summary>

Ensure you ran `node build.js` (not just `tsc`) and the Rust toolchain is installed. The build script compiles `native/` from source — the `.node` file must match your CPU architecture.

```bash
# Verify Rust is installed
rustc --version
cargo --version
```
</details>

<details>
<summary><strong>Screenshot returns black image</strong></summary>

This can happen when running in a virtual machine or via RDP without a GPU. Try using `describe_screen` or `perceive` instead, which use UI Automation (no GPU required).
</details>

<details>
<summary><strong>UI Automation returns few elements</strong></summary>

The target window may be running as Administrator while the MCP server is not. Run the MCP server with the same privilege level as the target application.
</details>

## Usage

### Configure Your MCP Client

Add to your MCP client configuration (Claude Desktop, OPENCLAW, etc.):

```json
{
  "mcpServers": {
    "windows-computer-use": {
      "command": "node",
      "args": ["path/to/windows-computer-use-mcp/bundle/index.js"]
    }
  }
}
```

You can also run it directly for testing:

```bash
node bundle/index.js
# MCP server now listening on stdio
```

### Quick Start: A Complete Workflow

Here is a typical session using 4 tools to accomplish a task:

```
1. perceive({ targetProcess: "notepad" })
   → Check what's on screen, whether notepad is in foreground
   → Returns: elements list, foreground info, occlusion warning

2. focus_app({ processName: "notepad" })
   → Bring notepad to front if it was obscured

3. click({ x: 500, y: 300, processName: "notepad" })
   → Click the text area (processName ensures notepad is frontmost first)

4. type({ text: "Hello from MCP!" })
   → Type text into the focused editor

5. screenshot({})
   → Visually confirm the result (with a vision-capable model)
```

### Two Operating Modes

#### Visual Mode (with vision-capable models)

When your AI model supports image inputs, you get the full "human-like" experience:

- Use `screenshot` to see the entire screen
- The model reasons about what it sees — buttons, text, images, layouts
- Use `click`, `type`, `drag` to interact

#### Structured Mode (non-vision models)

When your model cannot process images, use the cost-efficient perception tools:

- Use `perceive` (~1k tokens) to get a structured description of UI elements
- Use `describe_screen` to get a text summary of what's visible
- Use `get_ui_elements` for detailed element trees with coordinates

### Preventing Misclicks (Window Occlusion)

The most common failure mode in desktop automation is clicking the wrong window. The server provides three safeguards:

1. **Pass `processName` to `click()`** — automatically focuses the target window before clicking
2. **Check `perceive()` warning field** — detects if your target is obscured
3. **Call `focus_app()` explicitly** — brings any window to the foreground

```javascript
// Safe click — always lands on the right window
click({ x: 400, y: 200, processName: "chrome" })

// Before desktop operations
show_desktop()
get_desktop_icons()  // auto-calls show_desktop internally
```

## Features

### Visual Perception

| Tool | Token Cost | Description |
|------|-----------|-------------|
| `screenshot` | ~50k | Full-screen JPEG capture. The AI "sees" the screen — reads text, recognizes icons, understands layouts. Use when visual confirmation is essential. Supports `exclude` parameter to hide windows before capture. |
| `capture_region` | ~5k | Captures a specific screen region by pixel coordinates. Combine with `get_window_rect` for targeted window captures. |
| `perceive` | ~1k | **[Recommended]** Smart screen awareness. Automatically selects the most efficient method — returns structured element data, text description, display info, foreground app, and occlusion warnings. |
| `describe_screen` | ~1k | Human-readable text description of the current screen: foreground app, display parameters, all visible UI elements with names, types, and positions. |
| `get_ui_elements` | ~500 | Raw UI Automation element tree. Lowest-cost perception — returns name, control type, coordinates, enabled/visible state for each element. Filter by process name. |

### Mouse Input

| Tool | Description |
|------|-------------|
| `move_mouse` | Move cursor to (x, y) logical coordinates. DPI-aware across multi-monitor setups. |
| `click` | Click at coordinates. Supports left/right/middle buttons, double-click (`count: 2`). Optional `processName` auto-focuses the window before clicking. |
| `drag` | Press-and-drag from start to end coordinates. Optional start (uses current position if omitted). |
| `scroll` | Mouse wheel scroll at position (dx/dy for horizontal/vertical). |

### Keyboard Input

| Tool | Description |
|------|-------------|
| `key` | Send single keys or combinations: `"enter"`, `"ctrl+c"`, `"alt+f4"`, `"ctrl+shift+escape"`. Modifier keys are released after each call to prevent stuck keys. |
| `type` | Type text with natural cadence into the focused input field. |
| `write_clipboard` | Write text to the system clipboard. |
| `read_clipboard` | Read text from the system clipboard. |

### Window & Desktop Management

| Tool | Description |
|------|-------------|
| `focus_app` | Bring a window to foreground by process name. Uses a 6-level strategy including UI Automation bypass for elevated windows. |
| `open_app` | Launch an application (by name or path), or activate it if already running. |
| `get_frontmost_app` | Get the name and process path of the currently active window. |
| `get_window_rect` | Get a window's bounding rectangle (physical pixels). Useful before `capture_region`. |
| `hide_windows` | Temporarily hide specific process windows — for clean screenshots without visual clutter. Returns handles for restoration. |
| `unhide_windows` | Restore windows hidden by `hide_windows`. |
| `show_desktop` | Minimize all windows (Win+D). |
| `get_desktop_icons` | List all desktop icons with names and coordinates. Auto-shows desktop first. |
| `arrange_desktop_icons` | Reposition desktop icons by name to specified logical coordinates. Operates directly on the SysListView32 control for instant results. |

### System & Utility

| Tool | Description |
|------|-------------|
| `get_display_size` | Monitor geometry — physical width/height, DPI scale factor. |
| `list_installed_apps` | Enumerate all installed Windows applications. |
| `wait` | Pause execution for a specified duration (seconds). Useful for waiting on UI animations. |

## Architecture

```
AI Agent (MCP Client)
    ↕ MCP Protocol (JSON-RPC over stdio)
Windows Computer Use MCP Server
    ├── TypeScript Layer (src/)
    │   ├── index.ts       — 24 MCP tool definitions & request handlers
    │   ├── executor.ts    — High-level API, DPI scaling, focus enforcement
    │   ├── utils.ts       — Multi-monitor logical↔physical coordinate mapping
    │   └── types.ts       — TypeScript interfaces
    │
    └── Rust Native Module (native/src/)
        ├── capture.rs     — DXGI hardware-accelerated screen capture (full + region)
        ├── input.rs       — Keyboard/mouse simulation via enigo
        ├── uia.rs         — UI Automation element tree (41 control types, low-cost perception)
        ├── window.rs      — Window management, 6-level focus strategy, desktop icon arrangement
        └── apps.rs        — Installed application enumeration
```

### Coordinate System

All tools accept and return **global logical coordinates** (DPI-aware):

- UI Automation returns physical pixels → automatically converted to logical coordinates
- Multi-monitor setups with different DPI scales are handled transparently
- You never need to worry about DPI — just use the coordinates from perception tools

## Contributing

We welcome contributions! Here's how to get started:

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines
2. Check the [issues page](https://github.com/betrayzl/windows-computer-use-mcp/issues) for open work
3. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `docs:`, etc.)

### Development Quick Start

```bash
git clone https://github.com/betrayzl/windows-computer-use-mcp.git
cd windows-computer-use-mcp
npm install
node build.js           # Full build
node bundle/index.js    # Test run
node tests/test_driver.js  # Run diagnostics
```

### Adding a New Tool

1. Add the tool definition to `src/index.ts`
2. Add the handler case in `CallToolRequestSchema`
3. Implement the method in `src/executor.ts`
4. Add Rust implementation in `native/src/` if low-level Windows API is needed
5. Export the function from `native/src/lib.rs`
6. Update this README with the new tool

## Security

This server has deep Windows system access (screen capture, keyboard/mouse simulation, process management, cross-process memory). Please review [SECURITY.md](SECURITY.md) before use.

- Run the server with the lowest privilege level needed for your task
- Be cautious when automating sensitive applications (banking, admin consoles)
- Review automation scripts before executing them unattended
- The server operates entirely locally — no data is sent to external services

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for the full text.

---

Built with [NAPI-RS](https://napi.rs/), [enigo](https://github.com/enigo-rs/enigo), and the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk).
