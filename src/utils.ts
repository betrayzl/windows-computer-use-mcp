/**
 * 显示器信息（与 Rust 层 DebugMonitorInfo 对应）
 */
export interface MonitorInfo {
    left: number;
    top: number;
    right: number;
    bottom: number;
    scaleFactor: number;
    isPrimary: boolean;
}

/**
 * 将逻辑坐标转换为全局物理像素坐标。
 * 逻辑坐标是全局统一的：全局逻辑 X = 物理 X / 缩放因子。
 * 在任意显示器上，此转换与显示器位置无关——位置信息已在 findMonitorByLogicalPoint 中用于定位显示器。
 * @param logicalX 全局逻辑 X
 * @param logicalY 全局逻辑 Y
 * @param monitor 目标显示器（仅用于获取 scaleFactor）
 */
export function logicalToPhysical(logicalX: number, logicalY: number, monitor: MonitorInfo): { x: number; y: number } {
    const physicalX = logicalX * monitor.scaleFactor;
    const physicalY = logicalY * monitor.scaleFactor;
    return { x: Math.round(physicalX), y: Math.round(physicalY) };
}

/**
 * 根据逻辑坐标查找所在的显示器
 * @param x 逻辑 X
 * @param y 逻辑 Y
 * @param monitors 所有显示器信息
 * @returns 匹配的显示器，若未找到则返回主显示器或第一个
 */
export function findMonitorByLogicalPoint(x: number, y: number, monitors: MonitorInfo[]): MonitorInfo | undefined {
    for (const mon of monitors) {
        // 将物理矩形转换为逻辑矩形
        const logicalLeft = mon.left / mon.scaleFactor;
        const logicalTop = mon.top / mon.scaleFactor;
        const logicalRight = mon.right / mon.scaleFactor;
        const logicalBottom = mon.bottom / mon.scaleFactor;
        if (x >= logicalLeft && x < logicalRight && y >= logicalTop && y < logicalBottom) {
            return mon;
        }
    }
    // 回退到主显示器或第一个
    return monitors.find(m => m.isPrimary) || monitors[0];
}

/**
 * 将物理像素坐标转换为全局逻辑坐标。
 * 全局逻辑坐标在整个桌面空间内定义，跨显示器一致。
 * @param physicalX 物理 X
 * @param physicalY 物理 Y
 * @param monitor 目标显示器（仅用于获取 scaleFactor）
 */
export function physicalToLogical(physicalX: number, physicalY: number, monitor: MonitorInfo): { x: number; y: number } {
    const logicalX = physicalX / monitor.scaleFactor;
    const logicalY = physicalY / monitor.scaleFactor;
    return { x: Math.round(logicalX), y: Math.round(logicalY) };
}

/**
 * 根据物理坐标查找所在的显示器
 * @param x 物理 X
 * @param y 物理 Y
 * @param monitors 所有显示器信息
 */
export function findMonitorByPhysicalPoint(x: number, y: number, monitors: MonitorInfo[]): MonitorInfo | undefined {
    for (const mon of monitors) {
        if (x >= mon.left && x < mon.right && y >= mon.top && y < mon.bottom) {
            return mon;
        }
    }
    return monitors.find(m => m.isPrimary) || monitors[0];
}

/**
 * @deprecated 请使用 logicalToPhysical 配合显示器信息
 */
export function getDpiScale(): number {
    return 1.0;
}