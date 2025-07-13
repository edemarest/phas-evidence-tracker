import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  envDir: '../',
  build: {
    outDir: 'dist', // <-- FIX: Use 'dist' (default), not an absolute or relative path
    emptyOutDir: true,
  },
  server: {
    allowedHosts: [
      'localhost',
      'remarks-bread-breaking-anger.trycloudflare.com'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/.proxy/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: path => path.replace(/^\/\.proxy\/api/, '/api'),
      },
    },
  },
});
