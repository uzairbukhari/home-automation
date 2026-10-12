# Run the dashboard on your own Cloudflare account

After this, every merge to `main` deploys automatically (`.github/workflows/deploy.yml`).
No ChatGPT involved.

## 1. Create the database
Cloudflare dashboard → Storage & databases → D1 → Create database, named `home-dashboard`.
Copy its **Database ID**.

## 2. Create an API token
My Profile → API Tokens → Create Token → use the **Edit Cloudflare Workers** template,
then add the permission **Account → D1 → Edit**. Also copy your **Account ID**
(Workers & Pages overview, right-hand side).

## 3. Add GitHub settings
Repository → Settings → Environments → create an environment named `prod`, and add to it:
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Variable: `CLOUDFLARE_D1_DATABASE_ID` (the Database ID from step 1)

Then run Actions → Deploy → Run workflow. The first run creates the Worker
`home-dashboard` and applies the database migrations.

## 4. Set the Worker secrets
Workers & Pages → `home-dashboard` → Settings → Variables and Secrets (type **Secret**).
Names are in `.env.example`. The important ones:
- `DASHBOARD_OWNER_EMAIL`, `OWNER_USER_ID` (must equal the `user_id` in your exported data)
- `DASHBOARD_PASSWORD_HASH`: run `npm run hash-password -- "a long password"`
- `SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `NOTIFICATION_COLLECTION_SECRET`: random strings (`openssl rand -base64 32`)
- Provider logins (`DESSMONITOR_*`, `TUYA_*` (`TUYA_ENDPOINT` is a URL, e.g. `https://openapi.tuyaeu.com`)) and push keys (`VAPID_*`) as in `.env.example`

## 5. Import your data
```bash
npx wrangler d1 execute home-dashboard --remote --file home-dashboard-export.sql
```

## 6. Point the scheduler at the new site
cron-job.org: URL `https://home-dashboard.<your-subdomain>.workers.dev/api/mobile/collect`,
method POST, header `x-collection-secret: <NOTIFICATION_COLLECTION_SECRET>`, every 5 minutes.
Disable the old job so only one collects.

## Data kept locally

The collector stores everything Tuya and DessMonitor expose so pages never call the providers:

- DessMonitor: every inverter field for every past day (backfilled from the inverter's first year), day/month/year energy totals, alarm history, device info.
- Tuya: device data-point logs and the device event log (online/offline, activation) as far back as Tuya retains them (`TUYA_HISTORY_DAYS`, default 365), plus raw device details, homes, rooms and scenes. Local-control keys are never stored.
- Raw records are kept until the database reaches 4 GB; after that the oldest verified days are summarized and pruned. Daily/monthly/yearly summaries are permanent.
- Progress and gaps per provider, device and dataset are in the Collection & Storage settings page (`provider_backfill`).
