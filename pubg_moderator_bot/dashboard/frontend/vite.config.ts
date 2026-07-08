import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devPort = Number(process.env.VITE_DEV_PORT) || 5174
const apiTarget = process.env.DEV_API_TARGET || 'http://localhost:8081'

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
