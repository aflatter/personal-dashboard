import type { Job } from "@dash/collector/registry";
import { pollOnce } from "./sampling/sampler.ts";
import type { Db } from "./store/db.ts";

/**
 * Start per-source polling loops. Each source runs on its own cadence and is
 * independently fault-isolated (OTP-supervisor style, hand-rolled). Jobs arrive
 * already configured — the registry constructs only the sources whose secrets
 * are present, so there is no readiness check here.
 */
export function startScheduler(db: Db, jobs: Job[]): void {
  for (const { source, everyMs } of jobs) {
    const tick = async () => {
      await pollOnce(db, source, Date.now());
      setTimeout(() => void tick(), everyMs);
    };
    void tick();
    // Sources that support server push refresh between ticks, near-instantly; the
    // timer then only guarantees the daily history sample. `watch` is internally
    // fault-isolated, so a dying stream can't disturb this loop or other sources.
    source.watch?.(() => void pollOnce(db, source, Date.now()));
  }
}
