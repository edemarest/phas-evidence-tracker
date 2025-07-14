import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // Mode is "development" or "production"
  const isDev = mode === 'development';

  return {
    envDir: '../',
    server: isDev
      ? {
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
          },
        }
      : undefined,
  };
});
