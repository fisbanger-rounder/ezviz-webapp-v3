import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages — must match the repository name
  base: '/ezviz-webapp-v3/',
  build: {
    // ezuikit-js is a large monolithic SDK (~3.6 MB). Raise the warning limit
    // so CI doesn't treat the size advisory as a build failure.
    chunkSizeWarningLimit: 4000,
  },
})


