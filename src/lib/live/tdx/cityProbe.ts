import { getTdxAccessToken } from "@/lib/live/tdx/auth";
import { readTdxCredentials } from "@/lib/live/tdx/config";
import { unwrapRecords } from "@/lib/live/tdx/freeway";

/**
 * Asks TDX, once, which of its non-freeway resources actually carry data for
 * Hsinchu — and whether the roads this product is about (光復路, 關新路,
 * 介壽路, 慈雲路…) appear in them at all.
 *
 * This exists because the question cannot be answered from documentation.
 * TDX publishes a per-city road-traffic family (VD 車輛偵測器, CCTV, 路段),
 * but coverage is decided by each city government, and "the API exists" says
 * nothing about whether 新竹市 feeds it or where its detectors sit. Guessing
 * wrong here would mean building M1 on roads we have no data for — so the
 * probe reports exactly what came back, including the endpoints that 404.
 *
 * Everything returned is public road metadata. No credential value is
 * reported, only whether one was configured.
 */

const BASE = "https://tdx.transportdata.tw/api/basic";
const PROBE_TIMEOUT_MS = 12_000;

/** The roads the product actually models — the whole point of the probe. */
const TARGET_ROADS = [
  "光復路",
  "關新路",
  "介壽路",
  "慈雲路",
  "園區二路",
  "篤行",
  "公道五",
  "經國路",
  "中華路",
  "食品路",
  "埔頂",
  "台68",
  "68號",
];

interface Candidate {
  name: string;
  path: string;
  /** What this resource would give us if it has data — recorded so a hit is immediately actionable. */
  yields: string;
}

/**
 * Deliberately includes paths that may not exist. A 404 is a real answer to
 * "does TDX offer this", and costs one request to establish; the alternative
 * is carrying an assumption forward untested.
 */
const CANDIDATES: Candidate[] = [
  { name: "市區 VD(靜態,新竹市)", path: "/v2/Road/Traffic/VD/City/Hsinchu", yields: "偵測器位置與所在道路" },
  { name: "市區 VD(即時,新竹市)", path: "/v2/Road/Traffic/Live/VD/City/Hsinchu", yields: "每 5 分鐘的車速/流量/佔有率" },
  { name: "市區 VD(靜態,新竹縣)", path: "/v2/Road/Traffic/VD/City/HsinchuCounty", yields: "偵測器位置與所在道路" },
  { name: "市區 VD(即時,新竹縣)", path: "/v2/Road/Traffic/Live/VD/City/HsinchuCounty", yields: "每 5 分鐘的車速/流量/佔有率" },
  { name: "市區路段(靜態,新竹市)", path: "/v2/Road/Traffic/Section/City/Hsinchu", yields: "路段定義(可算旅行時間)" },
  { name: "市區路段(即時,新竹市)", path: "/v2/Road/Traffic/Live/Section/City/Hsinchu", yields: "路段旅行時間(最理想)" },
  { name: "市區 CCTV(新竹市)", path: "/v2/Road/Traffic/CCTV/City/Hsinchu", yields: "影像,不能直接算時間;當作 City 路徑可用的對照組" },
  { name: "省道/快速道路(即時)", path: "/v2/Road/Traffic/Live/Highway", yields: "台1/台68 之類的即時路況" },
  { name: "省道/快速道路(路段)", path: "/v2/Road/Traffic/Section/Highway", yields: "省道路段定義" },
];

/** Keys that plausibly carry a human-readable road name across these resources. */
const ROAD_NAME_KEYS = [
  "RoadName",
  "RoadSection",
  "SectionName",
  "LocationDescription",
  "SubAuthorityCode",
  "RoadID",
  "VDID",
  "SurveillanceDescription",
];

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .filter((v) => typeof v === "string")
      .join(" ");
  }
  return "";
}

function roadNamesFrom(records: Array<Record<string, unknown>>): string[] {
  const names = new Set<string>();
  for (const rec of records) {
    for (const key of ROAD_NAME_KEYS) {
      const text = textOf(rec[key]).trim();
      if (text) names.add(text);
    }
  }
  return [...names];
}

export interface ProbeResult {
  name: string;
  path: string;
  yields: string;
  status: number | "error";
  /** Records the parser could see in the response. */
  records: number;
  /** Which of the roads this product models actually appear. */
  matchedRoads: string[];
  /** A sample of distinct road/location names, so an empty match set can be judged. */
  sampleRoadNames: string[];
  /** Keys present on the first record — tells us what a follow-up integration would have to read. */
  firstRecordKeys: string[];
  error?: string;
}

export interface CityProbeReport {
  credentialsConfigured: boolean;
  tokenObtained: boolean;
  probedAt: string;
  results: ProbeResult[];
  error?: string;
}

async function probe(candidate: Candidate, token: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const base: ProbeResult = {
    name: candidate.name,
    path: candidate.path,
    yields: candidate.yields,
    status: "error",
    records: 0,
    matchedRoads: [],
    sampleRoadNames: [],
    firstRecordKeys: [],
  };
  try {
    const res = await fetch(`${BASE}${candidate.path}?%24format=JSON`, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ...base, status: res.status, error: res.status === 404 ? "這個資源不存在" : `HTTP ${res.status}` };
    }
    const payload = await res.json();
    const records = unwrapRecords(payload) as Array<Record<string, unknown>>;
    const names = roadNamesFrom(records);
    const haystack = names.join(" ");
    return {
      ...base,
      status: res.status,
      records: records.length,
      matchedRoads: TARGET_ROADS.filter((road) => haystack.includes(road)),
      sampleRoadNames: names.slice(0, 40),
      firstRecordKeys: records[0] ? Object.keys(records[0]) : [],
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : "probe failed" };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeTdxCityResources(): Promise<CityProbeReport> {
  const probedAt = new Date().toISOString();
  const creds = readTdxCredentials();
  if (!creds) {
    return { credentialsConfigured: false, tokenObtained: false, probedAt, results: [] };
  }
  const token = await getTdxAccessToken(creds);
  if (!token) {
    return {
      credentialsConfigured: true,
      tokenObtained: false,
      probedAt,
      results: [],
      error: "TDX 沒有發 token,先看 /api/diagnostics",
    };
  }

  // Sequential: TDX allows 50 req/s so parallel would be fine for rate, but
  // some of these responses are large and a serverless instance has a small
  // memory ceiling — nine of them decoded at once is the kind of thing that
  // fails only in production.
  const results: ProbeResult[] = [];
  for (const candidate of CANDIDATES) {
    results.push(await probe(candidate, token));
  }
  return { credentialsConfigured: true, tokenObtained: true, probedAt, results };
}
