import type { SourceId } from "../contract.ts";
import type { Secrets } from "../secrets.ts";

/** The result of polling a source: current values to sample + the snapshot to store. */
export interface Poll {
  /** Scalars that get day-bucketed into history (keys must be in `historyMetrics`). */
  metrics: Record<string, number>;
  /** The current non-history state to persist (shape matches what `state.ts` reads). */
  snapshot: unknown;
}

/**
 * A pollable data source. `ready` gates whether it can run (secret present, right
 * platform, opt-in flag); `poll` fetches the current value. History accumulation
 * is the sampler's job, driven by `historyMetrics`.
 */
export interface Source {
  readonly id: SourceId;
  readonly historyMetrics: string[];
  ready(secrets: Secrets): boolean;
  poll(secrets: Secrets): Promise<Poll>;
}
