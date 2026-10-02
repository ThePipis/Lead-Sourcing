import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

console.log('\x1b[36m%s\x1b[0m', '⚡ Iniciando entorno de desarrollo unificado (TypeScript + Cloudflare Worker + Vite)...');

const isWin = process.platform === 'win32';

function findWrangler() {
  const candidates = [
    path.resolve('node_modules', '.bin', isWin ? 'wrangler.cmd' : 'wrangler'),
    'C:\\nvm4w\\nodejs\\wrangler.cmd',
    'C:\\Program Files\\nodejs\\wrangler.cmd',
    isWin ? 'wrangler.cmd' : 'wrangler'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return isWin ? 'wrangler.cmd' : 'wrangler';
}

const wranglerBin = findWrangler();
const viteEntry = path.resolve('node_modules', 'vite', 'bin', 'vite.js');

// 1. Iniciar Cloudflare Worker localmente con emulación D1 (puerto 8787)
const worker = spawn(wranglerBin, ['dev', '--port', '8787', '--ip', '127.0.0.1'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' }
});

// 2. Iniciar servidor Vite Frontend con HMR (puerto 3001)
const vite = spawn(process.execPath, [viteEntry, '--port=3001', '--host=0.0.0.0'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' }
});

const cleanup = () => {
  console.log('\n\x1b[33m%s\x1b[0m', 'Deteniendo servidores de desarrollo...');
  try { worker.kill('SIGINT'); } catch {}
  try { vite.kill('SIGINT'); } catch {}
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
