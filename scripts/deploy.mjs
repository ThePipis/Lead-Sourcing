import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

console.log('\x1b[36m%s\x1b[0m', '🚀 Iniciando despliegue a Cloudflare (Producción)...');

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

// 1. Compilar Frontend con Vite
console.log('\x1b[33m%s\x1b[0m', '📦 1/2 Compilando frontend...');
const buildRes = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

if (buildRes.status !== 0) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error en la compilación de Vite.');
  process.exit(buildRes.status || 1);
}

// 2. Desplegar Worker y Assets a Cloudflare
console.log('\x1b[33m%s\x1b[0m', '☁️  2/2 Desplegando a Cloudflare...');
const deployRes = spawnSync(wranglerBin, ['deploy'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

if (deployRes.status !== 0) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error al desplegar con Wrangler.');
  process.exit(deployRes.status || 1);
}

console.log('\x1b[32m%s\x1b[0m', '✅ ¡Despliegue a Cloudflare completado exitosamente!');
