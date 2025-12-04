import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, '.', '');
  
  // Cloudflare Pages and other CI environments often store secrets in process.env
  // We check both the loaded .env file and the system process.env
  const apiKey = env.API_KEY || process.env.API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // Securely inject the API key as a global string constant during build
      '__API_KEY__': JSON.stringify(apiKey)
    }
  };
});