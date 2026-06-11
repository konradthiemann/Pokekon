import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      // Same-origin auth in dev: the browser talks to localhost:5173 only,
      // Vite forwards /api to the real API server. Without this, the Better
      // Auth session cookie would be a third-party cookie (localhost →
      // railway.app) and modern browsers silently drop it.
      proxy: env.VITE_API_PROXY_TARGET
        ? {
            '/api': {
              target: env.VITE_API_PROXY_TARGET,
              changeOrigin: true,
              cookieDomainRewrite: '',
            },
          }
        : undefined,
    },
  };
});
