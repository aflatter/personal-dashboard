import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@dash/backend";
import type { BankBacklog } from "./collect.ts";

/**
 * Build a `push` that sends a collected backlog to the backend's
 * `pushBankBacklog` mutation over the tailnet. Type-only `AppRouter` import — no
 * backend code runs in the agent; the tRPC client just type-checks the call
 * against the contract (a shape mismatch fails to compile here).
 *
 * @param apiUrl the backend's tRPC endpoint, e.g. `https://dashboard.<tailnet>.ts.net/api`
 */
export function bankPusher(apiUrl: string): (backlog: BankBacklog) => Promise<void> {
  const trpc = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: apiUrl })] });
  return async (backlog) => {
    await trpc.pushBankBacklog.mutate(backlog);
  };
}
