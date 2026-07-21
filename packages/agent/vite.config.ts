import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Pure orchestration logic runs on Node — no DOM.
    include: ["src/**/*.test.ts"],
  },
});
