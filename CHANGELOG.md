# Changelog

All notable changes to this project will be documented in this file.

The format is follows:

## [1.0.0] - 2026-04-22

### Added
- **Core MCP Toolset**: Implementation of `screenshot`, `move_mouse`, `click`, `type`, `key`, `open_app`, `focus_app`, `get_frontmost_app`, `read_clipboard`, `write_clipboard`.
- **High-Performance Screenshot**: Integrated DXGI-based screen capture via Rust.
- **Multi-Monitor DPI Awareness**: Implementation of logical-to-physical coordinate transformation for mixed DPI environments.
- **Native-TS Bridge**: Robust NAPI-RS integration with automated build pipeline.

### Known Issues (Planned for v1.1)
- **Window Focus Stability**: `SetForegroundWindow` may be intercepted by Windows UIPI, requiring "Click-to-Focus" or `AttachThreadInput` logic.
- **Idempotent App Launching**: `open_app` currently lacks a singleton check, potentially leading to multiple process instances.
- **Test Reliability**: Current test drivers rely on indirect verification (e.g., checking frontmost app instead of process existence).

---
*This version serves as the functional baseline for the Windows Computer Use MCP server.*
