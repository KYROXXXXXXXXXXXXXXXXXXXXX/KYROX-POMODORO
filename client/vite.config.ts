import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A single .env at the repo root feeds both the client (VITE_*) and the server.
export default defineConfig({
  plugins: [react()],
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  server: {
    port: 5173,
    // Discord serves the Activity over HTTPS via a tunnel (cloudflared); allow it.
    allowedHosts: true,
    // Route the API and the WebSocket to the local server, so only the client
    // needs a public tunnel in development.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
