# Photon UI parity checklist

The redesign retains the existing account, API contracts and server calculations.

- Home: solar today, home load, grid import, battery SOC, reserve, inverter mode, animated charging/discharging, reading freshness, all favorites.
- Solar Overview: battery energy window, capacity, above-reserve energy, current, voltage, energy totals with 7 days/months/years and reporting year.
- Solar History: power day/week/month/custom (31 days), solar/home/grid toggles, charge 24h/48h/7d/30d, gaps and reserve line.
- Reports: today/month/year performance, lifetime production, direct solar, coverage/source diagnostics, battery min/max/reserve hours/charge/discharge/cycles, current and previous billing cycles, all savings components and assumptions.
- Devices: search, room/type/status filters, room/all grouping, favorites, primary switch, all Boolean/Enum/Integer/String capabilities, metadata restrictions, four detail sections, 1/7/30/90-day history, command history, room creation/assignment, technical data.
- Settings: provider connection status/replacement/removal; tariff slabs/source, tax status/duty, billing day, fixed charges/adjustments, per-cycle FPA/QTA/financing, battery capacity/reserve; notification subscriptions/test/all rule types/recovery/health; sign-out.
- Privacy/offline: owner guards on every private page/API; viewed data for 30 days by account/query; timestamps, uncached state, no offline writes or queued commands; clear private copies on sign-out/account changes.
- Navigation/theme: four destinations, Back/detail/filter close, persisted selections/scroll, System/Light/Dark and reduced motion.

Physical Android 10, TalkBack and real device commands require suitable hardware or a designated test device; do not infer completion from browser checks.


## Verification recorded 4 October 2026

- Full redesign published as version 26; symmetric mobile energy flow and Back guard as 27; inverter label fit as 28. Existing APK identity/signing retained.
- Browser widths 320, 344, 390, 690, 840 and 1200: Home has no horizontal overflow. Mobile source icons mirror around the inverter with equal vertical gaps. Label fits at 320/344 in light and dark layouts.
- Fresh preview proved edited settings prompt on Back, Keep editing retains the draft, and Discard returns to Settings without a save. Outdoor device filter persists after closing.
- Report selection retained in URL; Today report reopened after stopping preview with its saved timestamp and values. Existing cache isolation, expiration, authentication and command-fixture tests pass.
- Connected Fold/Android 16 launched Photon and displayed the published bottom navigation and symmetric flow. Android 10 hardware, TalkBack, keyboard-open forms, 200% Android text scaling and full account-switch/session-expiry manual testing remain unverified. No real device commands were issued.
- Performance baseline in local production preview: Settings 47 ms, latest Solar 79 ms (warm), devices 1214 ms, reports 7132 ms. These are local observations, not production latency guarantees.
- Reports and chart reads now return existing stored measurements while provider refreshes run in the request's supported background lifecycle. Duplicate background work is suppressed per owner/range, failures are retried, and the displayed measurement timestamp remains explicit. First-ever uncached periods still require provider access.
- Home requests a compact Solar summary; existing full response remains available. Provider requests run only on screens needing them; device collection persistence no longer blocks the list response. Provider command validation and encoding are unchanged.
