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
const AREA_KEYWORDS = ["新竹", "竹北", "竹東", "香山", "寶山", "湖口", "新豐", "竹南", "頭份", "芎林"];
const ROADS_OF_INTEREST = ["台68", "台1線", "台1甲", "台3線", "台15", "台61"];

type Rec = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

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

  const inCorridor = sections.records.filter((rec) => {
    const text = `${str(rec.SectionName)} ${str(rec.RoadSection)} ${str(rec.RoadName)}`;
    return AREA_KEYWORDS.some((k) => text.includes(k));
  });

  const roadTally: Record<string, number> = {};
  for (const rec of sections.records) {
    const name = str(rec.RoadName);
    for (const road of ROADS_OF_INTEREST) {
      if (name.includes(road)) roadTally[road] = (roadTally[road] ?? 0) + 1;
    }
  }

  const samples = inCorridor.slice(0, 60).map((rec) => {
    const l = liveById.get(str(rec.SectionID));
    return {
      sectionId: str(rec.SectionID),
      roadName: str(rec.RoadName),
      sectionName: str(rec.SectionName),
      roadSection: str(rec.RoadSection),
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
      samples,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
