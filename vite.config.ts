import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import socketIOPlugin from './vite-plugin-socketio.js';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), socketIOPlugin()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      input: 'index.html'
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
});