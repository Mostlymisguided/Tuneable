import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  // Optimize dependencies - include music-metadata for proper handling
  optimizeDeps: {
    include: ['music-metadata'],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Proper chunking for dynamic imports
        manualChunks(id) {
          // Keep music-metadata and its dependencies in separate chunks
          if (id.includes('music-metadata') || id.includes('node_modules')) {
            if (id.includes('music-metadata')) {
              return 'music-metadata';
            }
            // Split large vendor chunks
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          }
        }
      }
    },
    // CommonJS compatibility
    commonjsOptions: {
      include: [/music-metadata/, /node_modules/]
    },
    // Ensure proper asset handling
    assetsInlineLimit: 4096,
    // Target modern browsers that support dynamic imports
    target: 'es2020'
  }
})
