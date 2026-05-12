// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
var __vite_injected_original_dirname = "/home/project";
var vite_config_default = defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false }
  },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__vite_injected_original_dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-db": ["dexie"],
          "vendor-charts": ["recharts"],
          "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-dropdown-menu"]
        }
      }
    },
    minify: "esbuild",
    target: "es2015",
    chunkSizeWarningLimit: 600
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoKSA9PiAoe1xuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiBcIjo6XCIsXG4gICAgcG9ydDogODA4MCxcbiAgICBobXI6IHsgb3ZlcmxheTogZmFsc2UgfSxcbiAgfSxcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHsgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIikgfSxcbiAgICBkZWR1cGU6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCIsIFwicmVhY3QvanN4LXJ1bnRpbWVcIiwgXCJyZWFjdC9qc3gtZGV2LXJ1bnRpbWVcIl0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIFwidmVuZG9yLXJlYWN0XCI6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCIsIFwicmVhY3Qtcm91dGVyLWRvbVwiXSxcbiAgICAgICAgICBcInZlbmRvci1kYlwiOiBbXCJkZXhpZVwiXSxcbiAgICAgICAgICBcInZlbmRvci1jaGFydHNcIjogW1wicmVjaGFydHNcIl0sXG4gICAgICAgICAgXCJ2ZW5kb3ItdWlcIjogW1wiQHJhZGl4LXVpL3JlYWN0LWRpYWxvZ1wiLCBcIkByYWRpeC11aS9yZWFjdC1zZWxlY3RcIiwgXCJAcmFkaXgtdWkvcmVhY3QtdGFic1wiLCBcIkByYWRpeC11aS9yZWFjdC1kcm9wZG93bi1tZW51XCJdLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIG1pbmlmeTogXCJlc2J1aWxkXCIgYXMgY29uc3QsXG4gICAgdGFyZ2V0OiBcImVzMjAxNVwiLFxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogNjAwLFxuICB9LFxufSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF5TixTQUFTLG9CQUFvQjtBQUN0UCxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBRmpCLElBQU0sbUNBQW1DO0FBSXpDLElBQU8sc0JBQVEsYUFBYSxPQUFPO0FBQUEsRUFDakMsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sS0FBSyxFQUFFLFNBQVMsTUFBTTtBQUFBLEVBQ3hCO0FBQUEsRUFDQSxTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsU0FBUztBQUFBLElBQ1AsT0FBTyxFQUFFLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU8sRUFBRTtBQUFBLElBQy9DLFFBQVEsQ0FBQyxTQUFTLGFBQWEscUJBQXFCLHVCQUF1QjtBQUFBLEVBQzdFO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUEsVUFDWixnQkFBZ0IsQ0FBQyxTQUFTLGFBQWEsa0JBQWtCO0FBQUEsVUFDekQsYUFBYSxDQUFDLE9BQU87QUFBQSxVQUNyQixpQkFBaUIsQ0FBQyxVQUFVO0FBQUEsVUFDNUIsYUFBYSxDQUFDLDBCQUEwQiwwQkFBMEIsd0JBQXdCLCtCQUErQjtBQUFBLFFBQzNIO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVE7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLHVCQUF1QjtBQUFBLEVBQ3pCO0FBQ0YsRUFBRTsiLAogICJuYW1lcyI6IFtdCn0K
