import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev/preview servers must be reachable through the sandbox preview proxy,
// so they bind 0.0.0.0 and accept the proxied Host header.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: false,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
})
