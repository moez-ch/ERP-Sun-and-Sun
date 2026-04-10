import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/lusha": {
        target: "https://api.lusha.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/lusha/, ""),
      },
      "/api/snov": {
        target: "https://api.snov.io",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/snov/, ""),
      },
      "/api/vapi": {
        target: "https://api.vapi.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vapi/, ""),
      },
    },
  },
});
