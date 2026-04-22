/**
 * 将逻辑坐标（0 ~ width-1, 0 ~ height-1）转换为全局物理像素坐标
 * @param logicalX 目标点在所属显示器上的逻辑 X 坐标
 * @param logicalY 目标点在所属显示器上的逻辑 Y 坐标
 * @param monitor 目标显示器信息
 */
export function logicalToPhysical(logicalX, logicalY, monitor) {
    const physicalX = monitor.left + logicalX * monitor.scaleFactor;
    const physicalY = monitor.top + logicalY * monitor.scaleFactor;
    return { x: Math.round(physicalX), y: Math.round(physicalY) };
}
/**
 * 根据逻辑坐标查找所在的显示器
 * @param x 逻辑 X
 * @param y 逻辑 Y
 * @param monitors 所有显示器信息
 * @returns 匹配的显示器，若未找到则返回主显示器或第一个
 */
export function findMonitorByLogicalPoint(x, y, monitors) {
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
 * @deprecated 请使用 logicalToPhysical 配合显示器信息
 */
export function getDpiScale() {
    return 1.0;
}
//# sourceMappingURL=utils.js.map