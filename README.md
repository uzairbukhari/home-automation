# Home dashboard

A private dashboard for a home solar inverter (DessMonitor) and Tuya smart-home devices: live readings,
history, reports, automations and push alerts, plus a native Android app in `android/`.

## How it runs

| Piece | Where |
| --- | --- |
| Website and API | Next.js on [Vercel](https://vercel.com) (free Hobby plan) |
| Database | [Turso](https://turso.tech) (libSQL), over HTTP |
| Collection schedule | [cron-job.org](https://cron-job.org) calls `POST /api/mobile/collect` every 5 minutes with an `x-collection-secret` header |
| Android app | Built by `.github/workflows/android.yml` (checks) and `android-release.yml` (signed APK); signing key kept in Turso table `app_signing` |

Merging to `main` deploys to Vercel automatically. Setup steps and the list of environment variables are in
[`docs/vercel-setup.md`](docs/vercel-setup.md); the scheduler is described in [`docs/cron-job-setup.md`](docs/cron-job-setup.md).

## Develop locally

Requires Node.js 22.13 or newer.

```sh
npm ci
cp .env.example .env.local    # then fill in the values (Turso, login, providers)
npm run dev                   # http://localhost:5173
```

Scripts: `npm run lint`, `npm test`, `npm run build`, `npm start` (after a build),
`npm run hash-password -- "a long password"` (value for `DASHBOARD_PASSWORD_HASH`),
`npm run db:generate` (new Drizzle SQL migration after editing `db/schema.ts`).

## Database

All data lives in Turso. Migrations in `drizzle/` are applied by `node scripts/turso.mjs migrate`, which the
Vercel production build runs before building. `lib/turso.ts` is a small client that exposes the
`prepare/bind/first/all/run/batch` API the code uses; one collection run makes well over 100 queries, so
run it on a host that allows that many outbound requests per invocation (Vercel does).
Design notes: [`docs/database-first.md`](docs/database-first.md).

## Checking a collection

Signed in as the owner, open `/api/admin/collect-debug`: it runs one collection and shows the result, any
error text and how many database requests it made.

## More

- [`docs/PHOTON_TECHNICAL_GUIDE.md`](docs/PHOTON_TECHNICAL_GUIDE.md): architecture, migrations, provider budgets.
- [`docs/photon-android.md`](docs/photon-android.md): the Android app.
- [`CONNECTIONS.md`](CONNECTIONS.md): connecting Tuya and DessMonitor.
- [`DEPLOY_LOCAL_CHANGES.md`](DEPLOY_LOCAL_CHANGES.md): the day-to-day change workflow.
