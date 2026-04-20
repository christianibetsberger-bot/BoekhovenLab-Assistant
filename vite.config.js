import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  // This tells Vite exactly where your app lives on GitHub Pages
  base: '/BoekhovenLab-Assistant/',
  
  plugins: [vue()],
  
  server: {
    // This proxy routes local frontend requests to your Python backend.
    // It is used during development but safely ignored in production.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      }
    }
  }
})