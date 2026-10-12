# Photon redesign verification — October 7, 2026

## Local delivery

Preview: http://localhost:5173. All redesign changes remain local and uncommitted. No deployment, publication, source push, physical command, credential change, or notification delivery was performed. The pre-existing edit to `docs/photon-upgrade-progress.md` remains intact.

## Completed checks

- TypeScript checking and lint passed with no warnings. Local build passed.
- 73 automated tests passed, including navigation/discard guards, loading without false zero counts, all four device-control types and safeguards, readable rule boundaries/units, report destinations, command acceptance/confirmation, offline account isolation, and notification status without a registered service worker.
- [Responsive matrix](screenshots/responsive-matrix.json): 130 checks across 13 views, widths 320/390/768/1024/1440, and both themes. All selected content was present, the actual viewport/theme matched, and no page-level horizontal overflow was detected. These are DOM layout checks, not a claim of exhaustive visual inspection of every pixel.
- Matching phone (390×844) and desktop (1440×1000) screenshots cover Home, Devices, Scenes, Energy sections/report destinations, Rules/Activity, every Settings category, device overview, and rule creation, in both themes. Captures were made after rendering settled; older exploratory filenames are excluded from the index.
- Browser checks confirmed favorites within the phone's first screen, device-detail sections, unsaved preference prompts, browser Back closing the rule editor, expanded-chart Escape/focus return, and keyboard-opened sheet focus returning to its opening device control.
- Controlled local fixtures demonstrated fresh, saved/stale, empty, partial, failed, and initial loading states. Missing home/grid values remain unavailable. Fresh flow animates; stale flow remains static. A mocked command showed submitted/awaiting confirmation feedback. The fixture server blocks other writes.
- Chart reading tables preserve unavailable values. Text/status colors, focus outlines, shared 44px targets, and reduced-motion CSS were reviewed. Supporting light-theme colors were darkened after contrast review.

## Remaining manual acceptance

Implementation is ready for local review; full acceptance is not signed off. Browser zoom/text-size changes were unavailable through the permitted browser controls, so 200% enlarged-text review is pending. Full screen-reader/TalkBack, native Android keyboard behavior, actual offline browser/network transitions, expired-session visual flows, and hardware command/push outcomes require a designated manual environment. Existing automated tests cover offline isolation/writes and authentication denial, but do not replace those visual/hardware checks. Do not deploy until the user explicitly authorizes it.

## Screenshot index

Each entry links to the final phone/desktop light/dark set.

| View | Phone light | Phone dark | Desktop light | Desktop dark |
| --- | --- | --- | --- | --- |
| home | [View](screenshots/home-390-light.jpg) | [View](screenshots/home-390-dark.jpg) | [View](screenshots/home-1440-light.jpg) | [View](screenshots/home-1440-dark.jpg) |
| devices | [View](screenshots/devices-390-light.jpg) | [View](screenshots/devices-390-dark.jpg) | [View](screenshots/devices-1440-light.jpg) | [View](screenshots/devices-1440-dark.jpg) |
| scenes | [View](screenshots/scenes-390-light.jpg) | [View](screenshots/scenes-390-dark.jpg) | [View](screenshots/scenes-1440-light.jpg) | [View](screenshots/scenes-1440-dark.jpg) |
| energy | [View](screenshots/energy-390-light.jpg) | [View](screenshots/energy-390-dark.jpg) | [View](screenshots/energy-1440-light.jpg) | [View](screenshots/energy-1440-dark.jpg) |
| history | [View](screenshots/history-390-light.jpg) | [View](screenshots/history-390-dark.jpg) | [View](screenshots/history-1440-light.jpg) | [View](screenshots/history-1440-dark.jpg) |
| performance | [View](screenshots/performance-390-light.jpg) | [View](screenshots/performance-390-dark.jpg) | [View](screenshots/performance-1440-light.jpg) | [View](screenshots/performance-1440-dark.jpg) |
| billing | [View](screenshots/billing-390-light.jpg) | [View](screenshots/billing-390-dark.jpg) | [View](screenshots/billing-1440-light.jpg) | [View](screenshots/billing-1440-dark.jpg) |
| appliances | [View](screenshots/appliances-390-light.jpg) | [View](screenshots/appliances-390-dark.jpg) | [View](screenshots/appliances-1440-light.jpg) | [View](screenshots/appliances-1440-dark.jpg) |
| rules | [View](screenshots/rules-390-light.jpg) | [View](screenshots/rules-390-dark.jpg) | [View](screenshots/rules-1440-light.jpg) | [View](screenshots/rules-1440-dark.jpg) |
| activity | [View](screenshots/activity-390-light.jpg) | [View](screenshots/activity-390-dark.jpg) | [View](screenshots/activity-1440-light.jpg) | [View](screenshots/activity-1440-dark.jpg) |
| settings | [View](screenshots/settings-390-light.jpg) | [View](screenshots/settings-390-dark.jpg) | [View](screenshots/settings-1440-light.jpg) | [View](screenshots/settings-1440-dark.jpg) |
| connections | [View](screenshots/connections-390-light.jpg) | [View](screenshots/connections-390-dark.jpg) | [View](screenshots/connections-1440-light.jpg) | [View](screenshots/connections-1440-dark.jpg) |
| battery-settings | [View](screenshots/battery-settings-390-light.jpg) | [View](screenshots/battery-settings-390-dark.jpg) | [View](screenshots/battery-settings-1440-light.jpg) | [View](screenshots/battery-settings-1440-dark.jpg) |
| billing-settings | [View](screenshots/billing-settings-390-light.jpg) | [View](screenshots/billing-settings-390-dark.jpg) | [View](screenshots/billing-settings-1440-light.jpg) | [View](screenshots/billing-settings-1440-dark.jpg) |
| notifications | [View](screenshots/notifications-390-light.jpg) | [View](screenshots/notifications-390-dark.jpg) | [View](screenshots/notifications-1440-light.jpg) | [View](screenshots/notifications-1440-dark.jpg) |
| storage | [View](screenshots/storage-390-light.jpg) | [View](screenshots/storage-390-dark.jpg) | [View](screenshots/storage-1440-light.jpg) | [View](screenshots/storage-1440-dark.jpg) |
| account | [View](screenshots/account-390-light.jpg) | [View](screenshots/account-390-dark.jpg) | [View](screenshots/account-1440-light.jpg) | [View](screenshots/account-1440-dark.jpg) |
| device-detail | [View](screenshots/device-detail-390-light.jpg) | [View](screenshots/device-detail-390-dark.jpg) | [View](screenshots/device-detail-1440-light.jpg) | [View](screenshots/device-detail-1440-dark.jpg) |
| rule-editor | [View](screenshots/rule-editor-390-light.jpg) | [View](screenshots/rule-editor-390-dark.jpg) | [View](screenshots/rule-editor-1440-light.jpg) | [View](screenshots/rule-editor-1440-dark.jpg) |

Fixture examples: [fresh](screenshots/fixture-fresh-390-light.jpg), [empty](screenshots/fixture-empty-390-light.jpg), [partial](screenshots/fixture-partial-390-light.jpg), [failed](screenshots/fixture-failed-390-light.jpg), [loading](screenshots/fixture-loading-390-light.jpg).

