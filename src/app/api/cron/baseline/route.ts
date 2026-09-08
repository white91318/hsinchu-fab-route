import { NextResponse } from "next/server";

import { BASELINE_WINDOW_DAYS, computeBaselines } from "@/lib/baseline/compute";
import { ensureSchema, isDatabaseConfigured } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Recomputes the baseline (PRD §9) from whatever the collector has stored.
 *
 * Daily is the right cadence and, unlike the 5-minute collection, it is one
 * Vercel Cron can actually run on the Hobby plan (see vercel.json) — a day of
 * new readings moves a percentile computed over eight weeks by very little,
 * so running it more often would spend compute to change nothing.
 *
 * Safe to run before there is enough data: it will write thin buckets, and
 * `classifyAgainstBaseline` refuses to draw conclusions from them. The
 * response says how many buckets are actually usable, which is the number
 * that decides when M0 is done.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { status: "not-configured", error: "DATABASE_URL 未設定" },
      { status: 200 },
    );
  }

  const url = new URL(request.url);
  const requestedWindow = Number(url.searchParams.get("windowDays"));
  const windowDays =
    Number.isFinite(requestedWindow) && requestedWindow > 0
      ? Math.min(Math.floor(requestedWindow), 365)
      : BASELINE_WINDOW_DAYS;

  try {
    await ensureSchema();
    const result = await computeBaselines(windowDays);
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "baseline computation failed" },
      { status: 500 },
    );
  }
}

// Same as the collector: lets a human trigger a recompute with curl, and lets
// Vercel Cron (which issues GETs) hit it.
export const GET = POST;
