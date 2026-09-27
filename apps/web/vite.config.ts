import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': {
    target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: apiProxy,
  },
  preview: {
    host: '0.0.0.0',
    proxy: apiProxy,
  },
});
