import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    define: {
      // Securely inject the API key as a global string constant during build
      '__API_KEY__': JSON.stringify(env.API_KEY || '')
    }
  };
});