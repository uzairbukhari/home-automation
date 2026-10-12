# Photon premium redesign capability checklist

The redesign changes presentation and navigation. Provider APIs, calculations, collection cadence, account guards, offline cache isolation, and Android identity remain owned by existing services.

| Surface | Capabilities to preserve | Verification |
| --- | --- | --- |
| Home | Energy destinations, mode/reserve, measurement age, favorites and insight links | Browser + freshness fixtures |
| Devices | Search, room/type/status, room/all grouping, favorites, safe primary controls | Browser + existing command fixtures |
| Device detail | Overview, all Boolean/Enum/Integer/String controls, metadata restrictions, energy periods/coverage, names/channel labels, room, upstream meter, resume automation, technical data | Browser + mocked commands |
| Rooms/scenes | Room creation/assignment, named groups/actions/results, Smart Life scene discovery/run | UI inspection; no real execution |
| Energy | Overview/history/reports, day/week/month/custom, 24h/48h/7d/30d, year, series, gaps/reserve, expand/pin, entity details | Browser + existing measurement tests |
| Reports | Performance/battery statistics, billing cycles/breakdowns/assumptions, appliance/room totals/comparisons, CSV, coverage | Browser + existing calculation tests |
| Rules | All/any conditions, solar/device/schedule, durations/cooldown, templates, recovery, disabled creation, simulation, enable/pause/delete, activity/history | Browser + existing automation tests |
| Settings | Connections/replacement/removal, tariff/tax/fixed/cycle adjustments, battery settings, notifications/health/test/rules, themes, account/sign-out | Browser forms; no credentials changed |
| Shared | Back/deep links/scroll, dirty forms, loading/empty/error/saved/offline, keyboard/focus, reduced motion, enlarged text | Browser + navigation fixtures |

## Hardware boundaries

Physical command outcomes, push delivery, Android 10/TalkBack and actual keyboard-open native forms require designated hardware. Browser checks do not establish those outcomes.
