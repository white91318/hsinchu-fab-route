import { NextResponse } from "next/server";
import { fetchLiveTraffic } from "@/lib/live/aggregate";

// This route always runs (never statically prerendered) so client polling
// gets a fresh aggregation each call — the *upstream* fetches inside
// fetchLiveTraffic are what's cached (see freewayClient.ts/hccgClient.ts),
// which is what actually needs to respect the freeway bureau's "no more
// than one request per 40s" courtesy limit.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchLiveTraffic();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
