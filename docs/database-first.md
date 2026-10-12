# Photon database-first rollout

Normal dashboard, device, connection, history, report, export and automation preview requests read Cloudflare D1 only. Explicit collection, commands and scene discovery/execution are the provider-facing operations.

## Collection

Use exactly one external collection job (five minutes until quota and scheduler acceleration are verified): `POST /api/mobile/collect`, authenticated with the existing collection secret. Do not also schedule the individual provider endpoints; they delegate to the same coordinator. D1 leases coordinate workers and browser refreshes. Explicit provider refresh has a shared one-minute cooldown and cannot bypass a running lease. History advances only after persistence, at most one provider day/page per collection.

The external scheduler must be activated and verified separately. Sites scheduling has an hourly minimum. Rules start disabled; confirm repeated successful five-minute collection in Settings → Storage before enabling a rule. A recent manual refresh alone does not prove the scheduler is active.

## Retention and migration

Migration 0007 is additive and preserves existing tables, settings, credentials and favorites. Scheduled maintenance summarizes the oldest expired device/day, creates monthly/yearly totals, verifies a daily record, then removes that day's detail. Failed summaries retain detail and surface a retention error. This bounded process gradually processes recoverable legacy history; it cannot restore previously deleted readings.

Detailed measurements, hourly summaries and detailed operational records expire after 90 days. Daily/monthly/yearly summaries and daily operational counts remain indefinitely. Latest state and metadata remain. Daily data retains hour distributions, battery reserve distributions, coverage and calculation/source information; historic room and tariff versions are preserved. Monitor D1 capacity in Storage. Report coverage remains partial until backfill completes; unavailable history is not fabricated.

## Controls and automation

Only verified writable capabilities are offered. Commands have persistent identifiers and statuses: accepted, uncertain, confirmed, failed or expired. Subsequent scheduled status collection resolves delivery; one optional targeted confirmation read is allowed. Uncertain delivery is not automatically replayed. Manual commands pause that channel's rules for an hour.

Automation evaluates saved measurements after collection. Missing, invalid, future or older-than-ten-minute measurements block actions. Conditions support solar, Tuya and schedule inputs, all/any logic, persistence duration, explicit actions and optional separate recovery thresholds. Episodes, cooldowns and command state survive restarts. Conflicting rule actions are blocked. Global pause and disabled rules provide rollout controls.

## Reporting

Appliance energy uses verified cumulative counters only, never integrated power or switch state. Runtime is shown only for supported observed switches. Device/room comparisons include coverage. Upstream meters are excluded from summed appliance consumption to avoid double-counting. Variable-charge cost allocations exclude fixed charges and are provisional where billing-cycle data is incomplete. Provider solar totals remain separately visible from calculated totals. Older charts use retained daily summaries. CSV exports match selected report filters.

## Validation and rollback

The test suite exercises provider-free reads/exports/previews, lease contention, persistent commands, stale inputs, recovery, conflicts, room attribution, gaps/resets, retention failure and owner checks. Build, lint and TypeScript checks are required before publication. Browser checks cover the rule editor and mobile reporting/storage screens; physical control actions are not exercised on household appliances.

For an operational issue, pause automation first. Retain the additive schema on application rollback. Do not drop permanent summaries or existing data. Inspect collection/retention job errors and request counts before forcing another provider refresh.

## Coordinated actual-energy upgrade

See PHOTON_TECHNICAL_GUIDE.md for migrations 0008/0009, the cutover pause/validation gate, provider budgets, activity history, actual-only calculation version 3 and rollback. The coordinator supports one-minute ticks but does not change an external scheduler automatically.
