# Photon upgrade progress

Updated 2026-10-06. Version 35 deployed successfully at 06:25 UTC. Production observation is in progress; see latest checkpoint below. Earlier sections are historical checkpoints.

## Baseline and decisions
- Target solar-dashboard; existing Sites project appgprj_6ab91240133881918bcc42b45220f051, public hosting with owner-only application auth.
- Opened/synchronized through Sites workflow at 3fcf03ed872aa9d3fb01815601fcafe6b4ef8634 before edits. Production version 34.
- Live D1 read showed collection/evaluation healthy. Saved solar rule is >15000 W, not brief's 1500 W; battery rule <=95 OR <=47 already active. Preserve owner settings.
- Browser sign-in inspection was blocked by auto-review. Do not bypass; authorized Sites database reads are independently available.
- Five-hour continuation heartbeat active. Cannot automatically redeem free usage-reset credit.

## Implementation checkpoint (now committed and deployed)
- Four-destination persistent shell, flow detail links, focused measured device-energy view, Rules activity filters.
- Provider-qualified device endpoints and registry, shared cadence freshness, request-budget reservation with priority capacity. Acceleration remains disabled without verified entitlement.
- Independent provider jobs, resumable historical year/month/day period repair, calendar gap buckets.
- Actual-energy provenance filtering, calculation version 3, bounded recovery, no power-derived consumption in reports/CSV. Solar mixed measured/estimated-day bug and reset handling corrected.
- Explicit comparisons and re-enable semantics, atomic rule-save with evaluator lease, append-only evaluation/command events, 90-day activity retention.
- Additive migrations 0008 and 0009. 0009 snapshots settings/rules/derived energy for rollback; final statements pause existing rules during release. release-check.ts dry-runs saved rules after healthy collection, restores previous pause state, skips commands until following tick. This new gate still needs dedicated tests/review.
- Local preview DB applied 0008 and initial 0009 successfully; later release-control statements were appended after local application, so not yet applied locally.
- Latest test run: 64/64 pass before latest stylesheet workaround; type/lint passed before final edits. Production build passed before release-check/site.css/Vite changes; rerun final checks.

## Current debugging
- Dev preview http://127.0.0.1:5173/automations. Dev session originally 31588. Browser tab 2 in IAB, width override 360x800.
- Visual check revealed Vinext dev stylesheet links receiving JS rather than CSS. app/site.css now combines original globals + photon-ui preserving cascade. Added narrowly scoped development middleware in vite.config.ts to append ?direct only to browser text/css requests. Direct CSS request verified 200 text/css. Need reload preview and verify styling, then mobile 360/390/430 and desktop.
- Fixed mixed invalid UTF-8 ellipsis byte in devices-dashboard.tsx discovered by build.
- build-site.mjs wrapper could not locate npm on Windows; npm run build directly succeeds with escalation. Reuse valid build for workflow packaging if unchanged.

## Remaining work
1. Verify CSS fix and mobile flows; restore browser viewport afterwards. Existing UI still needs effective cadence notice, saved filters, careful activity pagination review.
2. Review release gate and test migration of populated DB, independent skipped-collection health, activity failures/global pause, frontend race behavior.
3. Complete PHOTON_TECHNICAL_GUIDE.md and chart audit; document limitations and unmeasured phone timing targets honestly.
4. Rerun tests/lint/types/build after final edits. Native Sites workflow push/package/save/deploy with existing project/audience; obtain fresh write credential, keep only memory/stdin. Opening result above retained as source.
5. Observe production migration backups/release gate, scheduler health over three cycles, historical month coverage and automation activity using supported tools. Do not issue physical appliance test commands.
6. External cron currently five-minute, actual quota unknown. Verify supported scheduler configuration before changing cadence. No added costs.

All details/acceptance remain in photon-upgrade-plan.md. Do not call complete or disable continuation until work is verified; record concrete external gates if blocked.

## Release candidate checkpoint — 2026-10-06
- Mobile preview style failure resolved: development stylesheet requests now use raw CSS; production service worker is disabled in development to prevent stale hot-reload modules. App styled correctly at 360px and 430px; 390px device detail checked earlier; desktop control tree checked. Historical 2025 selection displays distinct saved monthly data.
- Added offline-safe main/flow links and selection restoration. Effective device synchronization limitation is displayed.
- 66 regression tests pass. Lint passed, type checks passed after final offline-link change. Production build to be repeated by release workflow for exact final source.
- PHOTON_TECHNICAL_GUIDE.md includes module/API map, provenance, chart audit, release/rollback, limitations. Updated database-first operations documentation.
- Release gate and populated migration backup tests pass. Activity records paused and pre-command failures; trigger activity commits atomically with episode/actions.
- Legacy device counters are withheld until calculation-version 3 repair verifies raw data; unrecoverable old summaries remain in backup and show unavailable. Power-derived consumption is excluded.
- Performance targets remain unmeasured on the reference phone; do not claim quantified speedup. Actual provider entitlement and one-minute external scheduler have not been verified, so five-minute operation remains the stated default.
- Next: source workflow build/package/save/deploy; inspect production gate/migrations and three scheduled cycles. No physical commands used for verification.

## Production deployment — 2026-10-06 06:25 UTC
- Version 35 deployed successfully. Source commit: 7aa6492cb18165b54b7298b10cd73d3b3632bb34. Deployment: appgdep_6ac494498fa08191a54e5e7929cd5769. Exact-source workflow build and lint passed; 66 tests and type checks passed before packaging.
- Public hosting and owner-only application authentication preserved. No scheduler added; existing external five-minute collection continues.
- New D1 tables verified present. Migration backup includes five current owner rules, their states, favorites and legacy summaries. Existing rule thresholds preserved (95/47, 15000, 20, 15; disabled dummy 100).
- At 06:28 UTC release_control is pending, saved prior pause=0, current global pause=1. Expected next scheduled collection is 06:30; validation should restore prior pause without commands on that tick. Do not manually force resume.
- Remaining: inspect at least three post-release cycles, verified release_control/global pause, activity, period backfill and actual-energy repair. No physical device test commands issued.
- Production browser authentication remains blocked by prior auto-review; native Sites D1 read-only inspection is available. Reference-phone performance and provider entitlement remain unverified; no accelerated cadence claimed.
### First production cycle — 06:30 UTC
- Release gate verified at 06:30:48.624Z; global pause restored to 0 automatically. Validation tick skipped rule commands as designed.
- Both provider jobs succeeded at 06:30:44/45 with no error. Collection succeeded at 06:30:48.
- Actual-energy repair succeeded at 06:30:57. Historical period backfill succeeded at 06:31:03 and recorded 2026 available. Remaining cycles and 2025 coverage still under observation.
### Second production cycle — 06:35 UTC
- Both providers, collection, evaluation and maintenance succeeded without errors. Fresh provider successes at 06:35:26/31.
- Rules activity contains four enabled-rule evaluations: one waiting for recovery (already acted), three unmatched. No duplicate command was generated for the still-matching completed episode.
- 2025 period coverage is now available, recorded 06:35:52.509Z after provider month persistence. This confirms a successful history request, not that every historical month is complete.
- Exact saved rule configurations compared against migration snapshots: all five unchanged.
## Continuation scope after version 35
Do not repeat the completed build or deploy unchanged source. Runtime implementation is published; local modifications since deployment are operational documentation only. Observe outstanding release checks, investigate only concrete failures, and preserve new owner edits.
External evidence still missing: signed-in production UI checks (previous automated sign-in was denied by auto-review), reference-phone before/after timings, and actual provider quota entitlement. Do not bypass authentication review or enable accelerated collection without verified entitlement. Existing real rules differ from the brief examples; do not change thresholds or exercise household appliances just to demonstrate the examples. Simulated threshold/episode tests passed.
### Third production cycle — 06:40 UTC (checked 06:41 UTC)
- Three scheduled post-release collections now verified: 06:30, 06:35, 06:40. Both providers connected with no error; latest collection success 06:40:43.160Z, evaluation success 06:40:38.582Z.
- Global pause remains 0. Activity has the next four fresh evaluations (waiting/unmatched), with no repeated completed-episode action.
- Actual-energy repair succeeded again at 06:40:51.858Z. Period backfill succeeded at 06:40:58.772Z; coverage now includes 2025, 2026 and 2026-10. Maintenance was still running at the snapshot; prior full maintenance finished successfully 06:36:07.
- Release runtime checks passed. Keep five-hour continuation while external acceptance gates above remain unresolved; stay quiet on unchanged state. No further implementation change is currently justified by observed production results.
## Navigation regression reported after release
- Live signed-in browser now available. Clicking Devices left Home content with a stuck Opening indicator. Console: next/link private dynamic navigation/prefetch imports produced TypeError (navigateClientSide and prefetch functions missing from production chunk namespace).
- Replaced next/link helper in app-shell with ordinary anchors using the public useRouter API for unmodified online same-origin clicks. Offline, modifier, download, target and hash links retain native behavior. Persistent shell retained; no data/provider/rule changes.
- Local Devices navigation passed. Production build and 66 tests passed; lint/types passed. Publish and signed-in live link checks pending.
## Version 36 live navigation verification — 2026-10-06
- Navigation fix deployed successfully at 06:48 UTC (11:48 PKT). Version 36, commit 9f2fa89abcc303d4bcf63be661d9c0f3ef01b6e2; deployment appgdep_6ac4998bbdd48191be7b00b32917b581.
- Follow-up signed-in Chrome checks passed: Home, Devices, Energy, Rules, Settings, Reports; battery, solar, home-load and grid detail links; Back from battery detail to Home. Destination content and URLs verified, no console errors returned.
- Rules displayed preserved thresholds and fresh evaluation times. Reports displayed unavailable unsupported consumption rather than fabricated zero totals.
- Devices verified at 390x844: viewport width390, document width375, no horizontal overflow. Screenshot visually confirmed mobile controls/navigation. Temporary viewport restored.
- The prior production authentication blocker no longer applies to this signed-in session. Reported link regression resolved. No additional runtime edits or deployment needed for these checks.
- Remaining external acceptance: actual-phone timing measurements and verified Tuya entitlement before accelerated refresh. Desktop/mobile-width browsing is not a reference-phone benchmark. Five-minute collection retained. Historical repair continues automatically.
