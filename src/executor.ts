import type { ComputerExecutor, DisplayGeometry, ScreenshotResult, FrontmostApp, InstalledApp, UiElementInfo } from './types.js';
import { requireNativeModule } from './native-loader.js';
import { logicalToPhysical, findMonitorByLogicalPoint } from './utils.js';
import type { MonitorInfo } from './utils.js';

export class WindowsComputerExecutor implements ComputerExecutor {
  private native: any;
  private screenCapture: any;
  private inputController: any;
  private windowManager: any;
  private monitors: MonitorInfo[] = [];

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

  private async refreshMonitors(): Promise<void> {
    if (this.monitors.length === 0) {
      try {
        this.monitors = await this.native.getDebugMonitorInfo();
        console.error('[DEBUG] Monitors refreshed:', this.monitors);
      } catch (e) {
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

  async getDisplaySize(): Promise<DisplayGeometry> {
    const { left, top, width, height, scaleFactor } = await this.windowManager.getDisplaySize();
    return { left, top, width, height, scaleFactor };
  }

  async screenshot(opts: { excludeProcessNames?: string[] }): Promise<ScreenshotResult> {
    const quality = 0.75;
    const { width, height } = await this.getDisplaySize();
    const targetWidth = Math.floor(width);
    const targetHeight = Math.floor(height);
    const process_names = opts.excludeProcessNames;
    let base64: string;
    if (process_names && process_names.length > 0) {
      base64 = await this.screenCapture.captureExcluding(process_names, quality, targetWidth, targetHeight);
    } else {
      base64 = await this.screenCapture.captureScreen(quality, targetWidth, targetHeight);
    }
    if (typeof base64 === 'string' && base64.startsWith('{"base64":')) {
      try {
        const parsed = JSON.parse(base64);
        if (parsed.base64) base64 = parsed.base64;
      } catch (e) { console.error("[DEBUG] Failed to parse wrapped base64 JSON:", e); }
    }
    if (base64.length < 200) console.error(`[DEBUG] screenshot returned short content (${base64.length} chars): "${base64}"`);
    return { base64, width: targetWidth, height: targetHeight };
  }

  private async ensureForeground(processName: string): Promise<boolean> {
    console.log(`[DEBUG] ensureForeground: Verifying focus for ${processName}`);
    let attempts = 0;
    const maxAttempts = 5;
    const timeout = 3000;
    const start = Date.now();
    while (attempts < maxAttempts && (Date.now() - start) < timeout) {
      attempts++;
      await this.focusApp(processName);
      const frontmost = await this.getFrontmostApp();
      if (frontmost) {
        const idMatch = frontmost.bundleId && frontmost.bundleId.toLowerCase().includes(processName.toLowerCase());
        const titleMatch = frontmost.displayName && frontmost.displayName.toLowerCase().includes(processName.toLowerCase());
        if (idMatch || titleMatch) {
          await new Promise(r => setTimeout(r, 250));
          const recheck = await this.getFrontmostApp();
          if (recheck) {
            const reIdMatch = recheck.bundleId && recheck.bundleId.toLowerCase().includes(processName.toLowerCase());
            const reTitleMatch = recheck.displayName && recheck.displayName.toLowerCase().includes(processName.toLowerCase());
            if (reIdMatch || reTitleMatch) {
              console.log(`[DEBUG] ensureForeground: ${processName} confirmed stable.`);
              return true;
            }
          }
        }
      }
      console.warn(`[WARN] ensureForeground: ${processName} not frontmost. Attempt ${attempts}/${maxAttempts}`);
      await new Promise(r => setTimeout(r, 500));
    }
    console.error(`[ERROR] ensureForeground: Failed to secure focus for ${processName} after ${attempts} attempts.`);
    return false;
  }

  async moveMouse(x: number, y: number): Promise<void> {
    await this.refreshMonitors();
    const monitor = findMonitorByLogicalPoint(x, y, this.monitors);
    if (!monitor) {
      await this.inputController.moveMouse(x, y);
      return;
    }
    const { x: physX, y: physY } = logicalToPhysical(x, y, monitor);
    await this.inputController.moveMouse(physX, physY);
  }

  async click(x: number, y: number, button: 'left' | 'right' | 'middle', count = 1, processName?: string): Promise<void> {
    if (processName) {
      const isFocused = await this.ensureForeground(processName);
      if (!isFocused) throw new Error(`Failed to ensure ${processName} is in foreground before click.`);
    }
    await this.refreshMonitors();
    const monitor = findMonitorByLogicalPoint(x, y, this.monitors);
    if (!monitor) {
      await this.inputController.moveMouse(x, y);
    } else {
      const { x: physX, y: physY } = logicalToPhysical(x, y, monitor);
      await this.inputController.moveMouse(physX, physY);
    }
    for (let i = 0; i < count; i++) {
      await this.inputController.mouseButton(button, 'click');
    }
  }

  async drag(from: { x: number; y: number } | undefined, to: { x: number; y: number }): Promise<void> {
    await this.refreshMonitors();
    const monitor = from ? findMonitorByLogicalPoint(from.x, from.y, this.monitors) : findMonitorByLogicalPoint(to.x, to.y, this.monitors);
    const scale = monitor?.scaleFactor || (await this.getDisplaySize()).scaleFactor;
    if (from) {
      const physFrom = logicalToPhysical(from.x, from.y, monitor || { left: 0, top: 0, scaleFactor: scale } as MonitorInfo);
      await this.inputController.moveMouse(physFrom.x, physFrom.y);
      await this.inputController.mouseButton('left', 'press');
    } else {
      await this.inputController.mouseButton('left', 'press');
    }
    const physTo = logicalToPhysical(to.x, to.y, monitor || { left: 0, top: 0, scaleFactor: scale } as MonitorInfo);
    await this.inputController.moveMouse(physTo.x, physTo.y);
    await this.inputController.mouseButton('left', 'release');
  }

  async scroll(x: number, y: number, dx: number, dy: number): Promise<void> {
    if (typeof this.inputController.scroll === 'function') {
      await this.inputController.scroll(x, y, dx, dy);
    } else {
      console.error('[DEBUG] scroll method not found on InputController');
    }
  }

  async key(sequence: string): Promise<void> {
    try {
      await this.inputController.key(sequence, 'press');
    } finally {
      await this.inputController.releaseAllModifiers();
    }
  }

  // 保持与 types.ts ComputerExecutor 接口一致：type(text: string)
  // 我们内部可以处理可选 processName，但不暴露给接口
  async type(text: string, processName?: string): Promise<void> {
    if (processName) {
      const isFocused = await this.ensureForeground(processName);
      if (!isFocused) throw new Error(`Failed to ensure ${processName} is in foreground before type.`);
    }
    await this.inputController.typeText(text);
  }

  async focusApp(processName: string): Promise<boolean> {
    return await this.windowManager.focusWindow(processName);
  }

  async getFrontmostApp(): Promise<FrontmostApp | null> {
    const info = await this.windowManager.getForegroundApp();
    if (!info) return null;
    return {
      displayName: info.title,
      bundleId: info.processPath  // NAPI-RS 自动驼峰：process_path → processPath
    };
  }

  async hideWindows(processNames: string[]): Promise<number[]> {
    return await this.windowManager.hideWindows(processNames);
  }

  async unhideWindows(handles: number[]): Promise<void> {
    return await this.windowManager.unhideWindows(handles);
  }

  async listInstalledApps(): Promise<InstalledApp[]> {
    const apps = await this.native.listInstalledApps();
    return apps.map((app: any) => ({
      displayName: app.displayName,        // NAPI-RS 自动驼峰
      path: app.installLocation
    }));
  }

  async openApp(path: string): Promise<void> {
    const processName = path.split('\\').pop()?.split('.').shift() || path;
    try {
      const isRunning = await this.windowManager.isProcessRunning(processName);
      if (isRunning) {
        console.log(`[DEBUG] ${processName} is already running. Activating existing window...`);
        const activated = await this.ensureForeground(processName);
        if (!activated) {
          console.warn(`[WARN] Could not fully activate existing ${processName}, proceeding with launch anyway.`);
          await this.native.openApp(path);
          await new Promise(r => setTimeout(r, 800));
          await this.ensureForeground(processName);
        }
      } else {
        console.log(`[DEBUG] ${processName} is not running. Launching new instance...`);
        await this.native.openApp(path);
        await new Promise(r => setTimeout(r, 800));
        const activated = await this.ensureForeground(processName);
        if (!activated) {
          const actualFrontmost = await this.getFrontmostApp();
          const actualName = actualFrontmost ? actualFrontmost.displayName : 'None';
          console.error(`[DEBUG] openApp: Failed to fully activate ${processName}. Current frontmost: ${actualName}`);
        } else {
          console.log(`[DEBUG] openApp: Successfully activated ${processName}`);
        }
      }
    } catch (error) {
      console.error(`[ERROR] openApp failed: ${error}`);
      await this.native.openApp(path);
      await new Promise(r => setTimeout(r, 800));
      await this.ensureForeground(processName);
    }
  }

  async readClipboard(): Promise<string> {
    return await this.native.readClipboard();
  }

  async writeClipboard(text: string): Promise<void> {
    await this.native.writeClipboard(text);
  }

  async getUiElements(): Promise<UiElementInfo[]> {
    return await this.native.getUiElements();
  }

  async wait(duration: number): Promise<void> {
    await new Promise(r => setTimeout(r, duration * 1000));
  }
}