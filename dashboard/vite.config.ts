import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite proxies REST + WebSocket traffic to the backend so the dashboard
// can be served from a different origin during development without CORS
// theatrics. ws: true is essential for Socket.IO upgrade requests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ispyai/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
