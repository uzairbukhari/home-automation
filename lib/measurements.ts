export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeMeasurement(value: unknown, unit: string, target: string) {
  const number = finiteNumber(value);
  if (number === null) return null;
  const source = unit.trim().toLowerCase();
  const factors: Record<string, Record<string, number>> = {
    W: { w: 1, kw: 1000, mw: 1_000_000 },
    kWh: { wh: .001, kwh: 1, mwh: 1000 },
    '%': { '%': 1 }, V: { v: 1, mv: .001 }, A: { a: 1, ma: .001 },
  };
  const factor = factors[target]?.[source];
  if (factor !== undefined) return number * factor;
  if (source === target.toLowerCase()) return number;
  return null;
}

export function localDate(timestamp: string | number | Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
}
export function localTime(timestamp: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}
