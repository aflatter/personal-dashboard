import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@dash/collector";

/**
 * Typed tRPC client. The AppRouter type is inferred from the collector's router
 * (type-only import — no collector code is bundled). Requests go to `/api`, which
 * Vite proxies to the collector in dev.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api" })],
});
