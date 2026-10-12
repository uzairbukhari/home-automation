# Ownership checklist

What the app depends on today, and whether you control it.

| Item | Used for | Controlled by you? |
|---|---|---|
| GitHub repo `uzairbukhari/home-automation` | Source code | yes |
| ChatGPT "Sites" hosting (`photon-energy-home.suzairbukhari.chatgpt.site`, `.openai/hosting.json`) | Runs the app; deploys only happen when ChatGPT publishes | no, this is the dependency to remove |
| Cloudflare D1 database bound as `DB` (created by Sites) | All stored history | unknown: no direct access confirmed |
| ChatGPT sign-in (`oai-authenticated-user-*` headers, `app/chatgpt-auth.ts`) | Login | no, only works behind Sites hosting |
| cron-job.org job | Calls `POST /api/mobile/collect` every 5 min | yes |
| DessMonitor, Tuya IoT | Inverter / device data | yes |
| Turso database | Used by the older version of the app | yes |

The app is a vinext (Next.js on Cloudflare Workers) project, so it can run on
your own free Cloudflare account. Moving requires: a Worker + D1 on your
account, a replacement for ChatGPT sign-in, and an export of the existing D1
data. Variable names are in `.env.example`.
