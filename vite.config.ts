import { defineConfig } from "vite-plus";

// Root workspace config: shared tooling (staged checks, lint, format).
// Per-package Vite/Vitest config lives in each package's own vite.config.ts.
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    // Boundary rule (dependency direction, lint-enforced — see AGENTS.md):
    // collector sources are leaf modules so they stay independently importable
    // (e.g. by the Mac push agent). The engine (@dash/backend) knows the sources;
    // never the reverse. The registry (@dash/collector, registry.ts) is the only
    // reader of the whole Secrets bag.
    overrides: [
      {
        files: ["**/collector/src/sources/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "../**",
                    "!../time.ts",
                    "!../contract.ts",
                    "@dash/collector",
                    "@dash/collector/**",
                    "@dash/backend",
                    "@dash/backend/**",
                  ],
                  message:
                    "sources are leaf modules: node builtins, sources/* siblings, time.ts, and contract types only — never the engine (@dash/backend)",
                },
              ],
            },
          ],
        },
      },
    ],
  },
});
