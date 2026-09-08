import { NextResponse } from "next/server";

import { getTdxAccessToken } from "@/lib/live/tdx/auth";
import { readTdxCredentials } from "@/lib/live/tdx/config";
import { unwrapRecords } from "@/lib/live/tdx/freeway";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The follow-up to /api/diagnostics/tdx-city.
 *
 * That probe established that TDX's provincial-highway feed (省道/快速道路)
 * carries live TravelTime and TravelSpeed for ~6,600 sections, and that 台68
 * — the road most Hsinchu Science Park commuters actually use — is among
 * them. "台68 is in there somewhere" is not yet something to build on, so
 * this lists the sections that are in the Hsinchu corridor specifically, with
 * whether each one currently reports a live reading.
 *
 * Public road metadata only, same as the other diagnostics routes.
 */

const BASE = "https://tdx.transportdata.tw/api/basic";
// Section names turned out to be mileage-based (台68線_0K+0~1K+280) with no
// place names in them at all, so an area-keyword filter matched nothing.
// Geography has to come from the road plus its mileage instead.
const ROADS_OF_INTEREST = ["台68", "台1線", "台1甲", "台3線", "台15", "台61"];

type Rec = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
// RoadSection and SectionMile are nested objects ({Start,End}), which String()
// turns into "[object Object]" — useless for reading off a section's extent.
const flat = (v: unknown) => (v && typeof v === "object" ? JSON.stringify(v) : str(v));

async function fetchJson(url: string, token: string): Promise<{ status: number; records: Rec[] }> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return { status: res.status, records: [] };
  return { status: res.status, records: unwrapRecords(await res.json()) as Rec[] };
}

export async function GET() {
  const creds = readTdxCredentials();
  if (!creds) return NextResponse.json({ error: "TDX 憑證未設定" }, { status: 200 });
  const token = await getTdxAccessToken(creds);
  if (!token) return NextResponse.json({ error: "TDX 沒有發 token" }, { status: 200 });

  const sections = await fetchJson(`${BASE}/v2/Road/Traffic/Section/Highway?%24format=JSON`, token);
  // A gap between the two calls: TDX rate-limits harder than its published
  // 50/sec, and two large requests back to back is exactly what triggered the
  // 429s in the city probe.
  await new Promise((r) => setTimeout(r, 2000));
  const live = await fetchJson(`${BASE}/v2/Road/Traffic/Live/Highway?%24format=JSON`, token);

  const liveById = new Map<string, Rec>();
  for (const rec of live.records) liveById.set(str(rec.SectionID), rec);

  const inCorridor = sections.records.filter((rec) =>
    ROADS_OF_INTEREST.some((road) => str(rec.RoadName).includes(road)),
  );
  // 台68 first: it runs 南寮 → 竹東 and nowhere else, so every one of its
  // sections is in this product's corridor by definition — no mileage
  // guesswork needed. The others are nationwide and need their Hsinchu
  // mileage range picked out, which is what SectionMile is here to show.
  inCorridor.sort((a, b) => {
    const rank = (r: Rec) => (str(r.RoadName).includes("台68") ? 0 : 1);
    return rank(a) - rank(b) || str(a.SectionName).localeCompare(str(b.SectionName));
  });

  const roadTally: Record<string, number> = {};
  for (const rec of sections.records) {
    const name = str(rec.RoadName);
    for (const road of ROADS_OF_INTEREST) {
      if (name.includes(road)) roadTally[road] = (roadTally[road] ?? 0) + 1;
    }
  }

  const samples = inCorridor.slice(0, 30).map((rec) => {
    const l = liveById.get(str(rec.SectionID));
    return {
      sectionId: str(rec.SectionID),
      roadName: str(rec.RoadName),
      sectionName: str(rec.SectionName),
      roadSection: flat(rec.RoadSection),
      sectionMile: flat(rec.SectionMile),
      // The whole question: does this section actually report a number right now?
      travelTime: l?.TravelTime ?? null,
      travelSpeed: l?.TravelSpeed ?? null,
      congestionLevel: l?.CongestionLevel ?? null,
      dataCollectTime: l?.DataCollectTime ?? null,
    };
  });

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      sectionsStatus: sections.status,
      liveStatus: live.status,
      totalSections: sections.records.length,
      totalLive: live.records.length,
      corridorSections: inCorridor.length,
      corridorWithLiveReading: inCorridor.filter((rec) => {
        const l = liveById.get(str(rec.SectionID));
        return l != null && l.TravelTime != null;
      }).length,
      sectionsPerRoadOfInterest: roadTally,
      // Every 台68 section joined to nothing in the live feed while 台15 joined
      // fine. Two very different explanations — 台68 has no live coverage, or
      // the live feed keys it under different SectionIDs — and only one of
      // them leaves the road usable. This is what tells them apart.
      tai68: {
        staticSectionIds: sections.records
          .filter((r) => str(r.RoadName).includes("台68"))
          .map((r) => str(r.SectionID)),
        liveSectionIdsMentioning68: live.records
          .map((r) => str(r.SectionID))
          .filter((id) => id.slice(0, 6).includes("68"))
          .slice(0, 20),
        liveCountMentioning68: live.records.filter((r) => str(r.SectionID).slice(0, 6).includes("68"))
          .length,
      },
      samples,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
