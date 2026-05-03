# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-03

### Added
- **Smart Perception (`perceive`)**: Structured screen awareness with occlusion detection and foreground verification.
- **`describe_screen`**: Low-cost (~1k tokens) text description of screen state via UI Automation.
- **`get_ui_elements`**: Raw UI Automation element tree for any process window (~500 tokens).
- **`get_desktop_icons`**: Enumerate desktop shortcut icons with names and coordinates.
- **`show_desktop`**: Minimize all windows (Win+D).
- **`arrange_desktop_icons`**: Programmatic desktop icon layout via SysListView32 cross-process manipulation.
- **`capture_region`**: Targeted region screenshot in physical pixels (~5k tokens).
- **`get_window_rect`**: Window bounding rectangle query by process name.
- **`wait`**: Configurable delay for UI animation settling.
- **MCP Prompts**: `use_desktop`, `open_app_by_desktop`, `avoid_occlusion` prompts for AI agent guidance.

### Changed
- **Coordinate system overhaul**: Global logical coordinates with automatic physical conversion across multi-monitor DPI setups.
- **`key` tool**: Now supports key combinations (e.g., `alt+f4`, `ctrl+shift+escape`) using `+` separator.
- **`click` and `type`**: Optional `processName` parameter for automatic foreground focus before action.
- Tool descriptions rewritten with usage scenarios, examples, and occlusion guidance for AI agents.

### Fixed
- UIA coordinate double-scaling bug (physical-to-logical conversion for multi-monitor).
- Window focus reliability via 6-level strategy including UI Automation bypass for elevated windows (UIPI).
- Handle truncation on 64-bit systems (HWND now stored as `i64`).

## [1.0.0] - 2026-04-22

### Added
- **Core MCP Toolset**: `screenshot`, `move_mouse`, `click`, `type`, `key`, `open_app`, `focus_app`, `get_frontmost_app`, `read_clipboard`, `write_clipboard`.
- **High-Performance Screenshot**: DXGI-based screen capture via Rust native module.
- **Multi-Monitor DPI Awareness**: Logical-to-physical coordinate transformation for mixed DPI environments.
- **Native-TypeScript Bridge**: NAPI-RS integration with automated 4-step build pipeline.
- **Window Management**: `hide_windows`/`unhide_windows` with RAII guard pattern, `list_installed_apps` via Windows Registry.

[1.1.0]: https://github.com/betrayzl/windows-computer-use-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/betrayzl/windows-computer-use-mcp/releases/tag/v1.0.0
