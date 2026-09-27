import crypto from "crypto";
import { db } from "@/db/client";
import { authTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

// DessMonitor public API client.
//
// Confirmed against the official docs at https://api.dessmonitor.com/ (see
// chapter1/apiHelp.html, chapter1/demoJava.html, chapter1/errCode.html) and
// cross-checked against the open-source Home Assistant integration
// https://github.com/andreas-glaser/ha-dessmonitor. The signing scheme and
// required params below match those sources; the *response field names* in
// lib/dess/normalize.ts vary per inverter model/firmware (each devcode can
// report different `title` strings) — verify those with `npm run dess:probe`
// against this account's real device and extend normalize.ts if needed.

const BASE_URL = "https://api.dessmonitor.com/public/";

// Required on every request (including login) alongside action-specific
// params. `source=1` means "energy storage" (battery/hybrid systems, as
// opposed to `0` for solar-only ShineMonitor). _app_id_/_app_version_/
// _app_client_ just have to be present and non-empty — the values below
// match a known-working third-party client.
const APP_PARAMS = { source: "1", _app_client_: "web", _app_id_: "ha-dessmonitor", _app_version_: "2.4.0" };

interface AuthResult {
  token: string;
  secret: string;
  expiresAt: Date;
  uid: string;
}

function sha1(input: string): string {
  return crypto.createHash("sha1").update(input, "utf8").digest("hex");
}

function salt(): string {
  return Date.now().toString();
}

/** Builds "&k1=v1&k2=v2..." for the given params, in the given order (order matters for the signature). */
function actionParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join("");
}

/** GET call to `${BASE_URL}?${query}`, unwrapping DessMonitor's {err, desc, dat} envelope. */
async function callApi<T>(query: string): Promise<T> {
  const url = new URL(BASE_URL);
  url.search = query;
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`DessMonitor HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { err: number; desc: string; dat: T };
  if (json.err !== 0) throw new Error(`DessMonitor API error ${json.err}: ${json.desc}`);
  return json.dat;
}

/** Authenticate and return a fresh token+secret (does not read/write cache). */
async function login(): Promise<AuthResult> {
  const username = requireEnv("DESS_USERNAME");
  const password = requireEnv("DESS_PASSWORD");
  const companyKey = requireEnv("DESS_COMPANY_KEY");

  const s = salt();
  const passwordSha1 = sha1(password);
  const action =
    `&action=authSource&usr=${encodeURIComponent(username)}` +
    `&company-key=${encodeURIComponent(companyKey)}` +
    actionParams(APP_PARAMS);
  const sign = sha1(s + passwordSha1 + action);

  const dat = await callApi<{ token: string; secret: string; expire: number; uid: string }>(
    `sign=${sign}&salt=${s}${action}`
  );
  return {
    token: dat.token,
    secret: dat.secret,
    uid: dat.uid,
    expiresAt: new Date(Date.now() + dat.expire * 1000),
  };
}

/**
 * Returns a valid token, from cache when possible, else re-authenticates.
 * DB caching is best-effort: if DATABASE_URL isn't configured yet (e.g.
 * while running scripts/dess-probe.ts before Turso is set up), this just
 * logs in fresh every call instead of failing.
 */
async function getAuth(): Promise<AuthResult> {
  if (!process.env.DATABASE_URL) {
    return login();
  }

  const cached = await db.query.authTokens.findFirst({
    where: eq(authTokens.provider, "dess"),
  });
  if (cached && cached.expiresAt.getTime() > Date.now() + 60_000) {
    const extra = cached.extra as { secret: string; uid: string } | null;
    if (extra?.secret) {
      return {
        token: cached.token,
        secret: extra.secret,
        uid: extra.uid,
        expiresAt: cached.expiresAt,
      };
    }
  }

  const fresh = await login();
  await db
    .insert(authTokens)
    .values({
      provider: "dess",
      token: fresh.token,
      expiresAt: fresh.expiresAt,
      extra: { secret: fresh.secret, uid: fresh.uid },
    })
    .onConflictDoUpdate({
      target: authTokens.provider,
      set: {
        token: fresh.token,
        expiresAt: fresh.expiresAt,
        extra: { secret: fresh.secret, uid: fresh.uid },
      },
    });
  return fresh;
}

/** Signed authenticated GET call. actionQuery starts with "&action=...". APP_PARAMS is appended automatically. */
async function authedCall<T>(actionQuery: string): Promise<T> {
  const auth = await getAuth();
  const fullAction = actionQuery + actionParams(APP_PARAMS);
  const s = salt();
  const sign = sha1(s + auth.secret + auth.token + fullAction);
  return callApi<T>(`sign=${sign}&salt=${s}&token=${auth.token}${fullAction}`);
}

export interface DessPlant {
  pid: string;
  name: string;
}

export interface DessCollector {
  pn: string; // collector serial ("data logger"/dongle), one per physical site link
  alias: string;
  status: number; // 1 = online, 0 = offline (confirmed against a real account)
}

export interface DessDevice {
  pn: string; // owning collector's serial
  devcode: string;
  devaddr: string;
  sn: string;
  name: string;
}

export async function queryPlants(): Promise<DessPlant[]> {
  const dat = await authedCall<{ plant: DessPlant[] }>("&action=queryPlants&pagesize=50");
  return dat.plant ?? [];
}

/** Escape hatch for probing a new/undocumented action's raw response shape (e.g. from a script). */
export async function debugRawAction<T = unknown>(actionQuery: string): Promise<T> {
  return authedCall<T>(actionQuery);
}

/**
 * Lists the data-collector(s) linked to a plant. Confirmed against a real
 * account: the response key is `collector` (not `device`), and each entry's
 * `pn` is the collector's own serial — it does NOT include devcode/devaddr/sn
 * yet, hence queryDevicesInCollector below.
 */
export async function queryCollectorsInPlant(pid: string): Promise<DessCollector[]> {
  const dat = await authedCall<{ collector: DessCollector[] }>(
    `&action=webQueryCollectorsEs&pid=${encodeURIComponent(pid)}&page=0&pagesize=50`
  );
  return dat.collector ?? [];
}

/**
 * Lists the actual inverter device(s) behind one collector — this is what
 * supplies the devcode/devaddr/sn triplet queryDeviceLastData needs.
 * Confirmed against api.dessmonitor.com/chapter4/queryCollectorDevices.html.
 */
export async function queryDevicesInCollector(collectorPn: string): Promise<DessDevice[]> {
  const dat = await authedCall<{
    pn: string;
    dev: Array<{ devcode: number | string; devaddr: number | string; sn: string; alias?: string }>;
  }>(`&action=queryCollectorDevices&pn=${encodeURIComponent(collectorPn)}`);
  return (dat.dev ?? []).map((d) => ({
    pn: collectorPn,
    devcode: String(d.devcode),
    devaddr: String(d.devaddr),
    sn: d.sn,
    name: d.alias || d.sn,
  }));
}

/** Convenience: every device across every collector in a plant, in one call. */
export async function queryDevicesInPlant(pid: string): Promise<DessDevice[]> {
  const collectors = await queryCollectorsInPlant(pid);
  const perCollector = await Promise.all(collectors.map((c) => queryDevicesInCollector(c.pn)));
  return perCollector.flat();
}

/** Raw "last data" point list for a device: a flat array of {title, val, unit}. */
export async function queryDeviceLastData(
  device: DessDevice
): Promise<Array<{ title: string; val: string; unit?: string }>> {
  const q =
    `&action=queryDeviceLastData&pn=${encodeURIComponent(device.pn)}` +
    `&devcode=${encodeURIComponent(device.devcode)}` +
    `&devaddr=${encodeURIComponent(device.devaddr)}` +
    `&sn=${encodeURIComponent(device.sn)}` +
    `&i18n=en_US`;
  const dat = await authedCall<Array<{ title: string; val: string; unit?: string }>>(q);
  return dat ?? [];
}

/**
 * One day's historic readings for a device, paginated automatically.
 * Confirmed shape (live probe against a real HPVINV02 account,
 * `action=queryDeviceDataOneDayPaging`, `date=YYYY-MM-DD`):
 *   dat.title = [{ title, unit?, isDisplay }, ...]   (column headers, in order)
 *   dat.row   = [{ realtime?, field: string[] }, ...] (field[i] matches title[i])
 *   dat.total = total row count for that day (paginate with page/pagesize until covered)
 * Each row's `field` array is zipped with `title` into the same
 * `{title, val, unit}[]` shape `queryDeviceLastData` returns, so both feed
 * the same `normalizeSnapshot()`. The "Timestamp" column (format
 * "YYYY-MM-DD HH:mm:ss") gives each row's local-time timestamp — parsed
 * assuming the server process's local timezone, matching how live polls
 * already timestamp readings with `new Date()`.
 */
export async function queryDeviceDataOneDayPaging(
  device: DessDevice,
  date: string, // YYYY-MM-DD
  pagesize = 200
): Promise<Array<{ ts: Date; points: Array<{ title: string; val: string; unit?: string }> }>> {
  const results: Array<{ ts: Date; points: Array<{ title: string; val: string; unit?: string }> }> = [];
  let page = 0;
  for (;;) {
    const q =
      `&action=queryDeviceDataOneDayPaging&pn=${encodeURIComponent(device.pn)}` +
      `&devcode=${encodeURIComponent(device.devcode)}` +
      `&devaddr=${encodeURIComponent(device.devaddr)}` +
      `&sn=${encodeURIComponent(device.sn)}&date=${encodeURIComponent(date)}` +
      `&page=${page}&pagesize=${pagesize}&i18n=en_US`;
    const dat = await authedCall<{
      total: number;
      title: Array<{ title: string; unit?: string }>;
      row: Array<{ field: string[] }>;
    }>(q);

    const titles = dat.title ?? [];
    const timestampIdx = titles.findIndex((t) => t.title === "Timestamp");
    for (const r of dat.row ?? []) {
      const tsStr = timestampIdx >= 0 ? r.field[timestampIdx] : undefined;
      if (!tsStr) continue;
      const ts = new Date(tsStr.replace(" ", "T"));
      if (Number.isNaN(ts.getTime())) continue;
      const points = titles
        .map((t, i) => ({ title: t.title, val: r.field[i], unit: t.unit }))
        .filter((p) => p.val != null && p.title !== "Timestamp");
      results.push({ ts, points });
    }

    const fetched = (page + 1) * pagesize;
    if (!dat.row?.length || fetched >= (dat.total ?? 0)) break;
    page += 1;
  }
  return results;
}

function requireEnv(name: string): string {
  // .trim(): guards against a stray copy-pasted leading/trailing space
  // silently breaking the signature (same class of bug confirmed for Tuya
  // credentials — see lib/tuya/client.ts's requireEnv).
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set. See .env.example.`);
  return v;
}
