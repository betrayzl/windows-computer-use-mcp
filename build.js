/**
 * Build script for Windows Computer Use MCP Server
 *
 * Workflow:
 * 1. Compile Rust native module (napi build)
 * 2. Compile TypeScript (tsc)
 * 3. Bundle everything into a single file using @vercel/ncc
 * 4. Copy the .node file into the output directory
 */

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

async function runBuild() {
  const rootDir = process.cwd();
  const bundleDir = join(rootDir, 'bundle');
  const distDir = join(rootDir, 'dist');
  const nativeDir = join(rootDir, 'native');
  const targetNodeFileName = 'win-cu-native.node';

  console.log('🚀 Starting build process...');

  try {
    // 1. Compile Rust native module
    console.log('🔨 [1/4] Building native module (Rust + NAPI-RS)...');
    execSync('napi build --platform --release', {
      stdio: 'inherit',
      cwd: nativeDir
    });
    console.log('✅ Native module built successfully.\n');

    // 2. Compile TypeScript
    console.log('🔨 [2/4] Compiling TypeScript...');
    execSync('npx tsc', { stdio: 'inherit', cwd: rootDir });
    console.log('✅ TypeScript compilation complete.\n');

    // 3. Bundling with ncc
    console.log('🔨 [3/4] Bundling with @vercel/ncc...');
    execSync(`npx ncc build ${join(distDir, 'index.js')} -o bundle`, { stdio: 'inherit', cwd: rootDir });
    console.log('✅ Bundling complete.\n');

    // 4. Copy .node file to bundle
    console.log('🔨 [4/4] Finalizing bundle (copying .node module)...');
    if (!existsSync(bundleDir)) {
      mkdirSync(bundleDir, { recursive: true });
    }

    // Search for the compiled .node file in the native directory
    const files = readdirSync(nativeDir);
    const nodeFile = files.find(f => f.endsWith('.node'));

    if (nodeFile) {
      const sourcePath = join(nativeDir, nodeFile);
      const targetPath = join(bundleDir, targetNodeFileName);
      copyFileSync(sourcePath, targetPath);
      console.log(`✅ Copied: ${nodeFile} -> ${targetNodeFileName}`);
    } else {
      throw new Error(`Could not find any .node file in ${nativeDir}`);
    }

    console.log('\n✨ Build complete!');
    console.log(`📦 Output location: ${bundleDir}`);
    console.log(`👉 You can now configure your MCP client to use: node ${join(bundleDir, 'index.js')}\n`);

  } catch (error) {
    console.error('\n❌ Build failed!');
    console.error(error.message);
    process.exit(1);
  }
}

runBuild();
