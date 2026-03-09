import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
  },
  // Prevent Vite from pre-bundling server-only packages.
  // @anthropic-ai/sdk must never be included in the browser bundle.
  optimizeDeps: {
    exclude: ['@anthropic-ai/sdk'],
  },
  build: {
    rollupOptions: {
      external: ['@anthropic-ai/sdk'],
    },
  },
})
