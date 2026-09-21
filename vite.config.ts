import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3001,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/r': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      //
      // Everything the browser does not import is ignored, and the reason is the
      // SQLite file: it sits inside the project root, and every slot written —
      // every drag, every price, every payment — rewrites it. The watcher saw
      // that as a source change and forced a full page reload, which threw the
      // operator back to the top of the form in the middle of arranging the
      // card. The backend, the task notes and the docs are the same story: none
      // of them are modules this page loads.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/backend/**',
                '**/tasks/**',
                '**/docs/**',
                '**/.impeccable/**',
                '**/*.db',
                '**/*.db-journal',
                '**/dist/**',
              ],
            },
    },
  };
});
