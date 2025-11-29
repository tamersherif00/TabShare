import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Enable history API fallback for client-side routing
    // This ensures that refreshing on any route works correctly
    historyApiFallback: true,
  },
  build: {
    outDir: 'dist',
  },
});
