import { DatabaseSync } from "node:sqlite";
import { berlinDays } from "@dash/collector/time";

export interface SampleRow {
  day: string;
  value: number;
}

/** One day-bucketed flow count, oldest → newest. Matches the contract's DayPoint. */
export interface DayCount {
  day: string;
  value: number;
}

/**
 * The `buckets` argument for `flowByDay`: the last `count` Berlin calendar days
 * as half-open UTC-ISO bounds. Bounds are computed here in JS rather than in SQL
 * because SQLite's `localtime` would bucket by the container's TZ (UTC in k3s),
 * not Europe/Berlin. Exported so callers and tests build the same shape — the
 * query's input format lives with the query.
 */
export function flowBuckets(now: number, count: number): string {
  return JSON.stringify(
    berlinDays(now, count).map((d) => ({
      day: d.day,
      start: new Date(d.startMs).toISOString(),
      end: new Date(d.endMs).toISOString(),
    })),
  );
}

export interface SnapshotRow<T> {
  data: T;
  fetchedAt: number;
  ok: boolean;
  error?: string;
}

/**
 * The collector's durable store. Three temporal archetypes:
 *   samples  — app-owned day-bucketed history (idempotent upsert per day)
 *   snapshot — disposable current value per source (+ liveness)
 *   events   — authoritative user assertions (rent/tax done)
 *   settings — single-row user config
 */
export class Db {
  private db: DatabaseSync;
  /** Guards `transaction` re-entrancy — SQLite rejects a nested BEGIN. */
  private inTx = false;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS samples(
        source TEXT NOT NULL, metric TEXT NOT NULL, day TEXT NOT NULL, value REAL NOT NULL,
        PRIMARY KEY(source, metric, day)
      );
      CREATE TABLE IF NOT EXISTS snapshot(
        source TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL,
        ok INTEGER NOT NULL, error TEXT
      );
      CREATE TABLE IF NOT EXISTS events(kind TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(json TEXT NOT NULL);
      -- Per-message inbox lifecycle log: one row per message ever seen in the
      -- inbox, stamped when it arrived and (if it has) when it left. received/
      -- processed per day are derived from this by query (see flowByDay), never
      -- accumulated — so they can't drift and can be re-derived or redefined.
      -- Timestamps are ISO-8601 UTC so lexicographic order == chronological.
      -- Either stamp may be NULL: departed_at while the message is still in the
      -- inbox, first_seen_at for the standing inbox recorded on the first-ever
      -- poll (we never saw those arrive). NULL drops out of a bucket range
      -- comparison, so such rows are silently excluded from that metric.
      CREATE TABLE IF NOT EXISTS inbox_message(
        source TEXT NOT NULL, email_id TEXT NOT NULL,
        first_seen_at TEXT, departed_at TEXT,
        PRIMARY KEY(source, email_id)
      );
      -- Live-set index: keeps the per-poll diff proportional to the current
      -- inbox (~hundreds), not to the ever-growing history.
      CREATE INDEX IF NOT EXISTS inbox_message_live
        ON inbox_message(source, email_id) WHERE departed_at IS NULL;
      CREATE INDEX IF NOT EXISTS inbox_message_arrived
        ON inbox_message(source, first_seen_at);
      CREATE INDEX IF NOT EXISTS inbox_message_departed
        ON inbox_message(source, departed_at) WHERE departed_at IS NOT NULL;
      -- Records that a source's inbox has been polled at least once, so the very
      -- first poll can baseline the standing inbox even when it's empty (an empty
      -- inbox_message table alone can't distinguish "never polled" from "polled,
      -- nothing there" — which would wrongly baseline the first real arrival).
      CREATE TABLE IF NOT EXISTS inbox_source(source TEXT PRIMARY KEY);
    `);
  }

  /**
   * Run `fn` inside a transaction, joining an outer one if already in progress
   * (SQLite has no nested BEGIN). Re-entrancy is the point: `applyInboxMembership`
   * transacts on its own when called directly, but must fold into the caller's
   * transaction when `commit` writes samples, membership and snapshot as one unit.
   */
  transaction<T>(fn: () => T): T {
    if (this.inTx) return fn();
    this.db.exec("BEGIN");
    this.inTx = true;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    } finally {
      this.inTx = false;
    }
  }

  isEmpty(): boolean {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM snapshot").get() as { n: number };
    return row.n === 0;
  }

  /** Idempotent: one row per (source, metric, day); a later poll overwrites today's bucket. */
  upsertSample(source: string, metric: string, day: string, value: number): void {
    this.db
      .prepare(
        `INSERT INTO samples(source, metric, day, value) VALUES(?, ?, ?, ?)
         ON CONFLICT(source, metric, day) DO UPDATE SET value = excluded.value`,
      )
      .run(source, metric, day, value);
  }

  samples(source: string, metric: string): SampleRow[] {
    return this.db
      .prepare("SELECT day, value FROM samples WHERE source = ? AND metric = ? ORDER BY day")
      .all(source, metric) as unknown as SampleRow[];
  }

  /**
   * Reconcile the inbox lifecycle log against the set of ids currently in the
   * inbox: new ids are recorded as arrivals (stamped `at`), a re-arrival revives
   * its existing row, and ids that vanished are stamped as departures. One
   * transaction so the two halves can't half-apply.
   *
   * On the very first call for a source the standing inbox is recorded with a
   * NULL `first_seen_at` — "here, arrival unknown". Those rows are invisible to
   * `received` (we never saw them arrive) but still count for `processed` when
   * they leave, which is the whole reason we record them: a departure can only be
   * detected for a message we already hold a live row for.
   */
  applyInboxMembership(source: string, ids: string[], at: string): void {
    const json = JSON.stringify(ids);
    this.transaction(() => {
      // Cold = this source has never been polled (not merely "no rows"): mark it
      // seen so the standing inbox baselines exactly once, even if empty now.
      const cold = !this.db.prepare("SELECT 1 FROM inbox_source WHERE source = ?").get(source);
      if (cold) this.db.prepare("INSERT INTO inbox_source(source) VALUES(?)").run(source);
      // Arrivals: ids not already present → insert. A present-but-departed row is
      // revived (un-archived); a still-present row is left untouched.
      this.db
        .prepare(
          // `WHERE true` disambiguates the trailing ON CONFLICT from a SELECT join
          // (SQLite requires it for INSERT…SELECT…UPSERT).
          `INSERT INTO inbox_message(source, email_id, first_seen_at)
           SELECT ?, value, ? FROM json_each(?) WHERE true
           ON CONFLICT(source, email_id)
             DO UPDATE SET departed_at = NULL WHERE inbox_message.departed_at IS NOT NULL`,
        )
        .run(source, cold ? null : at, json);
      // Departures: live rows whose id is no longer in the current set.
      this.db
        .prepare(
          `UPDATE inbox_message SET departed_at = ?
           WHERE source = ? AND departed_at IS NULL
             AND email_id NOT IN (SELECT value FROM json_each(?))`,
        )
        .run(at, source, json);
    });
  }

  /**
   * Count, per day bucket, the messages whose `column` timestamp falls in that
   * bucket. `buckets` is a JSON array of `{day, start, end}` (half-open UTC ISO
   * bounds, computed in JS so bucketing is timezone-correct without leaning on
   * the container's TZ). LEFT JOIN yields a dense series including zero days.
   */
  flowByDay(source: string, column: "first_seen_at" | "departed_at", buckets: string): DayCount[] {
    const col = column === "departed_at" ? "departed_at" : "first_seen_at"; // whitelist, not a param
    return this.db
      .prepare(
        `SELECT b.value ->> 'day' AS day, COUNT(m.email_id) AS value
         FROM json_each(?) b
         LEFT JOIN inbox_message m
           ON m.source = ? AND m.${col} >= (b.value ->> 'start') AND m.${col} < (b.value ->> 'end')
         GROUP BY day ORDER BY day`,
      )
      .all(buckets, source) as unknown as DayCount[];
  }

  putSnapshot(source: string, data: unknown, fetchedAt: number, ok: boolean, error?: string): void {
    this.db
      .prepare(
        `INSERT INTO snapshot(source, json, fetched_at, ok, error) VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(source) DO UPDATE SET
           json = excluded.json, fetched_at = excluded.fetched_at, ok = excluded.ok, error = excluded.error`,
      )
      .run(source, JSON.stringify(data), fetchedAt, ok ? 1 : 0, error ?? null);
  }

  getSnapshot<T>(source: string): SnapshotRow<T> | null {
    const row = this.db
      .prepare("SELECT json, fetched_at, ok, error FROM snapshot WHERE source = ?")
      .get(source) as
      | { json: string; fetched_at: number; ok: number; error: string | null }
      | undefined;
    if (!row) return null;
    return {
      data: JSON.parse(row.json) as T,
      fetchedAt: row.fetched_at,
      ok: row.ok === 1,
      error: row.error ?? undefined,
    };
  }

  /** Flip a source to failed while keeping its last-good snapshot json. */
  markSourceError(source: string, error: string, at: number): void {
    this.db
      .prepare("UPDATE snapshot SET ok = 0, error = ?, fetched_at = ? WHERE source = ?")
      .run(error, at, source);
  }

  addEvent(kind: string, at: number): void {
    this.db.prepare("INSERT INTO events(kind, at) VALUES(?, ?)").run(kind, at);
  }

  latestEvent(kind: string): number | null {
    const row = this.db.prepare("SELECT MAX(at) AS at FROM events WHERE kind = ?").get(kind) as {
      at: number | null;
    };
    return row.at ?? null;
  }

  getSettings<T>(): T | null {
    const row = this.db.prepare("SELECT json FROM settings LIMIT 1").get() as
      | { json: string }
      | undefined;
    return row ? (JSON.parse(row.json) as T) : null;
  }

  putSettings(data: unknown): void {
    this.db.exec("DELETE FROM settings");
    this.db.prepare("INSERT INTO settings(json) VALUES(?)").run(JSON.stringify(data));
  }
}
