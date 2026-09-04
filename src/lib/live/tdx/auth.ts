import { TDX_TOKEN_URL, type TdxCredentials } from "@/lib/live/tdx/config";

const TOKEN_TIMEOUT_MS = 8000;
/** Refresh this far before the token actually expires, so an in-flight request never uses a dead one. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Module-level cache. TDX tokens last a day and TDX explicitly asks callers
 * not to re-fetch one per request; a warm serverless instance reuses this,
 * and a cold one just pays for one extra token call.
 */
let cached: CachedToken | null = null;
/** De-duplicates concurrent refreshes within one instance. */
let inFlight: Promise<string | null> | null = null;

export interface TokenFailure {
  error: string;
  /** HTTP status from the token endpoint, when we got one at all. */
  status?: number;
}

let lastFailure: TokenFailure | null = null;

export function getLastTokenFailure(): TokenFailure | null {
  return lastFailure;
}

/** Test seam: clears the cached token so a test can exercise a fresh fetch. */
export function resetTdxTokenCache(): void {
  cached = null;
  inFlight = null;
  lastFailure = null;
}

async function requestToken(creds: TdxCredentials): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const res = await fetch(TDX_TOKEN_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
      // Never cache the token exchange itself — we do our own caching above,
      // and a shared HTTP cache holding a bearer token would be a leak.
      cache: "no-store",
    });
    if (!res.ok) {
      lastFailure = {
        status: res.status,
        error:
          res.status === 401 || res.status === 400
            ? "TDX 拒絕這組憑證(請檢查 TDX_CLIENT_ID / TDX_CLIENT_SECRET)"
            : `token endpoint returned HTTP ${res.status}`,
      };
      return null;
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      lastFailure = { status: res.status, error: "token response had no access_token" };
      return null;
    }
    const lifetimeMs = (typeof body.expires_in === "number" ? body.expires_in : 86400) * 1000;
    cached = {
      accessToken: body.access_token,
      expiresAt: Date.now() + Math.max(lifetimeMs - EXPIRY_SAFETY_MARGIN_MS, 0),
    };
    lastFailure = null;
    return cached.accessToken;
  } catch (err) {
    lastFailure = { error: err instanceof Error ? err.message : "token request failed" };
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns a usable access token, or null if one can't be obtained. Never
 * throws — callers fall back to the simulated model, and the reason is
 * available via getLastTokenFailure().
 */
export async function getTdxAccessToken(creds: TdxCredentials): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  if (inFlight) return inFlight;

  inFlight = requestToken(creds).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
