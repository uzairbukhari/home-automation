import { db } from "@/db/client";
import { inverterReadings, tuyaDevices, tuyaReadings, tuyaEvents, ingestRuns } from "@/db/schema";
import { queryPlants, queryDevicesInPlant, queryDeviceLastData } from "@/lib/dess/client";
import { normalizeSnapshot } from "@/lib/dess/normalize";
import { listDevices, getDeviceStatus } from "@/lib/tuya/client";
import {
  getLatestInverterReading,
  accumulateDailyEnergy,
  accumulateHourlyEnergy,
  accumulateBatteryHealth,
  accumulateTuyaEnergy,
  pruneOldReadings,
} from "@/lib/queries";

export interface PollResult {
  ok: boolean;
  rows: number;
  error?: string;
}

export interface PollRunResults {
  dess: PollResult;
  tuya: PollResult;
  prune?: PollResult;
}

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 180);

async function recordRun(source: string, startedAt: Date, result: PollResult) {
  try {
    await db.insert(ingestRuns).values({
      source,
      startedAt,
      durationMs: Date.now() - startedAt.getTime(),
      ok: result.ok,
      error: result.error ?? null,
      rows: result.rows,
    });
  } catch {
    // Observability write failing must never break ingestion itself.
  }
}

/** One DessMonitor poll: fetch the live snapshot, write a reading, integrate rollups. */
export async function pollDess(): Promise<PollResult> {
  const startedAt = new Date();
  let result: PollResult;
  try {
    const previous = await getLatestInverterReading();
    const plants = await queryPlants();
    const plant = plants[0];
    if (!plant) throw new Error("No plants returned for this DessMonitor account.");
    const devices = await queryDevicesInPlant(plant.pid);
    const device = devices[0];
    if (!device) throw new Error("No devices returned for this plant.");
    const points = await queryDeviceLastData(device);
    const snapshot = normalizeSnapshot(points);
    const now = new Date();

    await db.insert(inverterReadings).values({
      ts: now,
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
      rawPoints: points,
      source: "poll",
    });

    const accumulated = await accumulateDailyEnergy({
      previousTs: previous?.ts ?? null,
      now,
      pvW: snapshot.pvW,
      loadW: snapshot.loadW,
      gridW: snapshot.gridW,
      batteryW: snapshot.batteryW,
      previousPvW: previous?.pvW ?? snapshot.pvW,
      previousLoadW: previous?.loadW ?? snapshot.loadW,
      previousGridW: previous?.gridW ?? snapshot.gridW,
      previousBatteryW: previous?.batteryW ?? snapshot.batteryW,
    });
    if (accumulated) {
      await accumulateHourlyEnergy(accumulated.date, now.getHours(), accumulated.delta);
      await accumulateBatteryHealth(accumulated.date, snapshot.batterySoc, accumulated.delta);
    }

    result = { ok: true, rows: 1 };
  } catch (err) {
    result = { ok: false, rows: 0, error: String(err) };
  }
  await recordRun("dess", startedAt, result);
  return result;
}

// Tuya reports cur_power/cur_current in 0.1 units, cur_voltage in 0.1V, and
// add_ele in 0.01 kWh — confirmed for the dlq/tdq/cz categories in this
// account via `tuya:probe`.
function findNum(status: Array<{ code: string; value: unknown }>, code: string): number | null {
  const v = status.find((s) => s.code === code)?.value;
  return typeof v === "number" ? v : null;
}

/** One Tuya poll: refresh every linked device's status, diff for events, integrate energy. */
export async function pollTuya(): Promise<PollResult> {
  const startedAt = new Date();
  let result: PollResult;
  let rows = 0;
  try {
    const devices = await listDevices();
    const now = new Date();
    for (const device of devices) {
      const existing = await db.query.tuyaDevices.findFirst({ where: (t, { eq }) => eq(t.id, device.id) });
      const previousStatus = (existing?.lastStatus as Array<{ code: string; value: unknown }> | null) ?? [];

      let status: Awaited<ReturnType<typeof getDeviceStatus>> = [];
      try {
        status = await getDeviceStatus(device.id);
      } catch {
        // device may be offline; keep last known status
      }

      await db
        .insert(tuyaDevices)
        .values({
          id: device.id,
          name: device.name,
          category: device.category,
          online: device.online,
          icon: device.icon,
          lastStatus: status.length ? status : undefined,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tuyaDevices.id,
          set: {
            name: device.name,
            category: device.category,
            online: device.online,
            icon: device.icon,
            ...(status.length ? { lastStatus: status } : {}),
            updatedAt: now,
          },
        });

      // Diff against the previous status to log only actual DP changes.
      if (status.length && previousStatus.length) {
        const prevMap = new Map(previousStatus.map((s) => [s.code, s.value]));
        const changed = status.filter((s) => !prevMap.has(s.code) || prevMap.get(s.code) !== s.value);
        if (changed.length) {
          await db.insert(tuyaEvents).values(
            changed.map((c) => ({ ts: now, deviceId: device.id, code: c.code, value: c.value }))
          );
          rows += changed.length;
        }
      }

      const power = findNum(status, "cur_power");
      const voltage = findNum(status, "cur_voltage");
      const current = findNum(status, "cur_current");
      const addEleRaw = findNum(status, "add_ele");
      if (power != null || voltage != null || current != null || addEleRaw != null) {
        await db.insert(tuyaReadings).values({
          ts: now,
          deviceId: device.id,
          powerW: power != null ? power / 10 : null,
          voltageV: voltage != null ? voltage / 10 : null,
          currentA: current != null ? current / 1000 : null,
          addEleKwh: addEleRaw != null ? addEleRaw / 100 : null,
          extra: status,
        });
        rows += 1;
      }

      if (addEleRaw != null) {
        const prevAddEle = findNum(previousStatus, "add_ele");
        if (prevAddEle != null && addEleRaw >= prevAddEle) {
          await accumulateTuyaEnergy(device.id, now, (addEleRaw - prevAddEle) / 100);
        }
      }
    }
    result = { ok: true, rows: rows || devices.length };
  } catch (err) {
    result = { ok: false, rows, error: String(err) };
  }
  await recordRun("tuya", startedAt, result);
  return result;
}

/** Runs both polls plus retention pruning. Called by the API route and the in-process scheduler. */
export async function runPoll(): Promise<PollRunResults> {
  const [dess, tuya] = await Promise.all([pollDess(), pollTuya()]);

  let prune: PollResult | undefined;
  try {
    await pruneOldReadings(RETENTION_DAYS);
    prune = { ok: true, rows: 0 };
  } catch (err) {
    prune = { ok: false, rows: 0, error: String(err) };
  }

  return { dess, tuya, prune };
}
