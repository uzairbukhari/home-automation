// Run with: npm run backfill
// Repeatedly steps the backfill (one day per source per call) until both
// DessMonitor and Tuya report "done" (reached BACKFILL_DAYS, or a
// permission error stopped that source). Safe to interrupt and re-run —
// progress is persisted in backfill_state.
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" }); // never overrides real process.env (e.g. a shell-exported prod DATABASE_URL for a one-off command)

async function main() {
  const { backfillStep } = await import("../lib/ingest/backfill");

  let step = 0;
  for (;;) {
    step += 1;
    const result = await backfillStep();
    console.log(`step ${step}: dess=${result.dess} tuya=${result.tuya}`);
    if (result.dess === "done" && result.tuya === "done") break;
    if (step > 400) {
      console.warn("backfill: stopping after 400 steps as a safety limit");
      break;
    }
  }
  console.log("backfill complete.");
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exitCode = 1;
});
