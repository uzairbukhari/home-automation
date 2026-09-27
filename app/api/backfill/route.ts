import { NextResponse } from "next/server";
import { backfillStep } from "@/lib/ingest/backfill";

// Manual nudge for Settings → System's "Run backfill now" button: advances
// a handful of days per click so the person gets quick visible progress
// instead of waiting for the next scheduled poll/cron tick. Protected by
// the same session-cookie check proxy.ts applies to every /api/* route
// except /api/poll.
export async function POST() {
  let last;
  for (let i = 0; i < 5; i++) {
    last = await backfillStep();
    if (last.dess === "done" && last.tuya === "done") break;
  }
  return NextResponse.json({ ok: true, result: last });
}
