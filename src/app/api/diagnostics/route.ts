import { NextResponse } from "next/server";
import { fetchLiveTrafficWithDiagnostics } from "@/lib/live/aggregate";
import { CONSTRUCTION_LIST_URL } from "@/lib/live/constructionClient";
import { TDX_TOKEN_URL, readTdxCredentials } from "@/lib/live/tdx/config";

export const dynamic = "force-dynamic";

/**
 * Reachability + payload-shape probe.
 *
 * Neither TDX nor the Hsinchu public works site can be reached from the dev
 * sandbox (its egress policy blocks every *.tw domain), and the previous
 * generation of sources turned out to be blocked from Vercel's network too.
 * So rather than guess, this endpoint reports what the deployment itself can
 * actually see: whether each host answers at all, and what the payloads look
 * like. It returns no secrets — only whether credentials are present.
 */
async function probeHost(url: string, init?: RequestInit) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    return {
      reachable: true,
      httpStatus: res.status,
      ms: Date.now() - started,
      contentType: res.headers.get("content-type"),
      bodyLength: text.length,
      bodyHead: text.slice(0, 400),
    };
  } catch (err) {
    return {
      reachable: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const creds = readTdxCredentials();

  const [tokenProbe, constructionProbe, live] = await Promise.all([
    // Deliberately unauthenticated: a 400/401 still proves the host answers,
    // which is the thing we cannot determine from the sandbox.
    probeHost(TDX_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    }),
    probeHost(CONSTRUCTION_LIST_URL, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; hsinchu-fab-route/0.1; +https://github.com/white91318/hsinchu-fab-route)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-TW,zh;q=0.9",
      },
    }),
    fetchLiveTrafficWithDiagnostics(),
  ]);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      region: process.env.VERCEL_REGION ?? "unknown",
      tdx: {
        credentialsConfigured: Boolean(creds),
        tokenEndpointProbe: tokenProbe,
        health: live.freeway.health,
        shapeReport: live.freeway.shapeReport ?? null,
      },
      construction: {
        listPageProbe: constructionProbe,
        status: live.construction.status,
        error: live.construction.error ?? null,
        todayCount: live.construction.todayCount,
        probe: live.construction.probe ?? null,
        firstNotices: live.construction.notices.slice(0, 5),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
