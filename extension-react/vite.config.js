import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../extension/dashboard-react', import.meta.url)),
    emptyOutDir: true,
  },
})
