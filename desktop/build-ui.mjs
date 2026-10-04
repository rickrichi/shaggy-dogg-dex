import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
if (!existsSync('.desktop-build/dist/shaggy-arb/shaggy-arb.exe')) throw new Error('Run npm run desktop:backend first.');
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit', env: {
  ...process.env, VITE_ARB_API_URL: 'http://127.0.0.1:5174/arb', VITE_ARB_WS_URL: 'ws://127.0.0.1:5174/arb/ws',
} });
if (build.status !== 0) process.exit(build.status ?? 1);
const scanner = spawnSync(process.execPath, ['node_modules/esbuild/bin/esbuild', 'scripts/arbitrage-bot-daemon.ts', '--bundle', '--platform=node', '--format=cjs', '--outfile=.desktop-build/daemon/scanner.cjs'], { stdio: 'inherit' });
if (scanner.status !== 0) process.exit(scanner.status ?? 1);
