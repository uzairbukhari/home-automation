# Ownership checklist

What the app depends on, and where each piece lives.

| Item | Used for | Controlled by you? |
|---|---|---|
| GitHub repo `uzairbukhari/home-automation` | Source code, CI, Android builds | yes |
| Vercel project `home-automation` | Runs the website and API; deploys on every merge to `main` | yes |
| Turso database `home-dashboard` | All stored history, settings and the Android signing key | yes |
| cron-job.org job | Calls `POST /api/mobile/collect` every 5 minutes | yes |
| DessMonitor, Tuya IoT | Inverter / device data | yes |

Variable names are in `.env.example`; setup is in `docs/vercel-setup.md`.
