# Solar + Tuya Home Dashboard

A personal command-deck dashboard for a 3.5 kW solar system with a 5.2 kWh
battery (monitored via [DessMonitor](https://www.dessmonitor.com)), plus
every Tuya / Smart Life device on your account — an animated Solar ·
Inverter · Battery · Grid · Home power-flow scene, live readouts, energy
history, outage/CO₂/top-consumer insights, PKR savings, and device control,
in one dark, sci-fi HUD UI. Data is ingested continuously (not just fetched
on page load) and kept in the database, so charts and insights build up
over time even while nobody has the dashboard open.

Stack: Next.js 16 (App Router) · Turso (libSQL) + Drizzle ORM · ECharts ·
Framer Motion · tsparticles · Tailwind v4.

## How it works

- **Continuous ingestion, two ways:**
  - On an always-on host (your PC via `npm run dev`, or a VPS/Docker via
    `next start`), `instrumentation.ts` starts an in-process scheduler
    (`lib/ingest/scheduler.ts`) on server boot that polls DessMonitor and
    every linked Tuya device every `INGEST_INTERVAL_SEC` (default 60s) —
    no external cron needed.
  - On Vercel (serverless — no long-lived process to hold a scheduler),
    `app/api/poll` is instead hit on a schedule (every 5 min via
    [cron-job.org](https://cron-job.org), free).
  - Either way, each poll writes to `inverter_readings` / `tuya_readings` /
    `tuya_events`, integrates `energy_daily` / `energy_hourly` /
    `battery_health_daily` / `tuya_energy_daily`, and logs its outcome to
    `ingest_runs` (surfaced on Settings → Ingestion health).
- **Backfill:** a one-day-per-call step (`lib/ingest/backfill.ts`) walks
  backward from yesterday, pulling DessMonitor's per-day history API and
  Tuya's device-log API, so a fresh install doesn't start with empty charts.
  It advances automatically (once per poll/scheduler tick) or all at once
  via `npm run backfill` — see "Backfilling history" below.
- The dashboard pages read from that database — they never call
  DessMonitor/Tuya directly on page load, so the UI stays fast regardless of
  those APIs' latency.
- A single shared login (password, no accounts) protects every page and API
  route except `/api/poll`, which is protected by its own bearer secret
  instead (the cron job has no browser session).

## 1. Local development

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `DATABASE_URL=file:./data.db` — a local SQLite file, no cloud account
  needed for development. Leave `DATABASE_AUTH_TOKEN` empty.
- `SESSION_SECRET` — `openssl rand -base64 32` (or any 32+ char random string).
- `CRON_SECRET` — another random string; only used by `/api/poll`.
- `DASHBOARD_PASSWORD_HASH` — run `npm run hash-password -- "your-password"`
  and paste the output.
- Leave `DESS_*` / `TUYA_*` blank for now — see steps 3 and 4.

Then:

```bash
npm run db:generate   # only needed after changing db/schema.ts
npm run db:migrate    # creates the local data.db
npm run dev
```

Open http://localhost:3000, log in with the password you hashed. Every page
will show empty states until real data exists — that's expected until you
wire up DessMonitor/Tuya and run a poll (step 5).

Run the unit tests any time: `npm test`.

## 2. Database (Turso, free tier) — for deployment

Local dev uses a plain SQLite file; deployment uses
[Turso](https://turso.tech) (hosted libSQL, generous free tier) so the data
survives across serverless invocations.

```bash
# https://docs.turso.tech/cli/installation
turso auth login
turso db create solar-dashboard
turso db show solar-dashboard --url          # -> DATABASE_URL
turso db tokens create solar-dashboard       # -> DATABASE_AUTH_TOKEN
```

Put both values in Vercel's environment variables (step 6), then run the
migration against that database once:

```bash
DATABASE_URL=<turso-url> DATABASE_AUTH_TOKEN=<token> npm run db:migrate
```

## 3. DessMonitor

`lib/dess/client.ts` implements the signing scheme documented at
[api.dessmonitor.com](https://api.dessmonitor.com), confirmed working
end-to-end against a real account.

1. Set `DESS_USERNAME` / `DESS_PASSWORD` in `.env.local` — your normal
   DessMonitor login.
2. `DESS_COMPANY_KEY` is **not** anything in your account or app — it's an
   API-consumer identifier. Your own account's/brand's key is unlikely to be
   discoverable from the app UI (a serial number or device id found there is
   *not* it — that's a common mix-up). Use the key from the open-source
   [ha-dessmonitor](https://github.com/andreas-glaser/ha-dessmonitor) project,
   confirmed working:
   ```
   DESS_COMPANY_KEY=bnrl_frRFjEz8Mkn
   ```
3. Run `npm run dess:probe`. It logs the real plant → collector → device
   chain and the device's raw `queryDeviceLastData` output (as
   `{title, val, unit}` entries — DessMonitor has no stable field ids, only
   human-readable English titles that vary per inverter model).
4. Compare those `title` strings against the alias lists (`TITLES`) in
   `lib/dess/normalize.ts`. If PV/load/battery/grid/temperature use wording
   not already listed there, add it to the matching array (lowercase; matched
   case-insensitively) and re-run `npm test` to confirm `lib/dess/normalize.test.ts`
   still passes, then `npm run dess:probe` again to sanity-check the mapped values.

Two things confirmed while wiring this up that may save you time on a
different inverter model:
- The `dat` from `queryDeviceLastData` is a **flat array**, not grouped.
- Some models report battery **voltage + charge/discharge current**
  separately rather than a single "battery power" — `normalizeSnapshot`
  derives power as `voltage × (chargeA − dischargeA)` in that case, sign
  giving charging (+) vs discharging (−).

## 4. Tuya Cloud

This is the fiddliest part of setup — four distinct, easy-to-mix-up values.
Confirmed working end-to-end; follow this order exactly.

1. **Find your account's real data center first**, before creating anything.
   Open the Smart Life (or Tuya Smart) app → **Me** → gear icon (Settings) →
   **About** → tap the app logo at the top rapidly (5–10 times) — reveals a
   hidden menu showing your account's region. (Pakistan-registered accounts
   commonly land on **Central Europe**, not a US region — don't assume.)
2. [iot.tuya.com](https://iot.tuya.com) → **Cloud** → **Create Cloud
   Project**. **Development Method: "Smart Home"** (not "Custom" — Custom
   projects can't authorize the device-listing API this app needs, and you
   won't find out until step 6 fails with a permission error). Data Center:
   the one from step 1.
3. Project → **Service API** tab → confirm **Device Management** is in the
   authorized list (Smart Home projects normally include it by default; if
   not, **Go to Authorize** → add it).
4. Project → **Devices** tab → **Link App Account** (not "Link My App" —
   that's a different flow, for the developer's own account, and devices
   linked that way can't be listed by UID). Scan the QR with Smart Life on
   your phone, then tap **Confirm/Agree** on the phone when prompted. The
   browser page then shows a UID — copy it into `TUYA_UID`. It looks like
   `eu1621028557517OhZa1` (region + timestamp + suffix).
   **Do not** use the value in the browser's address bar (`...?id=p179...`)
   — that's the *project* ID, not this UID, and using it produces a
   `1106 permission deny` error that looks identical to a real permission
   problem.
5. Project → **Overview** tab → copy **Access ID/Client ID** and **Access
   Secret/Client Secret** into `TUYA_ACCESS_ID` / `TUYA_ACCESS_SECRET`.
6. Set `TUYA_ENDPOINT` to match the data center from step 1:
   `https://openapi.tuyaus.com` (Western Americas),
   `https://openapi-ueaz.tuyaus.com` (Eastern Americas),
   `https://openapi.tuyaeu.com` (Central Europe),
   `https://openapi-weaz.tuyaeu.com` (Western Europe),
   `https://openapi.tuyain.com` (India), `https://openapi.tuyacn.com` (China).
7. Run `npm run tuya:probe` to confirm it lists your real devices and their
   status codes.

`components/device-card.tsx` renders an on/off toggle for categories
`cz`/`kg`/`pc`/`dlq`/`tdq` (plugs, switch boards, metered plugs/breakers —
confirmed against a real account), including multi-gang switch boards where
each gang (`switch_1`, `switch_2`, ...) gets its own independent toggle.
Extend `SWITCH_CATEGORIES` in that file for other device types once
`tuya:probe` shows their real category/DP codes.

## 5. First poll

With DessMonitor/Tuya env vars filled in and the dev server running:

```bash
curl "http://localhost:3000/api/poll?secret=$CRON_SECRET"
```

Check the JSON response — `results.dess.ok` and `results.tuya.ok` should be
`true`. Refresh the dashboard; the Live page should now show real numbers.

If you're running as a long-lived Node process (`npm run dev` locally, or
`next start` on a VPS/Docker), you don't actually need to do this manually —
the in-process scheduler (see "How it works" above) already started polling
on server boot; watch for `[ingest] scheduler starting, ...` in the terminal.

## Backfilling history

New readings accumulate one poll at a time, which means charts start mostly
empty. To pull in the recent past instead of waiting:

```bash
npm run backfill
```

This repeatedly steps `lib/ingest/backfill.ts` (one day per source per step)
until both DessMonitor and Tuya report done — up to `BACKFILL_DAYS` days back
(default 90) — or a source hits a permission error it can't recover from
(e.g. Tuya's Device Log Service API needing a Cloud project subscription;
this stops that source without affecting the other or live polling). Safe to
interrupt and re-run — progress is persisted in the `backfill_state` table
and Settings → Ingestion health shows where each source left off. The same
step also runs automatically once per poll/scheduler tick, so even without
running this manually, history fills in gradually.

## 6. Deploy (free)

1. Push this repo to GitHub, then import it on [vercel.com](https://vercel.com)
   (Hobby plan is free).
2. Add every variable from `.env.example` in the Vercel project's
   Environment Variables settings (production values — a fresh
   `DASHBOARD_PASSWORD_HASH`/`SESSION_SECRET`/`CRON_SECRET`, the Turso
   `DATABASE_URL`/`DATABASE_AUTH_TOKEN`, and your real `DESS_*`/`TUYA_*`).
3. Deploy.
4. On [cron-job.org](https://cron-job.org) (free account), create a job:
   - URL: `https://<your-app>.vercel.app/api/poll`
   - Method: `POST`
   - Header: `Authorization: Bearer <your CRON_SECRET>`
   - Schedule: every 5 minutes.

That's the whole loop — no server to keep running yourself.

## Upgrading later (VPS)

If you outgrow the free tier (or just want everything self-hosted), the same
codebase runs as a container:

```bash
cp .env.example .env         # fill in production values
docker compose up -d --build
```

Put a reverse proxy (Caddy/nginx/Traefik) in front of port 3000 for HTTPS —
not included here. You can keep using Turso, or switch `DATABASE_URL` to
`file:/data/data.db` (the compose file already mounts a volume at `/data`)
to drop the Turso dependency entirely. cron-job.org keeps working unchanged
against the VPS's URL; Vercel Cron is another option if you stay on Vercel
and upgrade to Pro.

## Data retention

Raw `inverter_readings` / `tuya_readings` rows are pruned after
`RETENTION_DAYS` days (default 180; see `lib/queries.ts#pruneOldReadings`,
called on every poll). Daily/hourly rollups (`energy_daily`, `energy_hourly`,
`battery_health_daily`, `tuya_energy_daily`) are kept forever — that's what
Analytics/Savings/Devices charts and the lifetime payback figure are built
from. `tuya_events` (DP change log, powers device on-time/activity insights)
is also kept forever.

## Project structure

```
instrumentation.ts        Starts the in-process ingest scheduler on server boot (Node host only)
app/(auth)/login          Login page
app/(dash)/               Live (Command Deck) · Analytics · Savings · Devices · Settings
app/api/poll              Cron/scheduler entry point — pulls DessMonitor + Tuya, writes DB, steps backfill
app/api/live              Polled by the Live page (SWR)
app/api/history           Daily history for Analytics/Savings
app/api/insights          Outages, CO2, top consumers, battery DoD, efficiency (Analytics)
app/api/backfill          Manual "run backfill now" nudge (Settings)
app/api/tuya/[id]/command Device control
lib/dess/                 DessMonitor signing client + field normalizer (+ per-day history API)
lib/tuya/                 Tuya Cloud signing client (+ device-log API for events/energy backfill)
lib/ingest/poll.ts        One DessMonitor + Tuya poll cycle (extracted from app/api/poll)
lib/ingest/scheduler.ts   setInterval-based scheduler, started by instrumentation.ts
lib/ingest/backfill.ts    One-day-per-call history backfill for both sources
lib/metrics.ts            Pure calculations (self-sufficiency, savings, battery time, day rollups, ...)
lib/insights.ts           Pure derived insights (outages, CO2 avoided, top consumers, alerts, ...)
lib/queries.ts            All Drizzle queries
db/schema.ts              Drizzle schema
components/hud/           Sci-fi HUD primitives (panel, gauge, sparkline, alerts, background, ...)
components/flow/          Animated Solar · Inverter · Battery · Grid · Home power scene
components/               Page-level UI (battery gauge, charts, device cards, settings form, ...)
scripts/dess-probe.ts     Dumps raw DessMonitor data for field-mapping verification (+ --history=YYYY-MM-DD)
scripts/tuya-probe.ts     Dumps raw Tuya device/status data
scripts/backfill.ts       Runs the full history backfill from the CLI (npm run backfill)
```
