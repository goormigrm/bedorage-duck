import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: '/bedorage-duck/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: root + 'index.html',
        preview: root + 'preview.html',
      },
    },
  },
  server: {
    port: 5173,
  },
})
