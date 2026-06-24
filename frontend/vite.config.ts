import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:4000'

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/auth': backendUrl,
        '/quiz': backendUrl,
      },
    },
  }
})
