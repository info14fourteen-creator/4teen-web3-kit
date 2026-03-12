import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'FourteenUnified',
      fileName: (format) => `4teen-unified.${format}.js`
    },
    rollupOptions: {
      output: {
        assetFileNames: 'style.css'
      }
    }
  }
});
