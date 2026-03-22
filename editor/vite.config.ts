import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import editorApiPlugin from './server/middleware';

export default defineConfig({
  plugins: [react(), editorApiPlugin()],
  server: {
    port: 5173,
    open: true,
  },
});
