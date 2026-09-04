/**
 * TDX (運輸資料流通服務平臺) — endpoints and credentials.
 *
 * WHAT IS CONFIRMED (from TDX's own sample code and API listing):
 * - Token endpoint, grant type and parameter names below are exactly as
 *   documented in github.com/tdxmotc/SampleCode.
 * - Access tokens are sent as `Authorization: Bearer <token>` and are valid
 *   for 86400s; TDX explicitly asks callers to cache rather than re-fetch
 *   per request (see auth.ts).
 * - The freeway live-traffic resource is
 *   `/api/basic/v2/Road/Traffic/Live/Freeway`, returning per-section
 *   `SectionID`, `TravelTime` (seconds) and `TravelSpeed` (km/h).
 * - An API key is free: register a TDX account, then create a key in the
 *   member centre (up to 3). Registered callers get 50 requests/sec per
 *   source IP; unregistered anonymous use is capped at 50/day.
 *
 * WHAT IS NOT CONFIRMED (TDX's Swagger is unreachable from this sandbox —
 * every *.tw domain is blocked by the egress policy here):
 * - Whether the payload is a bare JSON array or wrapped in an envelope
 *   (e.g. `{ UpdateTime, LiveTraffics: [...] }`).
 * - The exact key names carrying the section's human-readable start/end
 *   interchange names in the section-metadata resource.
 * Both are therefore handled defensively in freeway.ts: the parser accepts
 * either shape and tries several plausible key names, and reports what it
 * actually saw through /api/live-traffic so the guesses can be replaced
 * with facts after one deployment. Nothing here fabricates a reading — an
 * unrecognised payload yields zero readings and an explicit health error.
 */

export const TDX_TOKEN_URL =
  "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";

export const TDX_LIVE_FREEWAY_URL =
  "https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/Freeway?%24format=JSON";

/** Static section metadata: maps SectionID to the interchange names we match on. */
export const TDX_FREEWAY_SECTION_URL =
  "https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Section/Freeway?%24format=JSON";

export interface TdxCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Credentials come from the environment, never from the bundle — these are
 * server-only (the API route is the only caller) and must not be prefixed
 * with NEXT_PUBLIC_, which would ship the secret to every visitor.
 */
export function readTdxCredentials(): TdxCredentials | null {
  const clientId = process.env.TDX_CLIENT_ID?.trim();
  const clientSecret = process.env.TDX_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
