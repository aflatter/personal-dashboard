import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import type { AppRouter } from "@dash/backend";

/**
 * Typed tRPC client. The AppRouter type is inferred from the backend's router
 * (type-only import — no backend code is bundled). Requests go to `/api`, which
 * Vite proxies to the backend in dev.
 *
 * Subscriptions (the live `onStateChange` stream) go over SSE via
 * `httpSubscriptionLink`; queries and mutations keep the batched HTTP link. The
 * SSE link reconnects on its own if the stream drops.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({ url: "/api" }),
      false: httpBatchLink({ url: "/api" }),
    }),
  ],
});
