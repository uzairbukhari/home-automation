import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// --- Inverter (DessMonitor) ---

export const inverterReadings = sqliteTable(
  "inverter_readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts", { mode: "timestamp" }).notNull(), // reading timestamp (UTC)
    pvW: real("pv_w").notNull(), // solar production, watts
    loadW: real("load_w").notNull(), // household load, watts
    batteryW: real("battery_w").notNull(), // +charging / -discharging
    batterySoc: real("battery_soc").notNull(), // %
    batteryV: real("battery_v"),
    batteryA: real("battery_a"),
    gridW: real("grid_w"), // +import / -export
    gridV: real("grid_v"),
    inverterTempC: real("inverter_temp_c"),
    mode: text("mode"), // e.g. "line", "battery", "solar"
    // Extra fields captured from DessMonitor but not used in core rollups yet.
    pvV: real("pv_v"),
    pvA: real("pv_a"),
    gridHz: real("grid_hz"),
    outputV: real("output_v"),
    outputHz: real("output_hz"),
    loadPct: real("load_pct"),
    raw: text("raw", { mode: "json" }), // full normalized snapshot for debugging
    rawPoints: text("raw_points", { mode: "json" }), // raw {title,val,unit}[] from the API, for future re-mapping
    source: text("source").notNull().default("poll"), // "poll" | "backfill"
  },
  (t) => [uniqueIndex("inverter_readings_ts_idx").on(t.ts)]
);

export const energyDaily = sqliteTable(
  "energy_daily",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull().unique(), // YYYY-MM-DD (local day)
    pvKwh: real("pv_kwh").notNull().default(0),
    loadKwh: real("load_kwh").notNull().default(0),
    gridImportKwh: real("grid_import_kwh").notNull().default(0),
    gridExportKwh: real("grid_export_kwh").notNull().default(0),
    battChargeKwh: real("batt_charge_kwh").notNull().default(0),
    battDischargeKwh: real("batt_discharge_kwh").notNull().default(0),
  }
);

export const energyHourly = sqliteTable(
  "energy_hourly",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // YYYY-MM-DD (local day, matches todayKey())
    hourOfDay: integer("hour_of_day").notNull(), // 0-23, local hour
    pvWh: real("pv_wh").notNull().default(0),
    loadWh: real("load_wh").notNull().default(0),
    sampleCount: integer("sample_count").notNull().default(0),
  },
  (t) => [uniqueIndex("energy_hourly_date_hour_idx").on(t.date, t.hourOfDay)]
);

export const batteryHealthDaily = sqliteTable("battery_health_daily", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // YYYY-MM-DD (local day)
  minSocPct: real("min_soc_pct"),
  maxSocPct: real("max_soc_pct"),
  chargeKwh: real("charge_kwh").notNull().default(0),
  dischargeKwh: real("discharge_kwh").notNull().default(0),
});

// --- Tuya devices ---

export const tuyaDevices = sqliteTable("tuya_devices", {
  id: text("id").primaryKey(), // Tuya device id
  name: text("name").notNull(),
  category: text("category").notNull(), // Tuya category code, e.g. "cz", "kg", "dj"
  online: integer("online", { mode: "boolean" }).notNull().default(false),
  room: text("room"),
  icon: text("icon"),
  lastStatus: text("last_status", { mode: "json" }), // array of {code, value}
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const tuyaReadings = sqliteTable(
  "tuya_readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    deviceId: text("device_id")
      .notNull()
      .references(() => tuyaDevices.id),
    powerW: real("power_w"),
    energyKwh: real("energy_kwh"),
    voltageV: real("voltage_v"),
    currentA: real("current_a"),
    addEleKwh: real("add_ele_kwh"), // Tuya's own cumulative energy counter, when the device reports one
    extra: text("extra", { mode: "json" }),
  },
  (t) => [index("tuya_readings_device_ts_idx").on(t.deviceId, t.ts)]
);

// One row per DP value change (switch toggles, brightness, online state, ...).
// Powers on-time / activity-timeline insights without scanning every raw poll.
export const tuyaEvents = sqliteTable(
  "tuya_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    deviceId: text("device_id")
      .notNull()
      .references(() => tuyaDevices.id),
    code: text("code").notNull(),
    value: text("value", { mode: "json" }).notNull(),
  },
  (t) => [index("tuya_events_device_ts_idx").on(t.deviceId, t.ts)]
);

// Per-device daily energy (kWh), from live add_ele deltas and/or backfilled
// from Tuya's statistics API. Unique per device+date so backfill can upsert.
export const tuyaEnergyDaily = sqliteTable(
  "tuya_energy_daily",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: text("device_id")
      .notNull()
      .references(() => tuyaDevices.id),
    date: text("date").notNull(),
    kwh: real("kwh").notNull().default(0),
  },
  (t) => [uniqueIndex("tuya_energy_daily_device_date_idx").on(t.deviceId, t.date)]
);

// --- Ingestion observability ---

export const ingestRuns = sqliteTable(
  "ingest_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(), // "dess" | "tuya" | "dess_backfill" | "tuya_backfill"
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    error: text("error"),
    rows: integer("rows").notNull().default(0),
  },
  (t) => [index("ingest_runs_source_started_idx").on(t.source, t.startedAt)]
);

export const backfillState = sqliteTable("backfill_state", {
  source: text("source").primaryKey(), // "dess" | "tuya"
  cursorDate: text("cursor_date"), // YYYY-MM-DD, walks backward from yesterday
  doneAt: integer("done_at", { mode: "timestamp" }), // set once the target window is fully backfilled
  lastError: text("last_error"),
});

// --- Settings (single row, id = 1) ---

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  currency: text("currency").notNull().default("PKR"),
  flatRatePerKwh: real("flat_rate_per_kwh"), // simple tariff
  peakRatePerKwh: real("peak_rate_per_kwh"), // optional time-of-use
  offPeakRatePerKwh: real("off_peak_rate_per_kwh"),
  peakStartHour: integer("peak_start_hour"), // 0-23
  peakEndHour: integer("peak_end_hour"),
  systemCostPkr: real("system_cost_pkr"), // total install cost, for ROI
  panelKwp: real("panel_kwp").notNull().default(3.5),
  batteryKwh: real("battery_kwh").notNull().default(5.2),
  gridCo2KgPerKwh: real("grid_co2_kg_per_kwh").notNull().default(0.45),
});

// --- Cached provider tokens ---

export const authTokens = sqliteTable("auth_tokens", {
  provider: text("provider").primaryKey(), // "dess" | "tuya"
  token: text("token").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  extra: text("extra", { mode: "json" }), // e.g. dess session id / endpoint
});
