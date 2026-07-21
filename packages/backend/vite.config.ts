import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Sampler/scheduler/sync logic runs on Node (node:sqlite) — no DOM.
    include: ["src/**/*.test.ts"],
  },
});
