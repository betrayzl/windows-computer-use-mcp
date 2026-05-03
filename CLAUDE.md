# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

The project uses a custom build process that involves compiling a Rust native module, compiling TypeScript, and bundling the output into a single executable package.

- **Full Build**: `node build.js`
  - This runs the complete pipeline:
    1. **Compile Rust native module**: Runs `napi build --platform --release` in the `native/` directory.
    2. **Compile TypeScript**: Runs `npx tsc` to generate JavaScript from TypeScript sources.
    3. **Bundling**: Uses `@vercel/ncc` to bundle the code in `dist/index.js` into the `bundle/` directory.
    4. **Finalize**: Copies the compiled `.node` module into the `bundle/` folder and renames it to `win-cu-native.node`.
- **TypeScript Compilation Only**: `npx tsc`
- **Native Module Build Only**: `cd native && napi build --platform --release`

## Project Structure

This is a Model Context Protocol (MCP) server providing Windows automation capabilities.

- `src/`: TypeScript source code.
  - `index.ts`: MCP server entry point; defines the server and all available tools.
  - `executor.ts`: Implementation of the `ComputerExecutor` interface; orchestrates calls to the native module.
  - `native-loader.ts`: Handles the logic for finding and loading the compiled `.node` binary.
  - `types.ts`: Core TypeScript interface definitions (e.g., `ComputerExecutor`, `DisplayGeometry`).
  - `utils.ts`: Helper functions for coordinate conversion (logical to physical) and DPI scaling.
  - Feature toggles and cross-instance mutual exclusion are planned but not yet implemented.
- `native/`: Rust source code using `napi-rs` for high-performance Windows API interaction.
  - Provides core capabilities: Mouse/Keyboard simulation (`enigo`), Screen capture (`dxgi`), Window management (`windows` crate), and Clipboard access (`arboard`).
- `dist/`: Compiled TypeScript output (gitignored).
- `bundle/`: Production-ready output (gitignored) containing `index.js` and the `.node` module.
- `tests/`: Test scripts and regression drivers.

## Architecture

The server follows a layered architecture:
1. **MCP Layer (`src/index.ts`)**: Handles protocol communication via `stdio` and maps tool requests to the executor.
2. **Executor Layer (`src/executor.ts`)**: Provides a high-level API, manages DPI scaling, and handles coordinate transformations.
3. **Native Layer (`native/`)**: Performs low-level Windows API calls via Rust and NAPI-RS for reliable OS interaction.
4. **Loader Layer (`src/native-loader.ts`)**: Bridges the TypeScript environment with the compiled Rust binary.

## Development Notes

- **DPI Awareness**: Windows uses both logical and physical coordinates. The `executor.ts` and `utils.ts` are responsible for ensuring mouse movements and clicks use physical pixels while respecting display scaling.
- **Native Dependencies**: Requires the Rust toolchain and `napi-cli` installed.
- **Permissions**: Some Windows operations (like window manipulation) may require Administrator privileges.
- **Runtime**: The server is intended to be run using `node bundle/index.js`.
