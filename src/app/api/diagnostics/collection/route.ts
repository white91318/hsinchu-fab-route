import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { readCollectionHealth } from "@/lib/db/collectionHealth";

export const dynamic = "force-dynamic";

/**
 * What the M0 collector has actually gathered so far (PRD §14, M0).
 *
 * Unauthenticated on purpose, matching /api/diagnostics: everything here is
 * aggregate statistics over public road data — no credentials, no user data,
 * nothing that isn't already published by TDX. Requiring a secret would mean
 * nobody could check on the collection without one to hand, which is exactly
 * the friction that lets a silently-dead collector go unnoticed.
 */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { status: "not-configured", error: "DATABASE_URL 未設定" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const health = await readCollectionHealth();
    return NextResponse.json(
      { status: "ok", checkedAt: new Date().toISOString(), ...health },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // A missing table is the expected state before the first collection, and
    // is worth saying plainly rather than as a 500 that looks like a bug.
    const message = err instanceof Error ? err.message : "query failed";
    const notCollectedYet = /relation .*traffic_snapshot.* does not exist/i.test(message);
    return NextResponse.json(
      {
        status: notCollectedYet ? "no-data-yet" : "error",
        error: notCollectedYet ? "traffic_snapshot 還不存在——收集器尚未成功寫入過" : message,
      },
      { status: notCollectedYet ? 200 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
