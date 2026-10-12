# Ownership checklist

Everything the app depends on. Tick each item once you can log in to it yourself.

| Item | Used for | Where it lives | Do you control it? |
|---|---|---|---|
| GitHub repo `uzairbukhari/home-automation` | Source of truth | GitHub | yes |
| Vercel project | Hosting / deploys | vercel.com | ? check which account owns it |
| Turso database | All stored history | turso.tech | ? check which account owns it |
| cron-job.org job | Calls `POST /api/poll` | cron-job.org | ? |
| DessMonitor account | Inverter data (`DESS_*`) | dessmonitor.com | ? |
| Tuya IoT Cloud project | Device data/control (`TUYA_*`) | iot.tuya.com | ? |

## Environment variables

See `.env.example` for the full list. Secrets to regenerate at cutover:
`SESSION_SECRET`, `DASHBOARD_PASSWORD_HASH`, `CRON_SECRET`, and the
`DESS_*` / `TUYA_*` credentials if the old deployment's owner had them.

## Moving data between Turso databases

```bash
turso db shell <old-db> .dump > dump.sql
turso db create <new-db> --from-dump dump.sql
turso db show <new-db> --url
turso db tokens create <new-db>
```
This needs login access to the old Turso account. If the old database is not
yours, ask whoever owns it to run the first command.
