import { DatabaseSync } from "node:sqlite";

export interface SampleRow {
  day: string;
  value: number;
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
    `);
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
