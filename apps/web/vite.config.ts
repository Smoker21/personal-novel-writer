import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Default Vite port (5173). On this machine another app currently occupies
    // 5173/5174 so Vite will auto-pick the next free port; see terminal output.
    port: 5173,
    strictPort: false,
    open: false,
  },
});
