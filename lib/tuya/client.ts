import crypto from "crypto";
import { db } from "@/db/client";
import { authTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

// Tuya Cloud (OpenAPI) client implementing the standard Tuya "Calculate the
// signature" scheme (sign_method HMAC-SHA256). Docs:
// https://developer.tuya.com/en/docs/iot/new-singnature?id=Kbw0q34cs2e5g

const ENDPOINT = requireEnvLazy("TUYA_ENDPOINT");
const CLIENT_ID = requireEnvLazy("TUYA_ACCESS_ID");
const CLIENT_SECRET = requireEnvLazy("TUYA_ACCESS_SECRET");

const EMPTY_BODY_HASH = crypto.createHash("sha256").update("").digest("hex");

function hmacSha256Upper(str: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(str, "utf8").digest("hex").toUpperCase();
}

function sign(params: {
  method: string;
  path: string; // includes query string, e.g. "/v1.0/token?grant_type=1"
  body?: string;
  accessToken?: string;
  t: string;
}): string {
  const contentHash = params.body
    ? crypto.createHash("sha256").update(params.body).digest("hex")
    : EMPTY_BODY_HASH;
  const stringToSign = [params.method.toUpperCase(), contentHash, "", params.path].join("\n");
  const prefix = CLIENT_ID() + (params.accessToken ?? "") + params.t;
  return hmacSha256Upper(prefix + stringToSign, CLIENT_SECRET());
}

/** Thrown for a non-success Tuya response, carrying the numeric `code` so callers can react to specific ones. */
export class TuyaApiError extends Error {
  constructor(
    public code: number | undefined,
    msg: string
  ) {
    super(`Tuya API error ${code ?? ""}: ${msg}`);
    this.name = "TuyaApiError";
  }
}

// Token invalid / token expired — worth one automatic re-fetch-and-retry
// rather than surfacing to the caller, since a cached token in our own DB
// can go stale (revoked, rotated credentials, clock drift) independent of
// its stored expiry.
const RETRYABLE_TOKEN_CODES = new Set([1010, 1011]);

async function rawRequest<T>(
  method: string,
  path: string,
  opts: { body?: unknown; accessToken?: string } = {}
): Promise<T> {
  const t = Date.now().toString();
  const bodyStr = opts.body != null ? JSON.stringify(opts.body) : undefined;
  const signature = sign({ method, path, body: bodyStr, accessToken: opts.accessToken, t });

  const headers: Record<string, string> = {
    client_id: CLIENT_ID(),
    sign: signature,
    t,
    sign_method: "HMAC-SHA256",
    "Content-Type": "application/json",
  };
  if (opts.accessToken) headers.access_token = opts.accessToken;

  const res = await fetch(ENDPOINT() + path, {
    method,
    headers,
    body: bodyStr,
  });
  const json = (await res.json()) as { success: boolean; msg?: string; code?: number; result: T };
  if (!json.success) {
    throw new TuyaApiError(json.code, json.msg ?? "unknown error");
  }
  return json.result;
}

interface TuyaTokenResult {
  access_token: string;
  refresh_token: string;
  expire_time: number; // seconds
  uid: string;
}

async function fetchToken(): Promise<TuyaTokenResult> {
  return rawRequest<TuyaTokenResult>("GET", "/v1.0/token?grant_type=1");
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!process.env.DATABASE_URL) {
    return (await fetchToken()).access_token;
  }

  if (!forceRefresh) {
    const cached = await db.query.authTokens.findFirst({ where: eq(authTokens.provider, "tuya") });
    if (cached && cached.expiresAt.getTime() > Date.now() + 60_000) {
      return cached.token;
    }
  }

  const fresh = await fetchToken();
  const expiresAt = new Date(Date.now() + fresh.expire_time * 1000);
  await db
    .insert(authTokens)
    .values({ provider: "tuya", token: fresh.access_token, expiresAt, extra: { refresh_token: fresh.refresh_token } })
    .onConflictDoUpdate({
      target: authTokens.provider,
      set: { token: fresh.access_token, expiresAt, extra: { refresh_token: fresh.refresh_token } },
    });
  return fresh.access_token;
}

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const accessToken = await getAccessToken();
  try {
    return await rawRequest<T>(method, path, { body, accessToken });
  } catch (err) {
    if (err instanceof TuyaApiError && RETRYABLE_TOKEN_CODES.has(err.code ?? -1)) {
      const fresh = await getAccessToken(true); // force a real re-fetch, bypassing the (evidently stale) cache
      return rawRequest<T>(method, path, { body, accessToken: fresh });
    }
    throw err;
  }
}

export interface TuyaDeviceSummary {
  id: string;
  name: string;
  category: string;
  online: boolean;
  icon: string;
  product_id: string;
}

export interface TuyaDeviceStatus {
  code: string;
  value: string | number | boolean;
}

/** Every device linked to the app account (via TUYA_UID). */
export async function listDevices(): Promise<TuyaDeviceSummary[]> {
  const uid = requireEnv("TUYA_UID");
  const dat = await apiRequest<TuyaDeviceSummary[]>("GET", `/v1.0/users/${encodeURIComponent(uid)}/devices`);
  return dat;
}

export async function getDeviceStatus(deviceId: string): Promise<TuyaDeviceStatus[]> {
  return apiRequest<TuyaDeviceStatus[]>("GET", `/v1.0/devices/${encodeURIComponent(deviceId)}/status`);
}

export interface TuyaDeviceLog {
  code: string;
  value: string;
  event_time: number; // ms epoch
}

/**
 * DP value-change history for a device, confirmed live against a real
 * account via `/v2.0/cloud/thing/{id}/report-logs`. Powers both the
 * device-event backfill (switch toggles, etc.) and the `add_ele`
 * cumulative-energy backfill from the same call. Notes confirmed live:
 * - `codes` is required (comma-separated); the endpoint 400s without it.
 * - Query params must be given in ASCII-sorted order in the signed path
 *   (Tuya's signature scheme), hence the param order below.
 * - Pagination cursor param is `last_row_key` (not `start_row_key`, which
 *   is silently ignored and re-returns page 1).
 * - `28841101 No permissions` here means the Cloud project isn't
 *   subscribed to the Device Log Service API — callers should catch this
 *   and degrade gracefully rather than treat it as fatal.
 */
export async function getDeviceLogs(
  deviceId: string,
  codes: string[],
  startMs: number,
  endMs: number,
  maxPages = 50
): Promise<TuyaDeviceLog[]> {
  // Do NOT encodeURIComponent the comma-joined codes: Tuya's server signs
  // against the decoded query string, so an encoded "%2C" here signs
  // correctly on our side but fails verification on theirs (confirmed live
  // — "1004 sign invalid" with encoding, works without it).
  const codesParam = codes.join(",");
  const all: TuyaDeviceLog[] = [];
  let lastRowKey: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const cursor = lastRowKey ? `&last_row_key=${encodeURIComponent(lastRowKey)}` : "";
    const path =
      `/v2.0/cloud/thing/${deviceId}/report-logs?codes=${codesParam}&end_time=${endMs}${cursor}&size=100&start_time=${startMs}`;
    const dat = await apiRequest<{ logs: TuyaDeviceLog[]; has_more: boolean; last_row_key?: string }>("GET", path);
    all.push(...(dat.logs ?? []));
    if (!dat.has_more || !dat.last_row_key || dat.logs?.length === 0) break;
    lastRowKey = dat.last_row_key;
  }
  return all;
}

/** Escape hatch for probing an undocumented/unconfirmed endpoint's raw response shape. */
export async function debugRawRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(method, path, body);
}

export async function sendCommand(
  deviceId: string,
  commands: Array<{ code: string; value: string | number | boolean }>
): Promise<boolean> {
  await apiRequest<unknown>("POST", `/v1.0/devices/${encodeURIComponent(deviceId)}/commands`, { commands });
  return true;
}

function requireEnv(name: string): string {
  // .trim(): a copy-pasted TUYA_UID/TUYA_ACCESS_ID/TUYA_ACCESS_SECRET with a
  // stray leading/trailing space is a real, silently-wrong-signature footgun
  // (confirmed in Tuya's own community threads) — strip it defensively.
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set. See .env.example.`);
  return v;
}

function requireEnvLazy(name: string): () => string {
  return () => requireEnv(name);
}
