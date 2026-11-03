import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2500, assetsInlineLimit: 0 },
  server: { host: '127.0.0.1', port: 5199 },
  preview: { host: '127.0.0.1', port: 5199 },
});
