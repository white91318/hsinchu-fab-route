import { NextResponse } from "next/server";

import { probeTdxCityResources } from "@/lib/live/tdx/cityProbe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Answers "does TDX have anything for 新竹市的市區道路, or only freeways?"
 * against the live API rather than against documentation.
 *
 * Unauthenticated for the same reason as the other diagnostics routes: the
 * response is public road metadata plus HTTP status codes. It reports whether
 * credentials are configured, never their values.
 */
export async function GET() {
  const report = await probeTdxCityResources();
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
