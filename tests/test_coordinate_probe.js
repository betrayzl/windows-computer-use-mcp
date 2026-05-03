import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const native = require('./bundle/win-cu-native.node');

console.log('=== MULTI-MONITOR DIAGNOSTIC REPORT ===\n');

const monitors = native.getDebugMonitorInfo();
monitors.forEach((m, i) => {
    console.log(`[Monitor ${i}]`);
    console.log(`  Primary: ${m.isPrimary}`);
    console.log(`  Physical Rect: [L=${m.left}, T=${m.top}, R=${m.right}, B=${m.bottom}]`);
    console.log(`  Physical Size: ${m.right - m.left} x ${m.bottom - m.top}`);
    console.log(`  Scale Factor: ${m.scaleFactor} (${Math.round(m.scaleFactor * 100)}%)`);
    console.log('');
});

console.log('=== PLEASE VERIFY AGAINST WINDOWS DISPLAY SETTINGS ===');