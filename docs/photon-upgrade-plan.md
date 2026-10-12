# Photon coordinated upgrade plan

Status: implementation plan, 2026-10-06. No product changes made during planning.

## Agreed outcome

One coordinated release of the existing solar-dashboard application for the current household and owner account. Retain Sites hosting, Cloudflare D1, existing Android wrapper, authentication, offline read-only reports, notifications, settings, rooms and favorites. No additional recurring costs. Use Home / Devices / Energy / Rules navigation, with Settings in the header and reports inside Energy. Google Home is an architectural extension point, not an integration in this release.

The requirements brief is C:/Users/Uzair Bukhari/Downloads/Photon_Consolidated_Requirements.md. Its proposed techniques are inputs to validate, not evidence of deployed behavior.

## Evidence and unresolved operational facts

- All 57 existing tests passed on 2026-10-06. The baseline includes simulated battery automation, persistent commands, local reporting, offline isolation and migration tests.
- Collection currently gates both providers at five minutes. Provider-independent cadence does not exist yet.
- Bottom navigation uses ordinary anchors. Full page navigation is a plausible source of delay; no phone timing baseline has been measured.
- Scheduled provider month totals request the current year. The report endpoint correctly filters stored months by selected year, making incomplete historical synchronization a credible cause of missing 2025 data. Production data has not established the cause conclusively.
- Automation comparison already supports threshold matching and persistent episodes. Unmatched/blocked evaluations generally overwrite the latest state rather than retain an event history. Actual failed rule configurations and scheduler operation remain unverified.
- Tuya consumption currently falls back to integrated power; that conflicts with the owner's actual-energy-only choice.
- Browser inspection reached an OpenAI authentication redirect and was blocked by automatic approval review. Do not bypass that block. Live inspection remains pending appropriate access.

## 1. Baseline and reusable architecture

Before changes, capture endpoint durations, provider request counts, database query counts, payload sizes and mobile navigation/render timings. Use existing local fixtures for repeatable comparisons; capture the same timings on the authenticated deployment before claiming production improvements. Inspect saved scheduler health and the two actual rules without executing them.

Keep the current modules and D1 storage; introduce a provider registry and shared types for device reference (provider plus external ID), capabilities, typed measurements, source/observation timestamps, freshness, command receipts, and historical coverage. Provider adapters own scaling and capability discovery. Views, rules and commands consume normalized capabilities. Keep existing IDs stable and add compatibility mappings rather than replacing IDs throughout the database.

Add provider-neutral device read, command, and energy-history endpoints under /api/devices. Existing /api/tuya routes delegate to the same services during migration. Commands return a durable command ID, requested state, confirmed state and delivery status. Keep owner and same-origin checks. New data fields are additive; do not remove existing response fields until all callers have moved.

## 2. Collection, freshness and command reconciliation

Retain one authenticated external scheduler entry, advancing it to a one-minute coordinator tick. Each provider/job has its own persistent due time and lease. A tick with no due work does not call a provider. Dash/DessMonitor stays at five minutes. Historical work, summaries and notifications have separate bounded jobs so they cannot postpone current-state evaluation.

Tuya starts at five minutes until actual project entitlement, expiry, remaining allowance and baseline request volume are known. Add a shared request-budget ledger covering authentication, metadata, state, history and commands. Reserve 20% of the confirmed allowance for commands/recovery; pace non-command calls over the remaining billing period, prioritizing current state over backfill. Account for provider-console consumption outside Photon; if entitlement cannot be verified, keep accelerated polling disabled and disclose that constraint.

When the verified budget permits, use one-minute background Tuya collection and a 30-second foreground refresh request while a device screen is visible. Foreground refresh is an explicit authenticated POST, deduplicated by the same server lease across tabs; ordinary GETs remain database-only. Stop foreground requests when hidden/offline. Budget exhaustion slows discretionary refresh/history rather than incurring costs. Display the effective interval and limitation. Do not promise continuous 10–30-second background updates under the zero-cost constraint.

Tuya documents a Pulsar message service, but neither account eligibility nor a no-cost persistent consumer host is established. Do not add a speculative event service in this release. Preserve an ingestion interface for future events. Reconsider only if existing account infrastructure demonstrably supports it at no added cost.

Distinguish source timestamp, latest successful observation and provider/device online state. An unchanged switch can remain recently confirmed even if its last change timestamp is old; a genuinely old sensor measurement must not become fresh merely because it was fetched again. Use provider cadence for UI freshness, with a default warning after two missed expected intervals plus one minute. Keep the existing ten-minute maximum age for automation sensor inputs until a stricter per-capability rule is established; never relax it just to hide failures.

Use optimistic control presentation only for reversible supported controls, marked pending. Confirm from a fresh provider read and persist the result into normalized latest state before updating the UI. One targeted immediate confirmation read is allowed; subsequent collection reconciles unresolved commands. Preserve uncertain delivery, expiry, duplicate suppression, channel overrides and refusal to replay uncertain commands.

## 3. History, energy correctness and the 2025 chart

Add durable coverage and cursor records for provider period totals as well as raw history. Backfill provider year totals, then monthly totals for every discovered year, then available daily totals/raw samples. Reconcile recent periods incrementally. Advance cursors only after persistence; distinguish unavailable history, confirmed empty periods and retryable failures. Do not assume the Tuya API grants 90 days of history simply because the existing code requests it.

For the 2025 report, compare available provider months, persisted rows, endpoint buckets and chart output. Repair the general year-backfill mechanism and any proven filtering/rendering defect; never special-case 2025. Return all calendar month positions with null for missing consumption and coverage metadata. Do not substitute current-year totals into a selected historical-year chart.

For Tuya, classify energy support using verified per-device datapoint semantics and units. Prefer provider energy periods, then trustworthy cumulative-counter differences, then uniquely identifiable incremental energy events. Never sum repeated polled incremental values. Counter decreases are reset/discontinuity markers unless provider semantics prove how to recover the interval. Do not spread multi-day counter differences evenly across dates and call them measured daily usage.

Remove instantaneous-power integration from consumption, room totals, cost allocations and exported actual-energy reports. Keep instantaneous power and existing raw data. Recalculate recoverable summaries with a new calculation version; retain old derived records for rollback but exclude integrated/unknown provenance from actual-energy results. Where raw data has expired, show unavailable or partial data rather than invent a replacement. Apply the same provenance rules to solar/grid/load consumption; derived battery cycles, health and energy quantities are unavailable unless supported by reliable data.

Keep detailed retention at 90 days and permanent daily/monthly/yearly summaries. Preserve data until replacement summaries are verified. Index provider/entity/time and rule/time access paths. All report reads and CSV exports use local records and identical filters, units, coverage and Asia/Karachi boundaries.

## 4. Automation reliability and activity

Preserve the existing engine and trace collection -> normalized observation -> condition -> episode -> command -> fresh confirmation. Compare the real 85% battery and 1,500 W solar configurations against disabled state, global pause, sample validity, sustained duration, cooldown, manual override and target availability. Record the evidence before attributing either observed failure to a particular cause.

Expose explicit numeric operators (>, >=, <, <=, equals). Migrate existing above/below operators to >=/<= to preserve behavior. New battery example is >=85%; solar example is >1500 W. On first enable, act once on the next valid matching observation; do not require an exact threshold sample or a prior observed crossing. Sustained-duration rules require continued fresh evidence. Persist episode/cooldown through restarts and ordinary edits; disabled-to-enabled transitions rearm the episode while preserving cooldown and manual overrides. Recovery clears/rearms the episode only according to its configured conditions. Never retrigger from repeated matching readings.

Add append-only evaluation and command-transition records with correlation IDs, rule revision, previous/current values, source/observation times, comparison, match, trigger/recovery, action, device, result, duration and skip/failure reason. Log each new relevant observation and meaningful timed state transition, not every browser poll. Redact provider secrets and store sanitized errors. Retain details 90 days and daily operational counts indefinitely.

Add a paginated owner-only /api/automations/activity endpoint with rule/status/date filters. Show last evaluation separately from last successful action. Distinguish unmatched, blocked, triggered, accepted, uncertain, confirmed, failed and expired. Preserve global pause, conflict detection, manual channel override and disabled-by-default new rules.

## 5. Mobile experience and performance

Use a persistent authenticated application shell and client navigation with immediate destination feedback. Route data loads independently; retain last successful account-scoped data during refresh, deduplicate requests, lazy-load heavy charts and avoid mounting inactive screens. Preserve deep links, Android Back, scroll/filter restoration, unsaved-form protection and offline account isolation. Keep sign-in/sign-out as required top-level navigation.

- Home: compact interactive energy flow, favorite controls and actionable synchronization/automation notices.
- Devices: room/category filters, clear device states, verified device-specific controls and a focused detail view.
- Energy: solar/grid/load overview, production and consumption history, reports and exports; battery/solar/grid/home nodes open dedicated details. Show only supported battery SOC/status/electrical history; do not invent cycle or health figures.
- Rules: rules, preview, activity and visible pause/override state.

Use a restrained mobile layout with 44px minimum control targets, readable units, accessible labels, reduced-motion support, skeletons and useful missing/unsupported states. Device energy shows 7-day and 30-day daily bars plus calendar-month totals. Audit every existing chart in a keep/combine/remove table documenting its user question, source, calculation, unit, range and replacement. Preserve useful billing functionality while excluding unsupported consumption estimates.

Provisional acceptance targets, measured against the captured baseline: visual navigation/control feedback within 100ms p95; loaded-session destination shell within 200ms p95; local-data report endpoint within 1s p95 and usable warm report within 2s on the reference phone/network. Confirm realistic cold-start targets from baseline before release. External provider latency is reported separately from immediate UI feedback.

## 6. Delivery, tests and release gates

Implement in dependency order: baseline and normalized contracts; provider scheduling/freshness/commands; historical repair and actual-energy summaries; automation activity/semantics; mobile navigation and details; full chart audit and documentation. These are internal checkpoints for one release, not separate production releases.

Extend the existing test harness with: independent due times and shared request budgets; concurrent ticks and expired leases; unchanged versus stale datapoints; 84->86% and 1400->1600W transitions; exact-boundary operators; already-matching enable; duplicate/reordered observations; sustained conditions; recovery/restart; failure/uncertain/confirmation paths; historical years including 2024/2025/2026; leap days/local midnight; idempotent backfill; counter resets/missing boundaries; unsupported energy; old estimated-summary exclusion; CSV parity; migration and offline authorization regression.

Run tests, lint, type checks and production build. Compare before/after mobile timings and provider request counts. Inspect mobile widths 360/390/430px and desktop; verify keyboard access, deep links, Back, offline read-only behavior and pending/failed controls. Use fake devices for automated command tests. Physical acceptance requires a deliberately selected test device; never infer one from a household appliance name.

Before the coordinated release, back up production data using supported hosting facilities, apply additive migrations, run resumable summary conversion, and verify scheduler health over at least three scheduled cycles. Keep automation paused during schema/worker cutover, then restore prior enabled states only after dry-run validation. Retain the old application build and additive schema for rollback. Existing offline cached reports need a calculation/schema cache-version change so old estimates cannot reappear.

Release cannot be called fully verified until authenticated production checks establish scheduler operation, actual history coverage, effective freshness within the published interval, and both observed automation scenarios. If account/API access is unavailable, complete implementation and local verification but record the exact outstanding gate rather than claim success.

Deliver docs/PHOTON_TECHNICAL_GUIDE.md from final code: module/API map, providers and limitations, configuration names without secrets, database/indexes, measurement provenance, charts/calculations, control and automation flows, synchronization/retention, authentication/offline behavior, operations and rollback. Include Mermaid diagrams and update existing operational docs to match the final implementation.

## Official constraints consulted

- Tuya pricing: https://developer.tuya.com/en/docs/iot/membership-service?id=K9m8k45jwvg9j — published trial reference allowance is approximately 26,000 API calls and 68,000 messages monthly; existing subscriptions and allocation can differ. One call/minute alone is 43,200 calls in 30 days.
- Tuya message service: https://developer.tuya.com/en/docs/iot/integrate-mq?id=Kavqdgattt1y2 — Pulsar integration requires a compatible consumer and enabled project subscription.
- Scheduler: https://cron-job.org/en/faq/ — free scheduling supports up to once per minute. The existing project's Sites scheduler has a documented hourly minimum, so retain its external scheduling approach.
