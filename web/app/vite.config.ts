import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Python API runs on :8000 (uvicorn) and Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  // The lab's first load is ~525 kB; ECharts (first result) and the Learn articles with KaTeX load
  // on demand as their own chunks, which are large by nature.
  build: { chunkSizeWarningLimit: 800 },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
