import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load all environment variables from the build environment (e.g., Cloudflare)
  // FIX: Replaced `process.cwd()` with `''`. `path.resolve('')` resolves to the current
  // working directory in Node.js, and this change avoids a TypeScript type error where
  // `cwd` was not found on the `process` global type.
  const env = loadEnv(mode, '', '');
  
  return {
    plugins: [react()],
    define: {
      // This bridges the gap: it takes your Cloudflare variable (VITE_API_KEY or API_KEY)
      // and makes it available to the code that asks for process.env.API_KEY
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY)
    }
  };
});
