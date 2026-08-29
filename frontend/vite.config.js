import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    // This applies only to the development server. It lets sandbox/reverse
    // proxy preview hosts load Vite while browser API calls stay relative.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: globalThis.process?.env?.VITE_API_PROXY_TARGET || 'http://127.0.0.1:90',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
