import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    rollupOptions: {
      input: {
        home: page('./index.html'),
        docs: page('./docs/index.html'),
        library: page('./library/index.html'),
      },
    },
  },
});
