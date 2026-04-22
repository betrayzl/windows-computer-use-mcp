import { requireNativeModule } from './native-loader.js';
import { logicalToPhysical, findMonitorByLogicalPoint } from './utils.js';
export class WindowsComputerExecutor {
    native;
    screenCapture;
    inputController;
    windowManager;
    monitors = [];
    constructor() {
        this.native = requireNativeModule();
        this.screenCapture = new this.native.ScreenCapture();
        this.inputController = new this.native.InputController();
        this.windowManager = new this.native.WindowManager();
        console.error(`[DEBUG] Native module loaded. Keys: ${Object.keys(this.native)}`);
        console.error(`[DEBUG] ScreenCapture instance created.`);
        console.error(`[DEBUG] InputController instance created.`);
        console.error(`[DEBUG] WindowManager instance created.`);
    }
    async refreshMonitors() {
        if (this.monitors.length === 0) {
            try {
                this.monitors = await this.native.getDebugMonitorInfo();
                console.error('[DEBUG] Monitors refreshed:', this.monitors);
            }
            catch (e) {
                console.error('[DEBUG] Failed to refresh monitors, using fallback:', e);
                const display = await this.getDisplaySize();
                this.monitors = [{
                        left: 0, top: 0,
                        right: display.width, bottom: display.height,
                        scaleFactor: display.scaleFactor,
                        isPrimary: true
                    }];
            }
        }
    }
    async getDisplaySize() {
        const { left, top, width, height, scale_factor } = await this.windowManager.getDisplaySize();
        return { left, top, width, height, scaleFactor: scale_factor };
    }
    async screenshot(opts) {
        const quality = 0.75;
        const { width, height } = await this.getDisplaySize();
        const targetWidth = Math.floor(width);
        const targetHeight = Math.floor(height);
        const process_names = opts.excludeProcessNames;
        let base64;
        if (process_names && process_names.length > 0) {
            base64 = await this.screenCapture.captureExcluding(process_names, quality, targetWidth, targetHeight);
        }
        else {
            base64 = await this.screenCapture.captureScreen(quality, targetWidth, targetHeight);
        }
        if (typeof base64 === 'string' && base64.startsWith('{"base64":')) {
            try {
                const parsed = JSON.parse(base64);
                if (parsed.base64) {
                    base64 = parsed.base64;
                }
            }
            catch (e) {
                console.error("[DEBUG] Failed to parse wrapped base64 JSON:", e);
            }
        }
        if (base64.length < 200) {
            console.error(`[DEBUG] screenshot returned short content (${base64.length} chars): "${base64}"`);
        }
        return { base64, width: targetWidth, height: targetHeight };
    }
    // ========== 替换点 1：全新的 ensureForeground 方法 ==========
    /**
     * 核心防御性方法：确保指定进程的窗口处于前台
     * @param processName 目标进程名
     * @returns 是否成功获得焦点
     */
    async ensureForeground(processName) {
        console.log(`[DEBUG] ensureForeground: Verifying focus for ${processName}`);
        let attempts = 0;
        const maxAttempts = 5;
        const timeout = 3000; // 总超时 3s
        const start = Date.now();
        while (attempts < maxAttempts && (Date.now() - start) < timeout) {
            attempts++;
            // 1. 尝试强制激活
            await this.focusApp(processName);
            // 2. 轮询验证
            const frontmost = await this.getFrontmostApp();
            if (frontmost && frontmost.displayName.toLowerCase().includes(processName.toLowerCase())) {
                // 额外等待输入状态稳定
                await new Promise(r => setTimeout(r, 200));
                console.log(`[DEBUG] ensureForeground: ${processName} is now frontmost.`);
                return true;
            }
            console.warn(`[WARN] ensureForeground: ${processName} not frontmost. Attempt ${attempts}/${maxAttempts}`);
            await new Promise(r => setTimeout(r, 500));
        }
        console.error(`[ERROR] ensureForeground: Failed to secure focus for ${processName} after ${attempts} attempts.`);
        return false;
    }
    async moveMouse(x, y) {
        await this.refreshMonitors();
        const monitor = findMonitorByLogicalPoint(x, y, this.monitors);
        if (!monitor) {
            console.error(`[DEBUG] No monitor found for logical (${x}, ${y}), moving without offset`);
            await this.inputController.moveMouse(x, y);
            return;
        }
        const { x: physX, y: physY } = logicalToPhysical(x, y, monitor);
        console.error(`[DEBUG] moveMouse: logical(${x}, ${y}) -> physical(${physX}, ${physY}) on monitor ${monitor.isPrimary ? 'primary' : 'secondary'}`);
        await this.inputController.moveMouse(physX, physY);
    }
    // ========== 替换点 2：click 方法（新增 processName 参数并调用 ensureForeground） ==========
    async click(x, y, button, count = 1, processName) {
        if (processName) {
            const isFocused = await this.ensureForeground(processName);
            if (!isFocused) {
                throw new Error(`Failed to ensure ${processName} is in foreground before click.`);
            }
        }
        await this.refreshMonitors();
        const monitor = findMonitorByLogicalPoint(x, y, this.monitors);
        if (!monitor) {
            await this.inputController.moveMouse(x, y);
        }
        else {
            const { x: physX, y: physY } = logicalToPhysical(x, y, monitor);
            await this.inputController.moveMouse(physX, physY);
        }
        for (let i = 0; i < count; i++) {
            await this.inputController.mouseButton(button, 'click');
        }
    }
    async drag(from, to) {
        await this.refreshMonitors();
        const monitor = from ? findMonitorByLogicalPoint(from.x, from.y, this.monitors) : findMonitorByLogicalPoint(to.x, to.y, this.monitors);
        const scale = monitor?.scaleFactor || (await this.getDisplaySize()).scaleFactor;
        const offset = monitor ? { left: monitor.left, top: monitor.top } : { left: 0, top: 0 };
        if (from) {
            const physFrom = logicalToPhysical(from.x, from.y, monitor || { left: 0, top: 0, scaleFactor: scale });
            await this.inputController.moveMouse(physFrom.x, physFrom.y);
            await this.inputController.mouseButton('left', 'press');
        }
        else {
            await this.inputController.mouseButton('left', 'press');
        }
        const physTo = logicalToPhysical(to.x, to.y, monitor || { left: 0, top: 0, scaleFactor: scale });
        await this.inputController.moveMouse(physTo.x, physTo.y);
        await this.inputController.mouseButton('left', 'release');
    }
    async scroll(x, y, dx, dy) {
        if (typeof this.inputController.scroll === 'function') {
            await this.inputController.scroll(x, y, dx, dy);
        }
        else {
            console.error('[DEBUG] scroll method not found on InputController');
        }
    }
    async key(sequence) {
        await this.inputController.key(sequence, 'press');
        await this.inputController.key(sequence, 'release');
    }
    // ========== 替换点 3：type 方法（新增 processName 参数并调用 ensureForeground） ==========
    async type(text, processName) {
        if (processName) {
            const isFocused = await this.ensureForeground(processName);
            if (!isFocused) {
                throw new Error(`Failed to ensure ${processName} is in foreground before type.`);
            }
        }
        await this.inputController.typeText(text);
    }
    async focusApp(processName) {
        return await this.windowManager.focusWindow(processName);
    }
    async getFrontmostApp() {
        const info = await this.windowManager.getForegroundApp();
        if (!info)
            return null;
        return {
            displayName: info.title,
            bundleId: info.process_path
        };
    }
    async hideWindows(processNames) {
        return await this.windowManager.hideWindows(processNames);
    }
    async unhideWindows(handles) {
        return await this.windowManager.unhideWindows(handles);
    }
    async listInstalledApps() {
        const apps = await this.native.listInstalledApps();
        return apps.map((app) => ({
            displayName: app.display_name,
            path: app.install_location
        }));
    }
    async openApp(path) {
        await this.native.openApp(path);
        const processName = path.split('\\').pop()?.split('.').shift() || path;
        let attempts = 0;
        const maxAttempts = 15;
        let activated = false;
        while (attempts < maxAttempts) {
            attempts++;
            await this.focusApp(processName);
            const frontmost = await this.getFrontmostApp();
            if (frontmost && frontmost.displayName.toLowerCase().includes(processName.toLowerCase())) {
                activated = true;
                break;
            }
            const delay = Math.min(1000, 200 * attempts);
            await new Promise(r => setTimeout(r, delay));
        }
        if (!activated) {
            const actualFrontmost = await this.getFrontmostApp();
            const actualName = actualFrontmost ? actualFrontmost.displayName : 'None';
            console.error(`[DEBUG] openApp: Failed to fully activate ${processName} after ${maxAttempts} attempts. Current frontmost: ${actualName}`);
        }
        else {
            console.log(`[DEBUG] openApp: Successfully activated ${processName}`);
        }
    }
    async readClipboard() {
        return await this.native.readClipboard();
    }
    async writeClipboard(text) {
        await this.native.writeClipboard(text);
    }
}
//# sourceMappingURL=executor.js.map