import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/trajectory/',
  plugins: [react()],
  build: {
    outDir: '../public/trajectory',
    emptyOutDir: true,
  },
  server: {
    port: 4319,
    proxy: {
      '/api': 'http://127.0.0.1:4318',
      '/trajectory/files': 'http://127.0.0.1:4318',
    },
  },
});
