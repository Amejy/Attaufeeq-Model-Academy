import { defineConfig } from 'vite';
import process from 'node:process';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
