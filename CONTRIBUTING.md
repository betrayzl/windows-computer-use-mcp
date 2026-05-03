# Contributing to Windows Computer Use MCP

Thank you for your interest in contributing!

## Development Setup

1. **Prerequisites**: Node.js 20+, Rust toolchain (stable), Windows 10/11
2. **Clone**: `git clone https://github.com/betrayzl/windows-computer-use-mcp.git`
3. **Build**: `node build.js`
4. **Verify**: `node bundle/index.js` (starts the MCP server on stdio)

## Architecture

```
AI Agent (MCP Client)
     |  JSON-RPC over stdio
     v
src/index.ts          (MCP Server — 24 tools + 3 prompts)
     |
     v
src/executor.ts       (WindowsComputerExecutor — DPI scaling, focus enforcement)
     |
     v  NAPI-RS bridge
native/               (Rust — DXGI capture, UIA tree, input simulation, window management)
```

- **TypeScript layer** (`src/`): Protocol handling, tool definitions, coordinate math, DPI scaling
- **Rust layer** (`native/`): All Windows API interactions — DXGI screen capture, UI Automation, enigo input simulation, window management, clipboard

## Adding a New Tool

1. Add the tool definition to the `TOOLS` array in `src/index.ts`
2. Add the handler case in the `CallToolRequestSchema` switch
3. Add the implementation method in `src/executor.ts`
4. If low-level Windows functionality is needed, add it in `native/src/`
5. Update `README.md` with the new tool's description
6. Test with `node tests/test_driver.js`

## Code Style

- **TypeScript**: Strict mode (`tsconfig.json`), no unused imports
- **Rust**: 2021 edition, standard formatting (`cargo fmt`), no warnings (`cargo clippy`)
- **Coordinate conventions**: Logical coordinates in TypeScript; physical coordinates only in Rust native code

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — New feature or tool
- `fix:` — Bug fix
- `docs:` — Documentation only
- `chore:` — Build, dependencies, tooling
- `refactor:` — Code restructuring without behavior change

## Testing

- `node tests/test_driver.js` — Diagnostic suite (screenshot, display, input, clipboard, notepad lifecycle)
- `node tests/full_regression_driver.js` — Comprehensive regression test (16 tests)
- `node tests/test_workflow.js` — Scenario-based long-chain tests
