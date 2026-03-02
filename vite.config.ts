import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // vite.config.ts runs in Node.js, so process.env is correct here (not import.meta.env)
  base: process.env.GITHUB_PAGES === 'true' ? '/Robolabwebscanner/' : '/',
  server: {
    port: 3000,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
