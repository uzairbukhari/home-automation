import { db } from "@/db/client";
import {
  inverterReadings,
  energyDaily,
  energyHourly,
  batteryHealthDaily,
  tuyaDevices,
  tuyaReadings,
  tuyaEnergyDaily,
  ingestRuns,
  backfillState,
  settings as settingsTable,
} from "@/db/schema";
import { desc, gte, eq, lt, and, sql } from "drizzle-orm";
import { computeEnergyDelta, type EnergyDelta, type TariffSettings } from "@/lib/metrics";

export async function getLatestInverterReading() {
  const rows = await db
    .select()
    .from(inverterReadings)
    .orderBy(desc(inverterReadings.ts))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTodayInverterReadings() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return db
    .select()
    .from(inverterReadings)
    .where(gte(inverterReadings.ts, startOfDay))
    .orderBy(inverterReadings.ts);
}

/** Last `days` daily energy rows, oldest first. */
export async function getRecentEnergyDaily(days: number) {
  const rows = await db.select().from(energyDaily).orderBy(desc(energyDaily.date)).limit(days);
  return rows.reverse();
}

/** Minimal (ts, gridV, mode) columns over the last `days` days, for outage detection — avoids pulling every column of every raw reading. */
export async function getReadingsForOutageDetection(days: number) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  return db
    .select({ ts: inverterReadings.ts, gridV: inverterReadings.gridV, mode: inverterReadings.mode })
    .from(inverterReadings)
    .where(gte(inverterReadings.ts, cutoff))
    .orderBy(inverterReadings.ts);
}

/** Every daily energy row ever recorded, oldest first (for lifetime totals/payback). */
export async function getAllEnergyDaily() {
  return db.select().from(energyDaily).orderBy(energyDaily.date);
}

/** Last `days` of hourly energy rollups, oldest first. Never pruned. */
export async function getRecentEnergyHourly(days: number) {
  const cutoff = todayKey(new Date(Date.now() - days * 86_400_000));
  return db
    .select()
    .from(energyHourly)
    .where(gte(energyHourly.date, cutoff))
    .orderBy(energyHourly.date, energyHourly.hourOfDay);
}

/** Last `days` of battery health daily rows, oldest first. Never pruned. */
export async function getRecentBatteryHealth(days: number) {
  const rows = await db.select().from(batteryHealthDaily).orderBy(desc(batteryHealthDaily.date)).limit(days);
  return rows.reverse();
}

/** Every battery health daily row ever recorded, oldest first (for lifetime cycle totals). */
export async function getAllBatteryHealthDaily() {
  return db.select().from(batteryHealthDaily).orderBy(batteryHealthDaily.date);
}

export async function getTuyaDevicesWithStatus() {
  return db.select().from(tuyaDevices).orderBy(tuyaDevices.room, tuyaDevices.name);
}

const DEFAULT_SETTINGS: TariffSettings = {
  currency: "PKR",
  flatRatePerKwh: null,
  peakRatePerKwh: null,
  offPeakRatePerKwh: null,
  peakStartHour: null,
  peakEndHour: null,
  systemCostPkr: null,
  panelKwp: 3.5,
  batteryKwh: 5.2,
  gridCo2KgPerKwh: 0.45,
};

export async function getSettings(): Promise<TariffSettings> {
  const row = await db.query.settings.findFirst({ where: eq(settingsTable.id, 1) });
  if (!row) return DEFAULT_SETTINGS;
  return {
    currency: row.currency,
    flatRatePerKwh: row.flatRatePerKwh,
    peakRatePerKwh: row.peakRatePerKwh,
    offPeakRatePerKwh: row.offPeakRatePerKwh,
    peakStartHour: row.peakStartHour,
    peakEndHour: row.peakEndHour,
    systemCostPkr: row.systemCostPkr,
    panelKwp: row.panelKwp,
    batteryKwh: row.batteryKwh,
    gridCo2KgPerKwh: row.gridCo2KgPerKwh,
  };
}

export async function upsertSettings(values: Partial<TariffSettings>) {
  const current = await getSettings();
  const merged = { ...current, ...values };
  await db
    .insert(settingsTable)
    .values({ id: 1, ...merged })
    .onConflictDoUpdate({ target: settingsTable.id, set: merged });
  return merged;
}

/** Today's date as YYYY-MM-DD in the server's local time zone. */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Accumulates energy for today using trapezoidal integration between the
 * previous reading and now: energyKwh += avgPowerW * hoursElapsed / 1000.
 * Called once per poll cycle, after the new inverterReadings row is inserted.
 * Returns the day + delta that was applied, or null if there was nothing to
 * integrate against yet, so callers can feed the same delta into other
 * rollups (hourly, battery health) without re-deriving it.
 */
export async function accumulateDailyEnergy(params: {
  previousTs: Date | null;
  now: Date;
  pvW: number;
  loadW: number;
  gridW: number | null;
  batteryW: number;
  previousPvW: number;
  previousLoadW: number;
  previousGridW: number | null;
  previousBatteryW: number;
}): Promise<{ date: string; delta: EnergyDelta } | null> {
  const delta = computeEnergyDelta(params);
  if (!delta) return null;

  const date = todayKey(params.now);
  const existing = await db.query.energyDaily.findFirst({ where: eq(energyDaily.date, date) });
  if (existing) {
    await db
      .update(energyDaily)
      .set({
        pvKwh: existing.pvKwh + delta.pvKwh,
        loadKwh: existing.loadKwh + delta.loadKwh,
        gridImportKwh: existing.gridImportKwh + delta.gridImportKwh,
        gridExportKwh: existing.gridExportKwh + delta.gridExportKwh,
        battChargeKwh: existing.battChargeKwh + delta.battChargeKwh,
        battDischargeKwh: existing.battDischargeKwh + delta.battDischargeKwh,
      })
      .where(eq(energyDaily.date, date));
  } else {
    await db.insert(energyDaily).values({
      date,
      pvKwh: delta.pvKwh,
      loadKwh: delta.loadKwh,
      gridImportKwh: delta.gridImportKwh,
      gridExportKwh: delta.gridExportKwh,
      battChargeKwh: delta.battChargeKwh,
      battDischargeKwh: delta.battDischargeKwh,
    });
  }

  return { date, delta };
}

/**
 * Accumulates the hour-of-day energy rollup (never pruned, unlike raw
 * inverterReadings) so a long-term time-of-day usage pattern can be built.
 * Called once per poll cycle alongside accumulateDailyEnergy.
 */
export async function accumulateHourlyEnergy(
  date: string,
  hourOfDay: number,
  delta: { pvKwh: number; loadKwh: number }
) {
  const existing = await db.query.energyHourly.findFirst({
    where: and(eq(energyHourly.date, date), eq(energyHourly.hourOfDay, hourOfDay)),
  });
  if (existing) {
    await db
      .update(energyHourly)
      .set({
        pvWh: existing.pvWh + delta.pvKwh * 1000,
        loadWh: existing.loadWh + delta.loadKwh * 1000,
        sampleCount: existing.sampleCount + 1,
      })
      .where(eq(energyHourly.id, existing.id));
  } else {
    await db.insert(energyHourly).values({
      date,
      hourOfDay,
      pvWh: delta.pvKwh * 1000,
      loadWh: delta.loadKwh * 1000,
      sampleCount: 1,
    });
  }
}

/**
 * Accumulates daily battery health (min/max SoC, charge/discharge kWh),
 * never pruned, so lifetime cycle-equivalent and SoC range can be tracked
 * past the 90-day raw-reading retention window.
 */
export async function accumulateBatteryHealth(
  date: string,
  socPercent: number,
  delta: { battChargeKwh: number; battDischargeKwh: number }
) {
  const existing = await db.query.batteryHealthDaily.findFirst({ where: eq(batteryHealthDaily.date, date) });
  if (existing) {
    await db
      .update(batteryHealthDaily)
      .set({
        minSocPct: existing.minSocPct == null ? socPercent : Math.min(existing.minSocPct, socPercent),
        maxSocPct: existing.maxSocPct == null ? socPercent : Math.max(existing.maxSocPct, socPercent),
        chargeKwh: existing.chargeKwh + delta.battChargeKwh,
        dischargeKwh: existing.dischargeKwh + delta.battDischargeKwh,
      })
      .where(eq(batteryHealthDaily.date, date));
  } else {
    await db.insert(batteryHealthDaily).values({
      date,
      minSocPct: socPercent,
      maxSocPct: socPercent,
      chargeKwh: delta.battChargeKwh,
      dischargeKwh: delta.battDischargeKwh,
    });
  }
}

/** Deletes raw readings older than `days` (retention rollup; daily rows are kept indefinitely). */
export async function pruneOldReadings(days: number) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  await db.delete(inverterReadings).where(lt(inverterReadings.ts, cutoff));
  await db.delete(tuyaReadings).where(lt(tuyaReadings.ts, cutoff));
}

/** Adds a kWh delta to a device's daily energy total (upsert on deviceId+date). */
export async function accumulateTuyaEnergy(deviceId: string, now: Date, deltaKwh: number) {
  if (!(deltaKwh > 0)) return;
  const date = todayKey(now);
  await db
    .insert(tuyaEnergyDaily)
    .values({ deviceId, date, kwh: deltaKwh })
    .onConflictDoUpdate({
      target: [tuyaEnergyDaily.deviceId, tuyaEnergyDaily.date],
      set: { kwh: sql`${tuyaEnergyDaily.kwh} + ${deltaKwh}` },
    });
}

/** Per-device energy for the last `days` days, oldest first. */
export async function getRecentTuyaEnergy(days: number) {
  const cutoff = todayKey(new Date(Date.now() - days * 86_400_000));
  return db.select().from(tuyaEnergyDaily).where(gte(tuyaEnergyDaily.date, cutoff)).orderBy(tuyaEnergyDaily.date);
}

/** Per-device total energy over the last `days` days, joined with device names. */
export async function getTuyaEnergyTotalsByDevice(days: number) {
  const cutoff = todayKey(new Date(Date.now() - days * 86_400_000));
  const rows = await db
    .select({ deviceId: tuyaEnergyDaily.deviceId, kwh: tuyaEnergyDaily.kwh })
    .from(tuyaEnergyDaily)
    .where(gte(tuyaEnergyDaily.date, cutoff));
  const devices = await db.select({ id: tuyaDevices.id, name: tuyaDevices.name }).from(tuyaDevices);
  const nameById = new Map(devices.map((d) => [d.id, d.name]));

  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.deviceId, (totals.get(r.deviceId) ?? 0) + r.kwh);
  return Array.from(totals.entries()).map(([id, kwhToday]) => ({ id, name: nameById.get(id) ?? id, kwhToday }));
}

/** Today's per-device energy as a deviceId -> kWh map. */
export async function getTuyaEnergyToday(): Promise<Map<string, number>> {
  const rows = await db.select().from(tuyaEnergyDaily).where(eq(tuyaEnergyDaily.date, todayKey()));
  return new Map(rows.map((r) => [r.deviceId, r.kwh]));
}

/**
 * Recomputes energy_daily / energy_hourly / battery_health_daily for one
 * calendar day *from scratch*, replacing whatever was there. Used by
 * backfill (which inserts raw readings for a whole past day and then needs
 * accurate rollups) so a re-run is idempotent instead of double-counting on
 * top of the incremental per-poll accumulation used for the live path.
 */
export async function rebuildDayRollups(date: string) {
  const startOfDay = new Date(`${date}T00:00:00`);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const readings = await db
    .select()
    .from(inverterReadings)
    .where(and(gte(inverterReadings.ts, startOfDay), lt(inverterReadings.ts, endOfDay)))
    .orderBy(inverterReadings.ts);

  const { rollupReadings } = await import("@/lib/metrics");
  const rollup = rollupReadings(readings);
  if (!rollup) return;

  await db
    .insert(energyDaily)
    .values({ date, ...rollup.daily })
    .onConflictDoUpdate({ target: energyDaily.date, set: rollup.daily });

  await db
    .insert(batteryHealthDaily)
    .values({ date, ...rollup.batteryHealth })
    .onConflictDoUpdate({ target: batteryHealthDaily.date, set: rollup.batteryHealth });

  for (const [hourOfDay, hourly] of rollup.hourly.entries()) {
    await db
      .insert(energyHourly)
      .values({ date, hourOfDay, ...hourly })
      .onConflictDoUpdate({ target: [energyHourly.date, energyHourly.hourOfDay], set: hourly });
  }
}

// --- Ingest observability ---

export async function getRecentIngestRuns(limit: number) {
  return db.select().from(ingestRuns).orderBy(desc(ingestRuns.startedAt)).limit(limit);
}

/**
 * The single latest run for each given source. Unlike `getRecentIngestRuns`,
 * this can't be starved: a source that logs far more often than another
 * (e.g. a backfill loop vs. a once-per-poll live sync) won't push the
 * quieter source out of a shared "last N" window.
 */
export async function getLatestIngestRunBySource(sources: string[]) {
  const rows = await Promise.all(
    sources.map((source) =>
      db.select().from(ingestRuns).where(eq(ingestRuns.source, source)).orderBy(desc(ingestRuns.startedAt)).limit(1)
    )
  );
  const map = new Map<string, (typeof rows)[number][number]>();
  sources.forEach((source, i) => {
    const row = rows[i][0];
    if (row) map.set(source, row);
  });
  return map;
}

export async function getBackfillState() {
  return db.select().from(backfillState);
}
