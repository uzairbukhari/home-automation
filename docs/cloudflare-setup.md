# Cloudflare Workers + D1 setup (in progress)

The app is being moved from Vercel + Turso to a Cloudflare Worker with a D1 database, on the Workers Paid plan
(10,000 outbound requests per run, 25 billion D1 rows read and 50 million rows written a month included; nothing is
blocked at the limit, extra use is billed). Until the move is finished, **Vercel + Turso stays the live app**.

## What is in the repo
- `open-next.config.ts`, `wrangler.jsonc`: the OpenNext build and the Worker (D1 binding `DB`, assets).
- `cloudflare/worker.mjs`: the Worker entry. `cloudflare/handler.mjs` hands the D1 binding to the app (`lib/db.ts` uses it
  when present, Turso otherwise) and adds the cron handler, which calls `POST /api/mobile/collect` in-process.
- `lib/d1.ts`: wraps the D1 binding as the app's database API and counts rows read/written for Settings → Storage.
- `.github/workflows/cloudflare-deploy.yml`: build, deploy, set secrets, apply `drizzle/*.sql` to D1. Run by hand.

## One-time setup
1. Create an API token (dashboard → My Profile → API Tokens → *Edit Cloudflare Workers* template, then add
   **D1 → Edit**) and note your account ID.
2. In GitHub → Settings → Environments → `prod`, add secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Optional: add a secret `WORKER_SECRETS` holding one JSON object with the Worker's settings (below), so every deploy sets
   them. Or set them yourself with `npx wrangler secret put NAME`.
4. Actions → **Cloudflare deploy** → Run workflow. The Worker is then at `https://home-automation.<your-subdomain>.workers.dev`.

## Worker settings (secrets)
Same names as `.env.example` and `docs/vercel-setup.md`, without the two `TURSO_*` ones:
`DASHBOARD_OWNER_EMAIL`, `OWNER_USER_ID`, `DASHBOARD_PASSWORD_HASH`, `SESSION_SECRET`, `NOTIFICATION_COLLECTION_SECRET`,
`CREDENTIAL_ENCRYPTION_KEY`, `DESSMONITOR_USERNAME`, `DESSMONITOR_PASSWORD`, `DESSMONITOR_COMPANY_KEY`, `TUYA_ACCESS_ID`,
`TUYA_ACCESS_SECRET`, `TUYA_ENDPOINT`, `TUYA_UID`, `TUYA_MONTHLY_ALLOWANCE`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

## Cron
`wrangler.jsonc` has `"crons": []` on purpose: while cron-job.org still calls Vercel, a second collector would duplicate work.
At cutover it becomes `["*/5 * * * *"]`. The cron fails visibly (Worker logs) if `NOTIFICATION_COLLECTION_SECRET` is unset or
collection answers an error.

## Local use
- `npm run cf:preview` builds and runs the Worker locally with `wrangler dev` (local D1 in `.wrangler/`). Put secrets in
  `.dev.vars` (ignored by git). First time: `npx wrangler d1 migrations apply DB --local`.
- `npm run cf:build` only builds. Test the cron with `wrangler dev --test-scheduled` and
  `curl "localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"`.

## Still to do (later PRs)
Copy the Turso data and the Android signing key into D1, point the Android release workflow at D1, switch usage limits from
Turso's 500M to D1's included amounts, enable the cron, and retire Vercel, Turso and cron-job.org.
