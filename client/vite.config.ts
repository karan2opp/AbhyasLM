import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // The API server's FRONTEND_URL defaults to http://localhost:3000, and Clerk
    // session tokens are only accepted from that origin (authorizedParties).
    port: 3000,
    strictPort: true,
    // Same-origin API calls in development: no CORS, and the Clerk session
    // cookie travels with the request.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
