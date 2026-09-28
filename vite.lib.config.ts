import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'lib',
    emptyOutDir: true,
    target: ['safari18', 'ios18', 'chrome111', 'edge111', 'firefox114'],
    sourcemap: false,
    lib: { entry: { index: 'src/index.ts', react: 'src/react.tsx' }, formats: ['es'], fileName: (_format, entry) => `${entry}.js` },
    rollupOptions: {
      external: (id) => /^(?:react(?:\/|$)|react-dom(?:\/|$)|mrz(?:\/|$)|tesseract\.js(?:\/|$)|pdfjs-dist(?:\/|$))/.test(id),
    },
  },
});
