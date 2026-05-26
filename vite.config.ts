import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from 'rollup-plugin-visualizer';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/bundle-report.html',
      open: false,
      gzipSize: true,
      brotliSize: false,
    }),
  ],

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/__tests__/**', 'src/**/*.d.ts', 'src/remotion/**'],
      },
    },

    build: {
      // Exclude Remotion voiceover files from the app bundle
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-charts': ['recharts'],
            'vendor-icons': ['lucide-react'],
            'vendor-pdf': ['jspdf', 'html2canvas'],
            'vendor-virtual': ['@tanstack/react-virtual', '@tanstack/virtual-core'],
          },
        },
      },
      minify: 'esbuild',
      target: 'es2021',
      cssMinify: true,
    },

    // Eagerly crawl every top-level component so Vite pre-bundles all transitive
    // node_modules deps. Without this, the first time the user lazily-loads a tab
    // (TaxTab/OptionsTab/DividendsTab etc.) Vite re-runs optimization mid-session,
    // returning 504 "Outdated Optimize Dep" for in-flight requests.
    // Pre-include lazy-loaded tabs so Vite eagerly crawls every entry at startup.
    // Without this, the first time a lazy tab loads, Vite re-bundles mid-session
    // and returns 504 "Outdated Optimize Dep" to in-flight requests during the rebuild.
    // Keep `entries` in sync with `const X = lazy(...)` declarations in src/App.tsx.
    optimizeDeps: {
      entries: [
        'index.html',
        'src/**/*.tsx',
      ],
      // Explicitly pre-bundle packages used by lazy-loaded tabs so Vite never
      // re-optimises mid-session (which causes 504 / "Importing a module script
      // failed" in Tauri's WKWebView on first tab visit).
      include: [
        '@tanstack/react-virtual',
        '@tanstack/virtual-core',
      ],
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
});
