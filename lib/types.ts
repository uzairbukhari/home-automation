import type { TariffSettings } from "@/lib/metrics";

export interface LiveInverter {
  ts: string;
  pvW: number;
  loadW: number;
  batteryW: number;
  batterySoc: number;
  batteryV: number | null;
  batteryA: number | null;
  gridW: number | null;
  gridV: number | null;
  gridHz: number | null;
  pvV: number | null;
  outputV: number | null;
  loadPct: number | null;
  inverterTempC: number | null;
  mode: string | null;
}

export interface LiveCurvePoint {
  ts: number;
  pvW: number;
  loadW: number;
  batteryW: number;
  gridW: number | null;
}

export interface LiveDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
  room: string | null;
  status: Array<{ code: string; value: string | number | boolean }>;
  powerW: number | null;
  kwhToday: number;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface IngestStatus {
  source: string;
  ok: boolean;
  startedAt: string;
  durationMs: number;
  error: string | null;
}

export interface LiveTodaySummary {
  pvKwh: number;
  loadKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  battChargeKwh: number;
  battDischargeKwh: number;
  selfSufficiency: number;
  selfConsumption: number;
  specificYield: number;
  savingsPkr: number;
}

export interface LiveResponse {
  inverter: LiveInverter | null;
  todayCurve: LiveCurvePoint[];
  devices: LiveDevice[];
  today: LiveTodaySummary;
  settings: TariffSettings;
  alerts: AlertItem[];
  ingest: IngestStatus[];
}
