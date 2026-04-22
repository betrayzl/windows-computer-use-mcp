export interface DisplayGeometry {
    left: number;
    top: number;
    width: number;
    height: number;
    scaleFactor: number;
}
export interface ScreenshotResult {
    base64: string;
    width: number;
    height: number;
}
export interface FrontmostApp {
    bundleId?: string;
    displayName: string;
}
export interface InstalledApp {
    displayName: string;
    path?: string;
}
export interface ComputerExecutor {
    getDisplaySize(): Promise<DisplayGeometry>;
    screenshot(opts: {
        excludeProcessNames?: string[];
    }): Promise<ScreenshotResult>;
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
    type(text: string): Promise<void>;
    getFrontmostApp(): Promise<FrontmostApp | null>;
    hideWindows(processNames: string[]): Promise<number[]>;
    unhideWindows(handles: number[]): Promise<void>;
    listInstalledApps(): Promise<InstalledApp[]>;
    openApp(path: string): Promise<void>;
    readClipboard(): Promise<string>;
    writeClipboard(text: string): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map