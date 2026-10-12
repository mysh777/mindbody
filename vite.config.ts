import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
