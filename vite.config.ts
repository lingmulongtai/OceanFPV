import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 900 }, server: { port: 5173, strictPort: true } });
