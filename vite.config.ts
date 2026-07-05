import { defineConfig } from "vite-plus";

// Root workspace config: shared tooling (staged checks, lint, format).
// Per-package Vite/Vitest config lives in each package's own vite.config.ts.
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
});
