import { NextResponse } from "next/server";
import {
  ensureSchema,
  insertSnapshots,
  isDatabaseConfigured,
  recordCollectionRun,
} from "@/lib/db/client";
import { fetchTdxCorridorSnapshots } from "@/lib/live/tdx/freeway";

// Cron-triggered, not user-triggered — always run fresh, and never let this
// route get cached the way a normal page might.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * M0 data collection (PRD §12, §14): called every ~5 minutes by an external
 * scheduler (see .github/workflows/collect-traffic.yml — Vercel Cron itself
 * is daily-only on the Hobby plan this project is on) to snapshot the
 * Hsinchu commuter corridor's national-freeway sections into a time series.
 * Nothing reads this data yet; it exists purely to accumulate the ≥4 weeks
 * PRD §14 (M0) calls for before a real baseline can be computed.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    // Distinct from a runtime failure: the collector is wired up but has
    // nowhere to write yet. Same "not-configured vs unavailable" contract
    // as everywhere else this app talks to an external source.
    return NextResponse.json(
      { status: "not-configured", error: "DATABASE_URL 未設定" },
      { status: 200 },
    );
  }

  const result = await fetchTdxCorridorSnapshots();
  if (result.health.status !== "ok") {
    return NextResponse.json({ status: result.health.status, health: result.health }, { status: 200 });
  }

  try {
    await ensureSchema();
    const { inserted, duplicates } = await insertSnapshots(
      result.snapshots.map((s) => ({
        sectionId: s.sectionId,
        sectionName: s.sectionName,
        source: "tdx-freeway",
        travelMinutes: s.travelTimeMinutes,
        speedKmh: s.speedKmh,
        ts: s.asOf,
      })),
    );
    await recordCollectionRun({
      source: "tdx-freeway",
      fetched: result.snapshots.length,
      inserted,
      duplicates,
    });

    return NextResponse.json({
      status: "ok",
      fetched: result.snapshots.length,
      inserted,
      // All-duplicates means TDX hadn't refreshed since the last run — worth
      // seeing, because a run that stores nothing is otherwise
      // indistinguishable from a broken collector.
      duplicates,
      fetchedAt: result.health.fetchedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "database write failed" },
      { status: 500 },
    );
  }
}

// Lets a human (or `vercel crons run`) trigger a collection run from a browser/curl GET too.
export const GET = POST;
