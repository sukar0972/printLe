import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const apiTarget = loadEnv(mode, '.', '').VITE_API_PROXY_TARGET || 'http://localhost:8080'
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      allowedHosts: true,
      proxy: { '/api': apiTarget, '/actuator': apiTarget },
    },
    test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true },
  }
})
