import { db } from "@/db/client";
import { inverterReadings, tuyaEvents, backfillState, ingestRuns, tuyaDevices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { queryPlants, queryDevicesInPlant, queryDeviceDataOneDayPaging } from "@/lib/dess/client";
import { normalizeSnapshot } from "@/lib/dess/normalize";
import { getDeviceLogs, TuyaApiError } from "@/lib/tuya/client";
import { rebuildDayRollups, accumulateTuyaEnergy } from "@/lib/queries";

const BACKFILL_DAYS = Number(process.env.BACKFILL_DAYS ?? 90);

function yesterday(): string {
  return dateKey(new Date(Date.now() - 86_400_000));
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayBefore(dateStr: string): string {
  return dateKey(new Date(new Date(`${dateStr}T00:00:00`).getTime() - 86_400_000));
}

function oldestAllowed(): string {
  return dateKey(new Date(Date.now() - BACKFILL_DAYS * 86_400_000));
}

async function getState(source: string) {
  return db.query.backfillState.findFirst({ where: eq(backfillState.source, source) });
}

async function saveState(source: string, values: { cursorDate?: string | null; doneAt?: Date | null; lastError?: string | null }) {
  await db
    .insert(backfillState)
    .values({ source, ...values })
    .onConflictDoUpdate({ target: backfillState.source, set: values });
}

async function recordRun(source: string, startedAt: Date, ok: boolean, rows: number, error?: string) {
  try {
    await db.insert(ingestRuns).values({
      source,
      startedAt,
      durationMs: Date.now() - startedAt.getTime(),
      ok,
      error: error ?? null,
      rows,
    });
  } catch {
    // never let observability logging break backfill
  }
}

/** Backfills one day of DessMonitor history, walking backward from yesterday. Idempotent (unique ts). */
async function backfillDessDay(): Promise<void> {
  const startedAt = new Date();
  const state = await getState("dess");
  if (state?.doneAt) return;

  const date = state?.cursorDate ?? yesterday();
  if (date < oldestAllowed()) {
    await saveState("dess", { doneAt: new Date() });
    return;
  }

  try {
    const plants = await queryPlants();
    const plant = plants[0];
    if (!plant) throw new Error("No plants returned for this DessMonitor account.");
    const devices = await queryDevicesInPlant(plant.pid);
    const device = devices[0];
    if (!device) throw new Error("No devices returned for this plant.");

    const rows = await queryDeviceDataOneDayPaging(device, date);
    for (const row of rows) {
      const snapshot = normalizeSnapshot(row.points);
      await db
        .insert(inverterReadings)
        .values({
          ts: row.ts,
          pvW: snapshot.pvW,
          loadW: snapshot.loadW,
          batteryW: snapshot.batteryW,
          batterySoc: snapshot.batterySoc,
          batteryV: snapshot.batteryV,
          batteryA: snapshot.batteryA,
          gridW: snapshot.gridW,
          gridV: snapshot.gridV,
          inverterTempC: snapshot.inverterTempC,
          mode: snapshot.mode,
          pvV: snapshot.pvV,
          pvA: snapshot.pvA,
          gridHz: snapshot.gridHz,
          outputV: snapshot.outputV,
          outputHz: snapshot.outputHz,
          loadPct: snapshot.loadPct,
          raw: snapshot,
          rawPoints: row.points,
          source: "backfill",
        })
        .onConflictDoNothing({ target: inverterReadings.ts });
    }

    if (rows.length > 0) await rebuildDayRollups(date);

    await saveState("dess", { cursorDate: dayBefore(date), lastError: null });
    await recordRun("dess_backfill", startedAt, true, rows.length);
  } catch (err) {
    await saveState("dess", { lastError: String(err) });
    await recordRun("dess_backfill", startedAt, false, 0, String(err));
  }
}

// Broad set of DP codes worth backfilling from Tuya's report-logs across the
// device categories confirmed on this account (cz/kg/pc/dlq/tdq/dj) — power
// metering + on/off state. Unknown codes are simply absent from a device's
// logs, so a shared list is safe (no per-category branching needed).
const BACKFILL_CODES = [
  "switch",
  "switch_1",
  "switch_2",
  "switch_3",
  "switch_4",
  "switch_5",
  "switch_led",
  "cur_power",
  "cur_voltage",
  "cur_current",
  "add_ele",
];

/** Backfills one day of Tuya device-log history (events + add_ele energy), walking backward from yesterday. */
async function backfillTuyaDay(): Promise<void> {
  const startedAt = new Date();
  const state = await getState("tuya");
  if (state?.doneAt) return;

  const date = state?.cursorDate ?? yesterday();
  if (date < oldestAllowed()) {
    await saveState("tuya", { doneAt: new Date() });
    return;
  }

  const dayStart = new Date(`${date}T00:00:00`).getTime();
  const dayEnd = dayStart + 86_400_000;

  try {
    const devices = await db.select().from(tuyaDevices);
    let totalRows = 0;
    for (const device of devices) {
      let logs;
      try {
        logs = await getDeviceLogs(device.id, BACKFILL_CODES, dayStart, dayEnd);
      } catch (err) {
        // A Cloud project not subscribed to the Device Log Service API
        // (28841101) can't backfill any device — stop retrying entirely
        // rather than fail once per device on every future call.
        if (err instanceof TuyaApiError && err.code === 28841101) {
          await saveState("tuya", { doneAt: new Date(), lastError: String(err) });
          await recordRun("tuya_backfill", startedAt, false, 0, String(err));
          return;
        }
        continue; // other per-device errors: skip this device for the day
      }
      if (!logs.length) continue;

      await db.insert(tuyaEvents).values(
        logs.map((l) => ({ ts: new Date(l.event_time), deviceId: device.id, code: l.code, value: l.value }))
      );
      totalRows += logs.length;

      // Sum positive add_ele deltas across the day into tuya_energy_daily.
      const addEleLogs = logs
        .filter((l) => l.code === "add_ele")
        .map((l) => ({ ts: l.event_time, value: Number(l.value) }))
        .filter((l) => Number.isFinite(l.value))
        .sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < addEleLogs.length; i++) {
        const delta = (addEleLogs[i].value - addEleLogs[i - 1].value) / 100;
        if (delta > 0) await accumulateTuyaEnergy(device.id, new Date(date + "T12:00:00"), delta);
      }
    }

    await saveState("tuya", { cursorDate: dayBefore(date), lastError: null });
    await recordRun("tuya_backfill", startedAt, true, totalRows);
  } catch (err) {
    await saveState("tuya", { lastError: String(err) });
    await recordRun("tuya_backfill", startedAt, false, 0, String(err));
  }
}

/** Advances backfill by one day per source. Safe to call repeatedly (poll cycle, scheduler tick, or CLI loop). */
export async function backfillStep(): Promise<{ dess: "done" | "stepped"; tuya: "done" | "stepped" }> {
  const [dessState, tuyaState] = await Promise.all([getState("dess"), getState("tuya")]);

  if (!dessState?.doneAt) await backfillDessDay();
  if (!tuyaState?.doneAt) await backfillTuyaDay();

  const [dessAfter, tuyaAfter] = await Promise.all([getState("dess"), getState("tuya")]);
  return {
    dess: dessAfter?.doneAt ? "done" : "stepped",
    tuya: tuyaAfter?.doneAt ? "done" : "stepped",
  };
}
