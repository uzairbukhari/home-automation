# Deploy the dashboard on Vercel (free Hobby plan)

Vercel runs the app as ordinary Node functions, so a collection can make as many Turso calls as it needs, and
each collect route may run for up to a minute (`maxDuration`).

## 1. Create the project
1. Sign in at vercel.com with GitHub → **Add New… → Project** → import `uzairbukhari/home-automation`.
2. The framework is detected as **Next.js**; `vercel.json` sets the install and build commands. Leave the rest alone.
3. Add the **Environment Variables** below (Production), then deploy. Every merge to `main` deploys from then on.

The production build runs `node scripts/turso.mjs migrate`, which applies any new SQL in `drizzle/` to Turso, so
`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` must be available at build time (the default for Vercel variables).

## 2. Environment variables
Names are also listed in `.env.example`.

| Name | Notes |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | From the Turso dashboard (create a database token). |
| `DASHBOARD_OWNER_EMAIL`, `OWNER_USER_ID` | Owner login. `OWNER_USER_ID` must equal the `user_id` stored with your data (`SELECT user_id FROM user_settings`). |
| `DASHBOARD_PASSWORD_HASH` | `npm run hash-password -- "a long password"`. |
| `SESSION_SECRET` | Random string (`openssl rand -base64 32`). Changing it signs everyone out. |
| `NOTIFICATION_COLLECTION_SECRET` | Random string; cron-job.org sends it as `x-collection-secret`. |
| `CREDENTIAL_ENCRYPTION_KEY` | Random string. Changing it makes provider logins saved in Settings unreadable. |
| `DESSMONITOR_USERNAME`, `DESSMONITOR_PASSWORD`, `DESSMONITOR_COMPANY_KEY` | Inverter. |
| `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_ENDPOINT`, `TUYA_UID` | Tuya. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push. |

## 3. Point the scheduler at it
In cron-job.org: URL `https://<your-project>.vercel.app/api/mobile/collect`, **POST**, header `x-collection-secret`
with the value above. Use the project's main address (Settings → Domains), not the per-deployment address.

## Notes
- `https://<project>.vercel.app/api/admin/collect-debug` (signed in) runs one collection and shows the result.
- The Android app asks for the server address when you sign in; use the Vercel address.
- `android-release.yml` builds the signed APK on demand (Actions tab) and attaches it to the run.

## Database usage (Turso Free plan)

The free plan allows 500M rows read a month; past that Turso blocks every query until the month resets. Settings → Storage shows reads so far this month and the projection to month end. The app keeps itself under the limit:

- At 50%, 75% and 90% of the quota (counted or projected) it sends an in-app alert.
- At 70% projected, backfills and history imports pause; at 85%, all maintenance pauses; at 95%, only live collection, automations and alerts run.
- While Turso is blocked, `/api/mobile/collect` answers 200 `database_blocked` so cron-job.org keeps the job, and deploys skip migrations (the runtime adds the indexes it needs).
- A test fails the build if a 5-minute or maintenance query starts scanning a history table.
