import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@dash/backend";

/**
 * Typed tRPC client. The AppRouter type is inferred from the backend's router
 * (type-only import — no backend code is bundled). Requests go to `/api`, which
 * Vite proxies to the backend in dev.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api" })],
});
