import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [
    react({
      plugins: [],
      parserConfig: (id) => {
        if (id.endsWith('.tsx')) return { syntax: 'typescript', tsx: true };
        if (id.endsWith('.ts') || id.endsWith('.mts'))
          return { syntax: 'typescript', tsx: false };
        if (id.endsWith('.js') || id.endsWith('.jsx') || id.endsWith('.mjs'))
          return { syntax: 'ecmascript', jsx: true };
        return undefined;
      },
    }),
  ],
  server: {
    port: 3003,
  },
  build: {
    outDir: 'build',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
          mui: ['@mui/material', '@mui/icons-material'],
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
});
