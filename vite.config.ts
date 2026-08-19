import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// base './' so the build works from a GitHub Pages subpath and from file://
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'offline' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'offline' ? 'dist-offline' : 'dist',
    chunkSizeWarningLimit: 1500,
  },
}))
