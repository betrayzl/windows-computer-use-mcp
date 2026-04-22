---
name: project-snapshot-2026-04-21
description: 精准的项目全景快照，记录核心交付物、当前阶段、现状及后续路线图。
type: project
---

# 🚀 Windows Computer Use MCP 项目全景快照

## 🎯 核心交付物 (Core Deliverables)
构建一个**高精度、高可靠性**的 Windows 自动化 MCP 服务器，实现 AI 智能体对 Windows 环境的“像素级”操控。

### 核心价值主张
*   **视觉与操作的一致性**：确保智能体看到的“逻辑坐标”与实际执行的“物理坐标”在多屏/异构 DPI 环境下实现完美对齐。
*   **环境感知型执行**：不仅仅是坐标转发器，而是具备“环境自愈”能力的执行引擎。它能自动识别遮挡、处理焦点夺取，并确保动作在目标窗口上生效。

---

## 📍 当前阶段 (Current Stage)
**阶段：从“功能原型”向“工业级可靠性”演进的过渡期。**
*   **已完成**：基础分层架构、Rust-TS 桥接、基础键鼠/截图功能、RAII 窗口状态恢复机制、64位句柄兼容性。
*   **正在攻克**：**“环境感知与焦点保证” (Environment Awareness & Focus Guarantee)**。

---

## 📊 现状深度诊断 (Current Status)

### ✅ 已解决的问题
*   **句柄截断**：已统一使用 `i64` 处理 HWND，解决了 64 位系统下的稳定性问题。
*   **状态破坏**：引入 `WindowRestoreGuard` (RAII)，确保窗口隐藏/显示操作具有自愈能力。
*   **基础构建**：`node build.js` 流程已打通。

### ❌ 核心痛点 (Critical Blockers)
*   **遮挡失效 (Occlusion Failure)**：当目标窗口被其他窗口遮挡时，点击指令会落在最上层窗口上，导致自动化流程中断。
*   **焦点劫持防御 (Focus Stealing Protection)**：标准的 `SetForegroundWindow` 经常被 Windows 拦截，导致窗口仅闪烁而不激活，无法接收输入。
*   **盲目点击 (Blind Clicks)**：执行层缺乏“点击前校验目标是否在最前端”的逻辑。

---

## 🗺️ 后续开发路线图 (Roadmap)

### 第一阶段：建立“绝对坐标与环境感知引擎” (Precision & Awareness) —— **[当前重点]**
*   **目标**：解决“点不准”和“点不到”的问题。
*   **关键动作**：
    1.  **Rust 层**：扩展 `WindowManager`，返回显示器全局偏移量 (Monitor Origin) 和实时 DPI Scale。
    2.  **TS 层**：重构 `logicalToPhysical` 算法，实现 `Physical = Monitor_Origin + (Logical * Scale)`。
    3.  **TS 层**：实现 `ensureFocus(target)` 逻辑，在执行点击前强制对齐 Z-Order。

### 第二阶段：强化“焦点控制与原子操作” (Focus Guarantee)
*   **目标**：解决“打不进”的问题。
*   **关键动作**：
    1.  **强化激活序列**：在 Rust 层实现更强力的窗口激活逻辑（处理 `SW_RESTORE` 及可能的焦点劫持）。
    2.  **原子化指令**：将 `click` 升级为 `ensure_focus_and_click`。

### 第三阶段：工程化加固 (Hardening)
*   **目标**：提升生产环境稳定性。
*   **关键动作**：完善错误处理体系、增加集成测试套件、优化 DXGI 截图性能。

---

## 💡 给开发者的提示
**核心准则**：不要试图通过增加超时时间来掩盖问题，而要通过增强 Rust 层的环境感知能力来从根源解决问题。
最新进展与关键发现 (2026-04-21)

  ### 🔍 核心问题定性：焦点劫持与“后台活跃”陷ile
  在最新的测试中，我们发现了一个关键的失效模式：
  * **现象**：`openApp` 成功启动了进程（如
  Notepad），但窗口始终处于“后台”或“被遮挡”状态，无法获得系统的 `Foreground`
  权限。
  * **根源**：Windows 的安全机制（Focus Stealing Prevention）拦截了 MCP Server
  尝试通过 `SetForegroundWindow` 夺取焦点的请求。
  * **后果**：由于目标窗口未被真正激活，后续的 `click` 和 `type`
  指令会发送到当前的终端窗口或正在使用的交互窗口上，导致自动化流程在“逻辑上正确
  ，物理上无效”的状态下崩溃。

  ### 🛠️ 当前技术瓶颈
  * **Windows API 局限性**：单纯的 `SetForegroundWindow`
  在非交互式环境下极易被系统拦截，导致窗口仅在任务栏闪烁。
  * **执行器盲目性**：`executor.ts` 的指令执行逻辑目前是“位置驱动”而非“状态驱动”
  ，它只管在坐标点点击，而不检查该坐标点对应的窗口是否真正处于可交互的
  `Foreground` 状态。

  ### 🚀 下一步攻坚计划 (Phase 1.5: Focus Hardening)

  我们将不再仅仅依赖于“等待窗口出现”，而是转向**“强制环境对齐”**。

  #### 1. 强化 Rust 层的“暴力激活”能力 (`native/src/window.rs`)
  *   **引入组合激活序列**：不再单一调用 `SetForegroundWindow`，而是尝试结合
  `ShowWindow(hwnd, SW_RESTORE)` $\rightarrow$ `SetForegroundWindow(hwnd)`
  $\rightarrow$ 甚至尝试通过 `AttachThreadInput`
  将目标线程与当前活动线程挂接，以强行“借用”焦点。
  *   **增加状态回馈**：让 Rust 层能更明确地返回“激活尝试是否被系统拒绝”的状态。

  #### 2. 实现 TS 层的“指令前置校验” (`src/executor.ts`)
  *   **实现
  `ensureWindowIsForeground(processName)`**：这是一个原子化的防御性方法。
  *   **改造指令流**：将所有的 `click`, `type`, `drag` 指令升级为：
      `[校验目标是否为当前前台] -> [若不是，执行强制激活序列] -> [确认激活成功]
  -> [执行物理操作]`。

  #### 3. 验证目标
  *   通过 `test_driver.js` 验证：即使在用户正在操作终端的情况下，启动的 Notepad
   也能被强制拉到最前端并成功接收输入。
