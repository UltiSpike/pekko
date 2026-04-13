import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
