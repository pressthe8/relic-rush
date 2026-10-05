import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverUrl = `http://127.0.0.1:${env.PORT || 3001}`;
  return {
  plugins: [react()],
  build: {
    rollupOptions: {
      input: 'index.html'
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/socket.io': { target: serverUrl, ws: true },
      '/health': serverUrl
    }
  }
  };
});
