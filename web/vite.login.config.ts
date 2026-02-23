import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/login-vue/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../app/static/login-vue',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./login.html', import.meta.url)),
    },
  },
})
