import { pollOnce } from "./sampling/sampler.ts";
import type { Secrets } from "./secrets.ts";
import type { Source } from "./sources/port.ts";
import type { Db } from "./store/db.ts";

export interface Job {
  source: Source;
  everyMs: number;
}

/**
 * Start per-source polling loops. Each source runs on its own cadence and is
 * independently fault-isolated (OTP-supervisor style, hand-rolled). Sources that
 * aren't `ready` (missing secret / not opted in) are skipped, leaving their
 * seeded / last-known state untouched.
 */
export function startScheduler(db: Db, secrets: Secrets, jobs: Job[]): void {
  for (const { source, everyMs } of jobs) {
    if (!source.ready(secrets)) {
      console.log(`source ${source.id}: not configured — skipping`);
      continue;
    }
    const tick = async () => {
      await pollOnce(db, source, secrets, Date.now());
      setTimeout(() => void tick(), everyMs);
    };
    void tick();
  }
}
