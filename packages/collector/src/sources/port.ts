import type { SourceId } from "../contract.ts";

/** The result of polling a source: current values to sample + the snapshot to store. */
export interface Poll {
  /** Scalars that get day-bucketed into history (keys must be in `historyMetrics`). */
  metrics: Record<string, number>;
  /** The current non-history state to persist (shape matches what `state.ts` reads). */
  snapshot: unknown;
  /**
   * The full set of message ids currently in the inbox, when the source tracks
   * membership (JMAP). The engine diffs it against the stored set to record each
   * message's arrival/departure (per-day flow); sources without a membership
   * notion omit it.
   */
  inboxMembers?: string[];
}

/**
 * A pollable data source. Construction is configuration: each factory takes the
 * narrow config it needs (a token, an account selector) and closes over it — an
 * unconfigured source is simply never constructed (see ../registry.ts), so there
 * is no readiness gate and `poll()` takes no arguments. Constructors do no I/O.
 *
 * Sources are leaf modules (lint-enforced, see .oxlintrc.json): node builtins,
 * sources/* siblings, time.ts, and contract types only — never the engine
 * (store/sampling/scheduler/trpc) and never the secrets loader.
 */
export interface Source {
  readonly id: SourceId;
  readonly historyMetrics: string[];
  poll(): Promise<Poll>;
  /**
   * Optional server push. Opens a live stream and invokes `onChange` whenever the
   * upstream signals new data, so the caller can re-`poll` near-instantly instead
   * of waiting for the timer. Returns a stop function. Must be internally
   * fault-isolated: reconnect with backoff on drop, never throw out — one stream
   * dying can't disturb another source or the HTTP server. Sources without push
   * omit this and rely on their timer alone.
   */
  watch?(onChange: () => void): () => void;
}
