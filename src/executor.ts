import type { ComputerExecutor, DisplayGeometry, ScreenshotResult, FrontmostApp, InstalledApp, UiElementInfo, WindowRect } from './types.js';
import { requireNativeModule } from './native-loader.js';
import { logicalToPhysical, physicalToLogical, findMonitorByLogicalPoint, findMonitorByPhysicalPoint } from './utils.js';
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

  async getUiElements(processName?: string): Promise<UiElementInfo[]> {
    const elements = await this.native.getUiElements(processName || null);
    // UIA 返回物理像素坐标，需转为逻辑坐标以保持与 click/move 工具一致
    await this.refreshMonitors();
    return elements.map((el: UiElementInfo) => {
      if (this.monitors.length > 0) {
        const monitor = findMonitorByPhysicalPoint(el.x + el.width / 2, el.y + el.height / 2, this.monitors);
        if (monitor && monitor.scaleFactor !== 1.0) {
          const logical = physicalToLogical(el.x, el.y, monitor);
          const logicalW = Math.round(el.width / monitor.scaleFactor);
          const logicalH = Math.round(el.height / monitor.scaleFactor);
          return { ...el, x: logical.x, y: logical.y, width: logicalW, height: logicalH };
        }
      }
      return el;
    });
  }

  async showDesktop(): Promise<void> {
    // Win+D: show desktop (minimize all windows)
    await this.key('meta+d');
    await new Promise(r => setTimeout(r, 500)); // Wait for animation
  }

  async getDesktopIcons(): Promise<{ elements: UiElementInfo[]; hint: string }> {
    // 先显示桌面，确保图标可见且不被遮挡
    await this.showDesktop();
    const elements = await this.getUiElements('explorer');
    const icons = elements.filter(e =>
      e.controlType === 'list_item' && e.name && e.name.trim().length > 0
    );
    const hint = icons.length > 0
      ? `已列出 ${icons.length} 个桌面图标及其坐标。你可以直接使用 click 工具点击任意图标的中心坐标来启动它。`
      : '未找到桌面图标，可以尝试使用 screenshot 查看桌面状态。';
    return { elements: icons, hint };
  }

  async perceive(targetProcess?: string): Promise<{
    method: string;
    elements: UiElementInfo[];
    description: string;
    display: { width: number; height: number; scaleFactor: number } | null;
    foreground: FrontmostApp | null;
    warning: string | null;
    hint: string;
  }> {
    const elements = targetProcess
      ? await this.getUiElements(targetProcess)
      : await this.getUiElements();

    const visibleElements = elements.filter(e =>
      e.visible && e.width > 10 && e.height > 10 && e.depth <= 3
    );

    const display = await this.getDisplaySize().catch(() => null);
    const foreground = await this.getFrontmostApp().catch(() => null);

    // 检测遮挡：如果指定了目标进程，检查它是否在前台
    let warning: string | null = null;
    if (targetProcess && foreground) {
      const fgBundle = (foreground.bundleId || '').toLowerCase();
      const fgName = (foreground.displayName || '').toLowerCase();
      const target = targetProcess.toLowerCase();
      const isForeground = fgBundle.includes(target) || fgName.includes(target);
      if (!isForeground) {
        warning = `注意：目标 "${targetProcess}" 不在前台！当前前台是 "${foreground.displayName}"。`
          + ` 返回的元素坐标可能被其他窗口遮挡。建议先调用 focus_app({ processName: "${targetProcess}" }) 将其带到前台，`
          + ` 或调用 show_desktop() 显示桌面。`;
      }
    }

    let description: string;
    if (visibleElements.length > 0) {
      const lines: string[] = [];
      lines.push(`前台: ${foreground?.displayName ?? 'unknown'}`);
      if (warning) lines.push(`⚠️ ${warning}`);
      lines.push(`通过 UI Automation 扫描到 ${visibleElements.length} 个可见元素：`);
      visibleElements.sort((a, b) => a.y - b.y || a.x - b.x);
      for (const el of visibleElements.slice(0, 40)) {
        const label = el.name ? ` "${el.name.slice(0, 100)}"` : '';
        lines.push(`  [${el.controlType}]${label} at (${el.x},${el.y}) ${el.width}x${el.height}`);
      }
      if (visibleElements.length > 40) {
        lines.push(`  ... 以及另外 ${visibleElements.length - 40} 个元素`);
      }
      description = lines.join('\n');
    } else {
      const fgNote = foreground ? `当前前台: ${foreground.displayName}` : '';
      description = `UI Automation 未扫描到可见元素。${fgNote}`
        + (warning ? ` ⚠️ ${warning}` : '')
        + ' 可以尝试使用 screenshot 获取屏幕截图。';
    }

    const hint = warning
      ? `⚠️ 检测到遮挡：${warning} 请先解决遮挡问题后再操作。`
      : visibleElements.length > 0
        ? '已获取 UI 元素列表。使用 click 点击元素坐标，使用 type 输入文本，使用 key 发送按键。如需完整的界面描述可调用 describe_screen。'
        : '当前界面元素较少。可以使用 screenshot 查看屏幕内容，或使用 describe_screen 获取文本描述。';

    return { method: 'uia', elements, description, display, foreground, warning, hint };
  }

  async captureRegion(x: number, y: number, width: number, height: number, quality: number, maxWidth: number, maxHeight: number): Promise<string> {
    return await this.screenCapture.captureRegion(x, y, width, height, quality, maxWidth, maxHeight);
  }

  async getWindowRect(processName: string): Promise<WindowRect | null> {
    return await this.windowManager.getWindowRect(processName);
  }

  async describeScreen(): Promise<string> {
    const [foreground, display, elements] = await Promise.all([
      this.getFrontmostApp().catch(() => null),
      this.getDisplaySize().catch(() => null),
      this.getUiElements().catch(() => [] as UiElementInfo[]),
    ]);

    const lines: string[] = [];
    if (display) {
      const logicalW = Math.round(display.width / display.scaleFactor);
      const logicalH = Math.round(display.height / display.scaleFactor);
      lines.push(`Display: ${display.width}x${display.height} physical (${logicalW}x${logicalH} logical) @${display.scaleFactor}x scale`);
    } else {
      lines.push('Display: unknown');
    }
    lines.push(`Foreground: ${foreground?.displayName ?? 'unknown'} (${foreground?.bundleId ?? '?'})`);

    // Filter visible, sizable elements at reasonable depth
    const visible = elements.filter(e =>
      e.visible && e.width > 10 && e.height > 10 && e.depth <= 3
    );

    // Sort top-to-bottom, left-to-right
    visible.sort((a, b) => a.y - b.y || a.x - b.x);

    if (visible.length > 0) {
      lines.push('', `UI Elements (${visible.length} visible):`);
      for (const el of visible) {
        const label = el.name ? ` "${el.name.slice(0, 80)}"` : '';
        const state = el.enabled ? '' : ' [disabled]';
        lines.push(`  [${el.controlType}]${label} at (${el.x},${el.y}) ${el.width}x${el.height}${state}`);
      }
    } else {
      lines.push('', 'No visible UI elements found.');
    }

    return lines.join('\n');
  }

  async wait(duration: number): Promise<void> {
    await new Promise(r => setTimeout(r, duration * 1000));
  }

  async arrangeDesktopIcons(positions: Array<{ name: string; x: number; y: number }>): Promise<number> {
    return await this.windowManager.arrangeDesktopIcons(positions);
  }
}