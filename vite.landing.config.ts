import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "/", // Change to '/flowfolio/' if deploying to GitHub Pages subdirectory
  build: {
    outDir: "dist-landing",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "landing.html"),
    },
  },
  server: {
    port: 3000,
    open: "/landing.html",
  },
});
