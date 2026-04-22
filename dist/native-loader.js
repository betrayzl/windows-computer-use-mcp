import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';
/**
 * Loads the win-cu-native.node module using a fallback strategy.
 * Enhanced with createRequire to support ESM environments.
 */
export function requireNativeModule() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Create a require function compatible with ESM
    const require = createRequire(import.meta.url);
    const possiblePaths = [
        // 1. 打包后与 index.js 同目录 (ncc 场景) - 优先尝试
        path.join(__dirname, 'win-cu-native.node'),
        path.join(__dirname, 'win-cu-native.win32-x64-msvc.node'),
        // 2. 当前工作目录 (如果用户在 bundle 目录下运行)
        path.join(process.cwd(), 'win-cu-native.node'),
        path.join(process.cwd(), 'win-cu-native.win32-x64-msvc.node'),
        // 3. 开发环境下的相对路径 (src/ -> native/)
        path.join(__dirname, '..', 'native', 'win-cu-native.win32-x64-msvc.node'),
        path.join(__dirname, '..', 'native', 'win-cu-native.node'),
    ];
    console.error(`[NativeLoader] Attempting to load native module. Base __dirname: ${__dirname}`);
    console.error(`[NativeLoader] Current working directory: ${process.cwd()}`);
    for (const p of possiblePaths) {
        try {
            console.error(`[NativeLoader] Checking path: ${p}`);
            if (fs.existsSync(p)) {
                console.error(`[NativeLoader] Found file at: ${p}. Attempting require...`);
                const mod = require(p);
                console.error(`[NativeLoader] Successfully loaded module from: ${p}`);
                return mod;
            }
            else {
                console.error(`[NativeLoader] File does not exist: ${p}`);
            }
        }
        catch (err) {
            console.error(`[NativeLoader] Failed to require ${p}: ${err.message}`);
            continue;
        }
    }
    throw new Error('无法加载原生模块 win-cu-native.node。请确保编译后的 .node 文件在预期路径下。请检查 [NativeLoader] 输出的尝试路径。');
}
//# sourceMappingURL=native-loader.js.map