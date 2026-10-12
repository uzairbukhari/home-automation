# Photon redesign — local progress

User boundary: keep everything local. No publishing, deployment, or source push until the user explicitly authorizes it. Preserve the pre-existing edit in `docs/photon-upgrade-progress.md`.

## Implemented

- One active shared presentation stylesheet (`app/premium.css`), warm light and charcoal dark tokens, responsive bottom navigation/rail/sidebar, typography, touch targets, focus and reduced motion.
- Compact Home condition, freshness, attention, energy flow, favorites, and linked insights. Flow animates only with fresh measured readings; stale summaries say “Last recorded.”
- Device-first search/room/filter layout; management menu; Devices/Scenes separation; meaningful detail overview, all existing controls, energy and settings/diagnostics.
- Energy Overview/History/Reports; explicit Performance/Appliances/Billing destinations; URL-backed report filters; ranked desktop rows and mobile appliance cards; chart reading alternatives; preserved gaps and calculation contracts.
- Rules/Activity separation, readable condition/action summaries, focused editor with recovery and review, disabled creation, overflow deletion confirmation, URL-backed editor and activity filters.
- Grouped Settings with adjacent desktop details and mobile category navigation; direct recorded provider status; credential replacement opt-in; editable billing above tariff reference; notification delivery/rules/health separated.
- Shared unsaved-edit guard now also protects category changes and all simultaneously edited forms. Existing APIs, data, provider integrations, auth, collection cadence and Android identity are unchanged.
- Local-only fixture proxy (`node scripts/preview-fixtures.mjs`, port 5180) forwards reads and blocks all writes, except mocked device-command responses. It offers fresh, saved, empty, partial, failed and loading scenarios via `/__fixture/<scenario>`. Main preview runs on port 5173.

## Verification and handoff

The 4:00 a.m. continuation resumed on October 7, 2026 and completed the remaining local implementation fixes and available verification. Final fixes include sheet focus return, notification delivery status resolving without waiting indefinitely for service-worker readiness, and stronger light-theme supporting colors.

73 tests pass; final type checking, lint and local build pass. The five-width/two-theme matrix contains 130 successful checks. Matching phone/desktop screenshots cover all primary screens, settings categories, and representative detail/editor states.

See [verification report and screenshot index](redesign/verification.md) for evidence and limitations. Full acceptance remains pending enlarged-text, complete screen-reader/native-hardware, actual browser offline transitions, and expired-session visual review. Do not treat automated offline/auth checks as those manual outcomes.

Main preview remains available at http://localhost:5173. The fixture preview at http://localhost:5180 stays local and blocks real writes. No deployment, publication, source push, physical commands, credential changes or notification delivery occurred. The unrelated documentation edit remains untouched.
