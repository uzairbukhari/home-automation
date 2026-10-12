# Connecting live providers

The production dashboard keeps provider credentials in private runtime secrets. Do not add credentials to source control or browser storage.

## Tuya Smart

1. Create a Smart Home cloud project in the [Tuya Developer Platform](https://developer.tuya.com/).
2. Select the data center that serves the Tuya app account. Pakistan accounts normally use the Central Europe data center.
3. Authorize the Smart Home basic device services and device status APIs.
4. In the project's Devices tab, choose **Link Tuya App Account**, show the QR code, scan it with the Tuya Smart app, and confirm the login.
5. Confirm that the project's **All Devices** page lists the expected devices.
6. Save the project's Access ID, Access Secret, and API region as production secrets:

   - `TUYA_ACCESS_ID`
   - `TUYA_ACCESS_SECRET`
   - `TUYA_REGION` (`eu` for the Central Europe API endpoint)

## DessMonitor

DessMonitor's public energy-storage API authenticates with the monitoring account and a manufacturer-issued `company-key`. The authentication response then supplies a temporary token and secret for subsequent signed API calls.

1. Confirm that the existing DessMonitor login shows the Photon inverter and its data logger/collector.
2. Request the Open Platform energy-storage API `company-key` from Photon, the installer, or Eybond/DessMonitor. The public documentation lists `market@eybond.com` as the contact for company-key access.
3. Save these values as production secrets:

   - `DESSMONITOR_USERNAME`
   - `DESSMONITOR_PASSWORD`
   - `DESSMONITOR_COMPANY_KEY`

4. Authenticate server-side, then discover data in this order: project, collector, device.
5. Verify live values, units, timestamp cadence, charge/discharge direction, and one historical day before replacing preview data.

The inverter serial number or logger PN can be recorded after discovery, but it is not a substitute for the company key.

## Dashboard controls and history

Use **Tuya → Manage rooms** to create rooms and assign devices, including offline devices. A device's Info tab can also save a room name. Rooms are shared by this home's linked provider account. Star a whole device card or a Solar chart to display it beneath the main dashboard summary. Favorites are scoped to the signed-in user and persisted in D1.

Use the separate Solar production / Grid import buttons above the energy columns to show either series. Column values appear above the bars; the duplicate legend is removed. The 7-day chart uses the previous six days through today. SOC periods are independent of the power chart. Invalid zero-SOC records accompanied by zero battery voltage appear as gaps; valid depleted batteries remain visible. Original invalid SOC values are retained in `batteryRaw`.

Billing day is user configurable; the local owner's setting is now **27**. The current cycle and up to two previous recorded cycles are available in the savings billing-period selector. Earlier cycles with incomplete data are provisional; absent cycles are not fabricated. Tax status defaults to Unknown. Electricity duty and cycle-specific fuel/quarterly adjustments need the applicable bill values.

## Solar collection rollout

Apply additive migrations `0003`, `0004`, and `0005` to the deployed D1 database before deploying the updated application. These add favorites, solar history/periods, resumable collection state, rooms, and tariff provenance. They preserve existing settings and Tuya raw history. Local migrations have been applied; no hosted database or scheduler was changed.

After deployment, configure `SOLAR_COLLECTION_SECRET` as a private runtime secret (the existing `CRON_SECRET` is accepted for compatibility). A scheduler should POST `/api/solar/collect` every five minutes with the `x-collection-secret` header or Bearer authorization. Keep this secret out of URLs and browsers. Scheduling remains a separate rollout step.

Each run has a durable lease, records success/failure, recovers missed days, and backfills one earlier day. The cursor advances only after persistence succeeds. A retry resumes from the saved date. Earlier power/SOC coverage becomes available progressively; provider yearly/monthly energy counters can be available before power history is complete. Do not truncate the new solar tables when rolling application code back. An older application can continue reading its original tables with the additive schema present.

## Verification and source decisions (3 October 2026)

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. The focused suite exercises physical scaling/units and command round trips, historical repair, true zero SOC versus invalid telemetry, Pakistan calendar boundaries, counter resets and duplicates, missing intervals, durable interrupted-backfill retries, user-isolated authenticated favorites, offline room assignment, migration preservation, slab/tax boundaries, and billing-cycle report consistency.

Live same-inverter SP yearly totals initially returned **813.8 kWh for 2025** and **860.2 kWh for 2026**. The latter increased to **860.8 kWh** during verification as new generation arrived. The old raw “Annual energy output” field returned **496 kWh** and is no longer used. Historical solar periods use `ENERGY_TOTAL` for year/month and `ENERGY_TODAY` for day, with the provider's verified energy unit. Month sums and yearly counters can differ through provider rounding/update cadence; diagnostics expose the difference rather than choosing the largest value. Unsupported grid-energy parameters returned synthetic zero arrays, so grid totals require declared support and a verified unit or remain integrated/partial/missing.

Four sudden zero-SOC records in the verified week had zero pack voltage and invalid battery telemetry. They now create gaps in the SOC chart and are excluded from battery calculations. Current battery SOC is never extrapolated over missing records.

The unprotected rates follow [IESCO's tariff guide](https://iesco.com.pk/tariff-guide), SRO 279(I)/2026, effective **12 February 2026**, as recorded by [NEPRA](https://nepra.org.pk/tariff/Distribution%20IESCO.php). Whole-cycle consumption selects one unprotected slab. The IESCO calculator's older rate array disagrees with the published tariff guide; it is not used for rates. GST and conditional domestic income-tax rules reference the current official FBR acts linked in settings and stored tariff provenance. No blanket combined percentage is applied. Duty remains unconfirmed/configurable; savings exclude unknown adjustments and remain provisional. Cycles preceding the stored tariff need a historical tariff before savings can be calculated.

A single authenticated local collector run succeeded, persisting 1,185 returned samples and resuming history backfill. Desktop/mobile layouts, chart-series controls, room management, and saving/removing chart favorites across navigation were checked in the browser. No physical device power command was issued during verification; command scaling is tested with fixtures. The production build succeeds with a non-fatal warning about the chart bundle size.
