import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    // Keep previous builds' hashed assets in dist/ across deploys. A device
    // still running an older index.html can then load its (older) chunks
    // instead of hitting a 404 → "failed to fetch dynamically imported module".
    // Prune dist/assets occasionally to reclaim space.
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-db": ["dexie"],
          "vendor-charts": ["recharts"],
          "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-dropdown-menu"],
        },
      },
    },
    minify: "esbuild" as const,
    target: "es2015",
    chunkSizeWarningLimit: 600,
  },
}));
