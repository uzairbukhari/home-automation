import { runPoll } from "./poll";
import { backfillStep } from "./backfill";

const INTERVAL_MS = Math.max(15, Number(process.env.INGEST_INTERVAL_SEC ?? 60)) * 1000;

// `globalThis` guard: Next dev's HMR re-evaluates modules but keeps the
// Node process alive, so without this a code edit would start a second
// (or third, ...) interval each save, multiplying poll frequency.
declare global {
  var __ingestSchedulerStarted: boolean | undefined;
}

let inFlight = false;

async function tick() {
  if (inFlight) return; // previous tick still running (slow API, cold start) — skip this one
  inFlight = true;
  try {
    await runPoll();
    await backfillStep();
  } catch (err) {
    console.error("[ingest] scheduler tick failed:", err);
  } finally {
    inFlight = false;
  }
}

export function startScheduler() {
  if (globalThis.__ingestSchedulerStarted) return;
  globalThis.__ingestSchedulerStarted = true;

  console.log(`[ingest] scheduler starting, polling every ${INTERVAL_MS / 1000}s`);
  void tick(); // run once immediately rather than waiting a full interval
  setInterval(tick, INTERVAL_MS);
}
