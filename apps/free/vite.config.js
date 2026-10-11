import { defineConfig } from 'vite';

// base './' keeps every asset URL relative so the build works from any sub-path.
// cssMinify off: leave the inline <style> byte-identical to the source page.
export default defineConfig({ base: './', build: { cssMinify: false } });
