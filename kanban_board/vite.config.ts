import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const devPort = Number(process.env.VITE_DEV_PORT) || 5173
const apiProxy = process.env.VITE_API_PROXY || 'http://localhost:3000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: devPort,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': apiProxy,
    },
  },
})
