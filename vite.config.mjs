import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Source lives in client/, the build goes to dist/ (served by server.js).
// During `npm run dev`, API calls are forwarded to the Node server on port 3000.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
});
