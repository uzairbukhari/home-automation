# Run the dashboard on Vercel (free Hobby plan)

Vercel runs the app as ordinary Node functions, so there is no 50-request-per-run cap: a collection can make as
many Turso calls as it needs. The Cloudflare deploy keeps working; only one of the two should receive the
scheduler's calls.

## 1. Create the project
1. Sign in at vercel.com with GitHub → **Add New… → Project** → import `uzairbukhari/home-automation`.
2. Framework is detected as **Next.js**; leave the build settings alone (`vercel.json` sets them).
3. Before the first deploy, add the **Environment Variables** below (Production), then deploy.

## 2. Environment variables
Copy the values from Cloudflare → Workers & Pages → `home-dashboard` → Settings → Variables and Secrets
(secrets show as hidden there; reuse the same values you originally set).

| Name | Notes |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Same as GitHub environment `prod`. The build applies migrations to this database. |
| `DASHBOARD_OWNER_EMAIL`, `DASHBOARD_PASSWORD_HASH` | Owner login. |
| `SESSION_SECRET`, `OWNER_USER_ID` | Keep the same values so existing sessions stay valid. |
| `NOTIFICATION_COLLECTION_SECRET` | Sent by cron-job.org as `x-collection-secret`. |
| `CREDENTIAL_ENCRYPTION_KEY` | Must match, or saved provider logins cannot be decrypted. |
| `DESSMONITOR_USERNAME`, `DESSMONITOR_PASSWORD`, `DESSMONITOR_COMPANY_KEY` | Inverter. |
| `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_ENDPOINT`, `TUYA_UID` | Tuya. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push. |

## 3. Point the scheduler at Vercel
In cron-job.org edit the existing job: URL `https://<your-project>.vercel.app/api/mobile/collect` (POST, header
`x-collection-secret` unchanged). Check it succeeds, then the Cloudflare URL can be left idle.

## Notes
- The Android app and `/app/photon.apk` are built by the Cloudflare deploy; on Vercel the APK is not available
  and the app keeps talking to whichever address it was signed in to.
- `https://<project>.vercel.app/api/admin/collect-debug` (signed in) runs one collection and shows the result.
