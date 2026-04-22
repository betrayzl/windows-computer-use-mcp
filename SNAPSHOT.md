# Project Snapshot: Windows Computer Use MCP
**Date: 2026-04-22**

## 🎯 Current Status: Transitioning from Scripting to Agentic Architecture
We have successfully moved past the "Black Box" stage where commands were sent blindly. We have proven that a **Closed-Loop Verification** (Observe-Decide-Act) can bypass Windows UIPI restrictions that previously blocked automation.

## 🚧 Critical Technical Journey & Lessons Learned

### 1. The "Visible but Unresponsive" Trap (UIPI Challenge)
* **The Problem**: We encountered a scenario where `focus_app` would return `success: true` (because the window was visually in the foreground), but subsequent `type` commands would fail.
* **Root Cause**: A fundamental decoupling between **Window Focus** (`GetForegroundWindow`) and **Input Focus** (`GetFocus`). Windows was intercepting the input stream, leaving the target window in a state where it was "active" but not "ready for input".
* **Failed Attempts**: 
    * *Attempt 1 (Standard API)*: `SetForegroundWindow` and `AttachThreadInput` were silently intercepted by Windows security (UIPI).
    * *Attempt 2 (Alt+Tab Simulation)*: Improved visibility but still failed to establish a stable input channel for typing.

### 2. The "Closed-Loop" Breakthrough (The Turning Point)
* **The Discovery**: By implementing a **Minimal Viable Closed-Loop (MVP)** in the test driver, we discovered that simulating a **physical mouse click** (`click`) on the target area effectively forces Windows to grant input focus to the window, bypassing the API-level interception.
* **Verification**: We proved that `Open -> Focus -> Click (to activate) -> Type` is a working sequence.

### 3. Identified Architectural Flaws
* **Linear vs. Agentic Logic**: Our previous logic was linear (Step A $\to$ Step B). If Step A "succeeded" accordings to the API but failed in reality, the chain broke. We need **Observation-driven** logic.
* **Process Proliferation**: The `open_app` tool lacks a "Singleton" check, leading to multiple instances of the same application (e.g., multiple Notepads).
* **Fragile Assertions**: Test assertions were based on brittle string matching (e.g., `result !== 'true'`), which caused false negatives during debugging.

## 🛠️ Roadmap for Implementation

### Phase 1: Hardening the Execution Layer (Immediate)
* [ ] **Implement Singleton Launch**: Modify `open_app` to check for existing processes before launching new ones.
* [ ] **Integrate "Click-to-Focus"**: Embed the `click` activation logic directly into `type` and `click` methods in `executor.ts`.
* [ ] **Robust Input Probe**: Implement a more reliable `try_send_input_probe` in Rust that verifies both `GetForegroundWindow` and `GetFocus`.

### Phase 2: Agentic Architecture (Next Milestone)
* [ ] **Observer Pattern**: Upgrade tools to return richer context (e.g., screenshot metadata) to support "Observe-Decide" loops.
* [ ] **Self-Correction**: Implement automatic retry-with-click logic within the `executor`.

---
*This snapshot captures the transition from fighting Windows APIs to working with Windows input mechanics.*
