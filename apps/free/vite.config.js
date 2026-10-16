import { defineConfig } from 'vite';
import { precachePlugin } from './precache.js';

// base './' keeps every asset URL relative so the build works from any sub-path.
// cssMinify off: leave the inline <style> byte-identical to the source page.
// Fixed, non-hashed entry/chunk/asset names so sw.js can precache the entry JS by name (S5 offline).
const names = {
  entryFileNames: 'assets/main.js',
  chunkFileNames: 'assets/[name].js',
  assetFileNames: 'assets/[name][extname]',
};
export default defineConfig({
  base: './',
  plugins: [precachePlugin()],
  build: { cssMinify: false, rollupOptions: { output: names } },
});
