import { NextResponse } from "next/server";
import { runPoll } from "@/lib/ingest/poll";
import { backfillStep } from "@/lib/ingest/backfill";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return unauthorized();

  const results = await runPoll();

  // One backfill day per poll cycle keeps a Vercel deployment (no in-process
  // scheduler) filling in history over time without slowing down this request much.
  let backfill;
  try {
    backfill = await backfillStep();
  } catch (err) {
    backfill = { error: String(err) };
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), results, backfill });
}

// Convenience for manual browser/curl testing with ?secret=... during local
// setup only (see README step 5) — a query-string secret gets written to
// server/proxy access logs and browser history, so this is disabled outside
// development rather than shipped to production.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return unauthorized();
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) return unauthorized();
  return POST(
    new Request(request.url, { headers: { authorization: `Bearer ${secret}` } })
  );
}
