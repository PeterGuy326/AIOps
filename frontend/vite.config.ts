import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/ai': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/crawler': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/search': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/analytics': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/publish': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/browser': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
