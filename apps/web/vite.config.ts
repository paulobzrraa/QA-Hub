import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // O front fala com a API pelo mesmo host, evitando CORS em desenvolvimento.
    proxy: { '/api': { target: 'http://localhost:3333', changeOrigin: true } },
  },
})
