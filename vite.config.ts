/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// The build is one self-contained HTML file, so the app can be copied to any PC
// and opened by double-click, or served from any static web host. `public/`
// adds the offline worker and web manifest for the hosted copy. The source is
// in app/; src/ is the earlier 2-D version (2.2), kept for reference only.
export default defineConfig(({ mode }) => ({
  plugins: [react(), viteSingleFile()],
  define: {
    __ARTIFACT__: JSON.stringify(mode === 'artifact'),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  publicDir: mode === 'artifact' ? false : 'public',
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
  },
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
  },
}));
