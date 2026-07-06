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
  /**
   * Optional server push. Opens a live stream and invokes `onChange` whenever the
   * upstream signals new data, so the caller can re-`poll` near-instantly instead
   * of waiting for the timer. Returns a stop function. Must be internally
   * fault-isolated: reconnect with backoff on drop, never throw out — one stream
   * dying can't disturb another source or the HTTP server. Sources without push
   * omit this and rely on their timer alone.
   */
  watch?(secrets: Secrets, onChange: () => void): () => void;
}
