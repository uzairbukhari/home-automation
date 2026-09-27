// Runs once when a new Next.js server instance starts. On an always-on Node
// host (PC/Docker/VPS) this starts the in-process ingestion scheduler so
// DessMonitor/Tuya data keeps flowing without an external cron. On Vercel
// (serverless — no long-lived process to hold a setInterval) this is a
// no-op; ingestion there stays driven by cron-job.org hitting /api/poll,
// which also advances backfill one step per call (see app/api/poll/route.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return;
  if (process.env.INGEST_SCHEDULER === "off") return;

  const { startScheduler } = await import("./lib/ingest/scheduler");
  startScheduler();
}
