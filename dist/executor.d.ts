import type { ComputerExecutor, DisplayGeometry, ScreenshotResult, FrontmostApp, InstalledApp } from './types.js';
export declare class WindowsComputerExecutor implements ComputerExecutor {
    private native;
    private screenCapture;
    private inputController;
    private windowManager;
    private monitors;
    constructor();
    private refreshMonitors;
    getDisplaySize(): Promise<DisplayGeometry>;
    screenshot(opts: {
        excludeProcessNames?: string[];
    }): Promise<ScreenshotResult>;
    /**
     * 核心防御性方法：确保指定进程的窗口处于前台
     * @param processName 目标进程名
     * @returns 是否成功获得焦点
     */
    private ensureForeground;
    moveMouse(x: number, y: number): Promise<void>;
    click(x: number, y: number, button: 'left' | 'right' | 'middle', count?: number, processName?: string): Promise<void>;
    drag(from: {
        x: number;
        y: number;
    } | undefined, to: {
        x: number;
        y: number;
    }): Promise<void>;
    scroll(x: number, y: number, dx: number, dy: number): Promise<void>;
    key(sequence: string): Promise<void>;
    type(text: string, processName?: string): Promise<void>;
    focusApp(processName: string): Promise<boolean>;
    getFrontmostApp(): Promise<FrontmostApp | null>;
    hideWindows(processNames: string[]): Promise<number[]>;
    unhideWindows(handles: number[]): Promise<void>;
    listInstalledApps(): Promise<InstalledApp[]>;
    openApp(path: string): Promise<void>;
    readClipboard(): Promise<string>;
    writeClipboard(text: string): Promise<void>;
}
//# sourceMappingURL=executor.d.ts.map