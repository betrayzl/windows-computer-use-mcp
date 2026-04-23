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
 补充点非常专业且至关重要，它们触及了 NAPI-RS 跨语言桥接层 API 兼容性 和 工具描述语义一致性 的核心工程细节。以下是对这三个问题的明确回应与最终修正方案。

1. 关于 executor.ts 变更的最终定版
原方案提议：

typescript
await this.inputController.key(sequence, 'sequence'); // 引入了新字符串参数
问题审视：引入 'sequence' 这类魔数参数将 Rust 层逻辑选择负担转移给了 TypeScript 层，且破坏了与现有 NAPI 函数签名的严格对应关系。

最终推荐执行方案（更佳工程实践）：

方案：TypeScript 层零参数改动，Rust 层智能判断

我们不修改 executor.ts 原有的调用方式。保持：

typescript
// src/executor.ts 保持不变
async key(sequence: string): Promise<void> {
    await this.inputController.key(sequence, 'press');
    await this.inputController.key(sequence, 'release');
}
Rust 层适配逻辑：
在 input.rs 的 key 方法中，仅当 action 为 "press" 时执行组合键序列，"release" 时直接返回空操作。这样可以保证原本为单键设计的 key(press) + key(release) 调用模式在不改动 TS 代码的情况下，正常执行组合键。

rust
// native/src/input.rs
#[napi]
pub fn key(&mut self, sequence: String, action: String) -> Result<()> {
    match action.as_str() {
        "press" => {
            // 当收到 press 指令时，执行一次完整的组合键序列
            self.execute_key_sequence(&sequence)
        }
        "release" => {
            // release 指令在组合键模式下无实际意义，忽略以保持接口兼容
            Ok(())
        }
        "click" => {
            // 保留原有点击逻辑（单键点击）
            let k = map_single_key(&sequence)?;
            self.enigo.key(k, enigo::Direction::Click)
                .map_err(|e| Error::from_reason(e.to_string()))
        }
        _ => Err(Error::from_reason("Unsupported action".to_string())),
    }
}
优势：

零破坏性：完全维持原有 NAPI 函数签名 key(sequence: String, action: String)。

TypeScript 层无感知：executor.ts、index.ts 均无需修改。

语义正确：Windows 自动化中组合键往往是瞬时完成的“点击”，press + delay + release 的模型并不适用。我们利用 press 触发一次完整序列是合理的变通。

2. 关于 index.ts 工具描述更新
您提醒得非常及时。工具描述是 AI 模型使用该 MCP 服务器的“说明书”，必须与实际能力保持同步。

建议修改 index.ts 中 key 工具的 description：

typescript
{
    name: 'key',
    description: 'Press a key or key combination. Supports single keys (e.g., "escape", "enter") and combinations separated by "+" (e.g., "alt+f4", "ctrl+c", "ctrl+shift+escape").',
    inputSchema: {
        type: 'object',
        properties: {
            sequence: { 
                type: 'string', 
                description: 'The key or key combination to press. Use "+" between keys for combinations.' 
            },
        },
        required: ['sequence'],
    },
}
这确保了能读取 MCP 工具列表的 AI 客户端（如 Claude Desktop）能够正确理解并构造 alt+f4 的调用。

3. 关于 NAPI 接口兼容性与构建流程
您的警告完全正确：在 NAPI-RS 中更改 Rust 导出函数的参数数量或类型会破坏 ABI 兼容性，导致 TypeScript 运行时错误。

最终确认：

上述修正后的 Rust 实现 完全保留了原有的 key(sequence: String, action: String) 签名。

不存在 action 参数被移除或被标记为 Option 的情况。

构建流程（npm run build 或 napi build --platform --release）完成后，TypeScript 类型定义文件 index.d.ts 无需改动即可正常使用。

实施终版清单
根据以上讨论，最终的修正步骤简化为：

修改 native/src/input.rs：替换为包含 parse_key_sequence、execute_key_sequence、map_single_key 以及保留双参数签名的 key 方法的新代码。

修改 src/index.ts：更新 key 工具的 description 为支持组合键的描述文本。

无需修改 src/executor.ts。

重新编译：cd native && npm run build。

运行测试：node test_driver.js 进行端到端验证。

最终结论
您提出的三点是 从高质量原型向生产级软件过渡时必须解决的工程细节问题。完全采纳您的建议后，修复方案将具备：

完全的向后兼容性

准确的接口语义描述

无风险的跨语言类型映射