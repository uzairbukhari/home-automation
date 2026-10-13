# Run the dashboard on your own Cloudflare account

After this, every merge to `main` deploys automatically (`.github/workflows/deploy.yml`).
No ChatGPT involved.

## 1. Create the databases
The app stores its data in **Turso** (SQLite, free plan: 10 million writes a month, 5 GB). Cloudflare D1's free plan
only allows 100,000 writes a day, which collection plus history backfill exceeded.

**Turso:** in the Turso dashboard create a database (pick a region near you, e.g. Mumbai or Singapore), then copy its
URL (`libsql://…turso.io`) and create a token (database → Generate Token, no expiry, read & write).
Or with the CLI: `turso db create home-dashboard`, `turso db show home-dashboard --url`, `turso db tokens create home-dashboard`.

**D1** (existing installs already have it): the D1 database `home-dashboard` stays attached so its data is copied to Turso once, on
the first deploy. A new install can skip D1 entirely once the code no longer needs the binding; for now create one named
`home-dashboard` and copy its **Database ID**.

## 2. Create an API token
My Profile → API Tokens → Create Token → use the **Edit Cloudflare Workers** template,
then add the permission **Account → D1 → Edit**. Also copy your **Account ID**
(Workers & Pages overview, right-hand side).

## 3. Add GitHub settings
Repository → Settings → Environments → create an environment named `prod`, and add to it:
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- Variable: `CLOUDFLARE_D1_DATABASE_ID` (the D1 Database ID from step 1)

Then run Actions → Deploy → Run workflow. Each deploy applies the database migrations to Turso and hands the Worker
its Turso address and token (you do not set those as Worker secrets by hand). The **first** deploy after moving
from D1 also copies all existing D1 data (including the Android signing key) into Turso; this is recorded in
Turso's `_import_log` table and never repeated. If D1 is still over its daily limit when that runs, the deploy fails
before changing anything. Re-run it after the limit resets (midnight UTC).

> **Free-plan limit:** a Worker on the free plan may make only 50 outbound `fetch()` requests per invocation, and one collection run needs well over that many Turso calls (Turso's cloud does not accept WebSockets). Run the app on Vercel instead (see `docs/vercel-setup.md`) or use the Workers Paid plan.

## 4. Set the Worker secrets
Workers & Pages → `home-dashboard` → Settings → Variables and Secrets (type **Secret**).
Names are in `.env.example`. The important ones:
- `DASHBOARD_OWNER_EMAIL`, `OWNER_USER_ID` (must equal the `user_id` in your exported data)
- `DASHBOARD_PASSWORD_HASH`: run `npm run hash-password -- "a long password"`
- `SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `NOTIFICATION_COLLECTION_SECRET`: random strings (`openssl rand -base64 32`)
- Provider logins (`DESSMONITOR_*`, `TUYA_*` (`TUYA_ENDPOINT` is a URL, e.g. `https://openapi.tuyaeu.com`)) and push keys (`VAPID_*`) as in `.env.example`

## 5. Import your data
Nothing to do for data that is already in D1 (copied automatically, see step 3). To load an older SQL export instead,
apply it to Turso: `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/turso.mjs import home-dashboard-export.sql`.

## 6. Point the scheduler at the new site
cron-job.org: URL `https://home-dashboard.<your-subdomain>.workers.dev/api/mobile/collect`,
method POST, header `x-collection-secret: <NOTIFICATION_COLLECTION_SECRET>`, every 5 minutes.
Disable the old job so only one collects.

## Data kept locally

The collector stores everything Tuya and DessMonitor expose so pages never call the providers:

- DessMonitor: every inverter field for every past day (backfilled from the inverter's first year), day/month/year energy totals, alarm history, device info.
- Tuya: device data-point logs and the device event log (online/offline, activation) as far back as Tuya retains them (`TUYA_HISTORY_DAYS`, default 30), plus raw device details, homes, rooms and scenes. Local-control keys are never stored.
- Write volume is kept low on purpose: unchanged DessMonitor samples are not rewritten, unchanged Tuya readings are re-recorded only about every 10 minutes, and the DessMonitor history backfill fetches one day every 15 minutes (about 150,000 writes a day while it runs, much less afterwards).
- Raw records are kept until the database reaches 4 GB; after that the oldest verified days are summarized and pruned. Daily/monthly/yearly summaries are permanent.
- Progress and gaps per provider, device and dataset are in the Collection & Storage settings page (`provider_backfill`).

## Android app

Every deploy also builds the native Android app and publishes it at `https://<your worker address>/app/photon.apk` (version info at `/app/version.json`). The app checks that file and shows an "Update ready" banner.

- The signing key is created on the first deploy and stored in a private `app_signing` table in your Turso database, so later builds are signed with the same key and update in place. Do not delete that table; losing it means uninstalling and reinstalling the app.
- Install: open the APK link on the phone, allow installs from the browser when asked, then sign in with the server address and the owner password.
- Source lives in `android/`; pull requests run `.github/workflows/android.yml` (tests, lint, debug build).
