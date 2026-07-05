import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const COLLECTOR = process.env.COLLECTOR_URL ?? "http://127.0.0.1:4319";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The collector (tRPC standalone) owns state; the SPA reads it over loopback.
    // Strip the /api prefix so procedures resolve at the tRPC server root.
    proxy: {
      "/api": { target: COLLECTOR, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
  test: {
    // Domain + presentation logic is pure — no DOM needed.
    include: ["src/**/*.test.ts"],
  },
});
