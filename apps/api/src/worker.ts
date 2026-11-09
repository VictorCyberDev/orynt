import type { Deps } from "./services/context";
import { pumpWebhooks } from "./services/webhooks";
import { reconcileDue, recoverStaleDispatch, releaseStaleReservations } from "./services/reconcile";

/** Durable-job worker: all work is derived from database state (next_reconcile_at, delivery rows), so a restart loses nothing. */
export function startWorker(d: Deps) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await releaseStaleReservations(d);
      await recoverStaleDispatch(d, d.config.sendTimeoutSeconds * 2 + 30);
      await reconcileDue(d);
      await pumpWebhooks(d);
    } catch (e) { d.log.error({ err: (e as Error).message }, "worker tick failed"); } finally { running = false; }
  };
  const t = setInterval(() => void tick(), d.config.workerIntervalMs);
  return { stop: () => clearInterval(t), tick };
}

/** Startup recovery: anything left DISPATCHING by a process that died is moved to UNKNOWN (never failed, never retried). */
export async function recoverOnStartup(d: Deps) {
  const released = await releaseStaleReservations(d);
  const unknown = await recoverStaleDispatch(d, 3);
  if (released || unknown) d.log.warn({ released, unknown }, "startup recovery acted on interrupted payments");
}
