import { getLastTokenFailure, getTdxAccessToken } from "@/lib/live/tdx/auth";
import {
  TDX_FREEWAY_SECTION_URL,
  TDX_LIVE_FREEWAY_URL,
  readTdxCredentials,
} from "@/lib/live/tdx/config";
import { FREEWAY_SEGMENT_MATCHERS } from "@/lib/live/freewayConfig";
import type { LiveSegmentReading, SourceHealth } from "@/lib/live/types";

const FETCH_TIMEOUT_MS = 8000;
/** Live readings refresh often; TDX publishes freeway live traffic about once a minute. */
const LIVE_REVALIDATE_S = 60;
/** Section geometry/naming is effectively static — refetch daily at most. */
const SECTION_REVALIDATE_S = 86_400;

/** Keys that may carry the section identifier, most specific first. */
const SECTION_ID_KEYS = ["SectionID", "SectionId", "LinkID", "LinkId"];
/** Keys that may carry travel time in seconds. */
const TRAVEL_TIME_KEYS = ["TravelTime", "TravelTimeSec", "travelTime"];
/** Keys that may carry speed in km/h. */
const SPEED_KEYS = ["TravelSpeed", "SpeedLimit", "SpaceMeanSpeed", "AverageSpeed"];
/** Keys that may carry the reading's own timestamp. */
const TIME_KEYS = ["InfoTime", "UpdateTime", "DataCollectTime", "CollectTime", "SrcUpdateTime"];
/** Keys on a *section metadata* record that may carry human-readable names. */
const SECTION_NAME_KEYS = [
  "SectionName",
  "RoadSection",
  "StartName",
  "EndName",
  "StartICName",
  "EndICName",
  "StartIC",
  "EndIC",
  "RoadName",
];

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstKey(obj: Rec, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function asText(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  // TDX nests some names, e.g. RoadSection: { Start, End } — flatten to text.
  if (isRec(v)) {
    const parts = Object.values(v)
      .map((x) => (typeof x === "string" || typeof x === "number" ? String(x) : null))
      .filter((x): x is string => Boolean(x));
    return parts.length ? parts.join(" ") : undefined;
  }
  return undefined;
}

/**
 * TDX responses may be a bare array or an envelope carrying the array under
 * some key (the exact shape isn't verifiable from here — see config.ts). This
 * accepts either: the payload itself if it's an array, otherwise the longest
 * array-valued property of the object.
 */
export function unwrapRecords(payload: unknown): Rec[] {
  if (Array.isArray(payload)) return payload.filter(isRec);
  if (!isRec(payload)) return [];
  let best: Rec[] = [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      const recs = value.filter(isRec);
      if (recs.length > best.length) best = recs;
    }
  }
  return best;
}

/** All name-ish text on a section record, joined so one keyword scan covers every field. */
export function sectionDescriptiveText(section: Rec): string {
  return SECTION_NAME_KEYS.map((k) => asText(section[k]))
    .filter((v): v is string => Boolean(v))
    .join(" | ");
}

type Matcher = (typeof FREEWAY_SEGMENT_MATCHERS)[keyof typeof FREEWAY_SEGMENT_MATCHERS];

export function matchesSegment(text: string, matcher: Matcher): boolean {
  if (matcher.excludeIfContains?.some((kw) => text.includes(kw))) return false;
  const hasFrom = matcher.fromKeywords.some((kw) => text.includes(kw));
  const hasTo = matcher.toKeywords.some((kw) => text.includes(kw));
  return hasFrom && hasTo;
}

/**
 * `freshness` is either a revalidate window (fine for the user-facing route —
 * many visitors shouldn't mean many TDX calls) or "no-store".
 *
 * The collector must use "no-store". Its entire job is to capture a distinct
 * reading at each interval, and the Data Cache's stale-while-revalidate
 * behaviour can hand a 5-minute poll loop the same cached response over and
 * over: the rows then collide on (section_id, ts), get dropped as duplicates,
 * and the collection quietly runs at the cache's cadence instead of ours.
 */
async function fetchJson(
  url: string,
  token: string,
  freshness: number | "no-store",
): Promise<{ ok: true; payload: unknown } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        // TDX serves gzip/br; undici handles the decoding for us.
        accept: "application/json",
      },
      ...(freshness === "no-store" ? { cache: "no-store" as const } : { next: { revalidate: freshness } }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, payload: await res.json() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps SectionID -> descriptive text, built from the static section resource.
 * Live readings only carry a SectionID, so without this there is nothing to
 * keyword-match our four named segments against.
 */
function buildSectionNameIndex(payload: unknown): Map<string, string> {
  const index = new Map<string, string>();
  for (const section of unwrapRecords(payload)) {
    const id = asText(firstKey(section, SECTION_ID_KEYS));
    if (!id) continue;
    const text = sectionDescriptiveText(section);
    if (text) index.set(id, text);
  }
  return index;
}

export interface TdxFreewayResult {
  readings: LiveSegmentReading[];
  health: SourceHealth;
  /** What the payloads actually looked like — lets us replace guesses with facts. */
  shapeReport?: {
    liveRecordCount: number;
    sectionRecordCount: number;
    sampleLiveKeys: string[];
    sampleSectionKeys: string[];
    matchedSegments: string[];
    /** For an unmatched segment, section texts per individual keyword — debugging breadcrumbs, keyed by segment id then keyword. */
    unmatchedCandidates?: Record<string, Record<string, string[]>>;
  };
}

/**
 * Fetches live freeway travel times from TDX and maps them onto our four
 * national-freeway segments. Never throws: a missing key, an unreachable
 * host, a rejected credential or an unrecognised payload all surface as
 * `health.status === "unavailable"` with a human-readable reason, and the
 * caller falls back to the simulated model.
 */
export async function fetchTdxFreewayReadings(): Promise<TdxFreewayResult> {
  const fetchedAt = new Date().toISOString();
  const creds = readTdxCredentials();

  if (!creds) {
    return {
      readings: [],
      health: {
        status: "not-configured",
        fetchedAt,
        error: "未設定 TDX_CLIENT_ID / TDX_CLIENT_SECRET",
      },
    };
  }

  const token = await getTdxAccessToken(creds);
  if (!token) {
    const failure = getLastTokenFailure();
    return {
      readings: [],
      health: {
        status: "unavailable",
        fetchedAt,
        error: failure?.error ?? "無法取得 TDX access token",
        triedUrls: [TDX_LIVE_FREEWAY_URL],
      },
    };
  }

  const [live, sections] = await Promise.all([
    fetchJson(TDX_LIVE_FREEWAY_URL, token, LIVE_REVALIDATE_S),
    fetchJson(TDX_FREEWAY_SECTION_URL, token, SECTION_REVALIDATE_S),
  ]);

  if (!live.ok) {
    return {
      readings: [],
      health: {
        status: "unavailable",
        fetchedAt,
        error: `即時路況取得失敗:${live.error}`,
        triedUrls: [TDX_LIVE_FREEWAY_URL],
      },
    };
  }

  const liveRecords = unwrapRecords(live.payload);
  const nameIndex = sections.ok ? buildSectionNameIndex(sections.payload) : new Map<string, string>();
  const sectionRecordCount = sections.ok ? unwrapRecords(sections.payload).length : 0;

  const readings: LiveSegmentReading[] = [];
  const matchedSegments: string[] = [];

  for (const segmentId of Object.keys(FREEWAY_SEGMENT_MATCHERS) as Array<
    keyof typeof FREEWAY_SEGMENT_MATCHERS
  >) {
    const matcher = FREEWAY_SEGMENT_MATCHERS[segmentId];

    const hit = liveRecords.find((rec) => {
      const id = asText(firstKey(rec, SECTION_ID_KEYS));
      if (!id) return false;
      // Prefer the section resource's names; fall back to any text the live
      // record itself carries, in case it already embeds section names.
      const text = nameIndex.get(id) ?? sectionDescriptiveText(rec);
      return Boolean(text) && matchesSegment(text, matcher);
    });
    if (!hit) continue;

    const travelTimeSec = Number(firstKey(hit, TRAVEL_TIME_KEYS));
    if (!Number.isFinite(travelTimeSec) || travelTimeSec <= 0) continue;

    const speedRaw = firstKey(hit, SPEED_KEYS);
    const speed = speedRaw === undefined ? undefined : Number(speedRaw);
    const sectionId = asText(firstKey(hit, SECTION_ID_KEYS));

    readings.push({
      segmentId,
      travelTimeMinutes: Math.round((travelTimeSec / 60) * 10) / 10,
      speedKmh: speed !== undefined && Number.isFinite(speed) ? speed : undefined,
      asOf: asText(firstKey(hit, TIME_KEYS)) ?? fetchedAt,
      matchedSection: (sectionId ? nameIndex.get(sectionId) : undefined) ?? sectionId,
    });
    matchedSegments.push(segmentId);
  }

  // For any segment that matched nothing, show a few section texts per
  // individual keyword (not the keywords pooled together) — a generic word
  // like "系統" alone would otherwise flood the sample with unrelated hits
  // from interchanges nationwide and crowd out whether the specific word
  // appears at all. (This is how we found that 新竹系統—竹南 isn't one TDX
  // section but a chain of four — see fetchTdxCorridorSnapshots below, which
  // sidesteps the problem for M0 by recording every hop individually.)
  const unmatchedIds = (
    Object.keys(FREEWAY_SEGMENT_MATCHERS) as Array<keyof typeof FREEWAY_SEGMENT_MATCHERS>
  ).filter((id) => !matchedSegments.includes(id));
  let unmatchedCandidates: Record<string, Record<string, string[]>> | undefined;
  if (unmatchedIds.length > 0) {
    const allTexts = Array.from(new Set(nameIndex.values()));
    unmatchedCandidates = {};
    for (const segmentId of unmatchedIds) {
      const matcher = FREEWAY_SEGMENT_MATCHERS[segmentId];
      const keywords = [...new Set([...matcher.fromKeywords, ...matcher.toKeywords])];
      const perKeyword: Record<string, string[]> = {};
      for (const kw of keywords) {
        perKeyword[kw] = allTexts
          .filter((text) => text.includes(kw))
          .slice(0, 5)
          .map((text) => text.slice(0, 120));
      }
      unmatchedCandidates[segmentId] = perKeyword;
    }
  }

  const shapeReport = {
    liveRecordCount: liveRecords.length,
    sectionRecordCount,
    sampleLiveKeys: liveRecords[0] ? Object.keys(liveRecords[0]) : [],
    sampleSectionKeys: sections.ok ? Object.keys(unwrapRecords(sections.payload)[0] ?? {}) : [],
    matchedSegments,
    unmatchedCandidates,
  };

  // Reaching TDX but recognising nothing is a failure worth naming, not a
  // silent zero — it means the payload shape differs from what we parse.
  if (readings.length === 0) {
    return {
      readings: [],
      health: {
        status: "unavailable",
        fetchedAt,
        error:
          liveRecords.length === 0
            ? "TDX 回應中找不到路段陣列(格式與預期不符)"
            : `讀到 ${liveRecords.length} 筆路段,但沒有一筆對應到本站的 4 個國道路段`,
        triedUrls: [TDX_LIVE_FREEWAY_URL, TDX_FREEWAY_SECTION_URL],
      },
      shapeReport,
    };
  }

  return {
    readings,
    health: { status: "ok", fetchedAt, url: TDX_LIVE_FREEWAY_URL },
    shapeReport,
  };
}

/**
 * Broad keyword net for the whole Hsinchu commuter corridor (the road list in
 * PRD §7.4, plus the interchange names found while mapping national-freeway
 * coverage — see the N3_ZHUNAN unmatchedCandidates work above). Wider than
 * FREEWAY_SEGMENT_MATCHERS on purpose.
 */
const CORRIDOR_KEYWORDS = ["新竹", "竹北", "湖口", "頭份", "竹南", "茄苳", "香山", "西濱", "大山", "新豐"];

export interface CorridorSnapshot {
  sectionId: string;
  sectionName: string;
  travelTimeMinutes: number;
  speedKmh?: number;
  /** Upstream-reported timestamp for this reading, as TDX sent it. */
  asOf: string;
}

export interface CorridorFetchResult {
  snapshots: CorridorSnapshot[];
  health: SourceHealth;
}

/**
 * Fetches every national-freeway section in the Hsinchu commuter corridor —
 * not just the four named segments this app displays. M0 (PRD §12, §14)
 * needs raw per-section snapshots to build real baselines from; deciding how
 * sections chain into a display-level "路段" (see the N3_ZHUNAN saga above,
 * where 新竹系統—竹南 turned out to be four separate TDX sections) is a
 * display-layer question to answer later over the accumulated data — not one
 * to guess at collection time. Recording every hop individually here means
 * that decision never blocks collection.
 */
export async function fetchTdxCorridorSnapshots(): Promise<CorridorFetchResult> {
  const fetchedAt = new Date().toISOString();
  const creds = readTdxCredentials();

  if (!creds) {
    return {
      snapshots: [],
      health: { status: "not-configured", fetchedAt, error: "未設定 TDX_CLIENT_ID / TDX_CLIENT_SECRET" },
    };
  }

  const token = await getTdxAccessToken(creds);
  if (!token) {
    const failure = getLastTokenFailure();
    return {
      snapshots: [],
      health: {
        status: "unavailable",
        fetchedAt,
        error: failure?.error ?? "無法取得 TDX access token",
        triedUrls: [TDX_LIVE_FREEWAY_URL],
      },
    };
  }

  const [live, sections] = await Promise.all([
    // "no-store", unlike the user-facing route above: a collector that reads
    // a cached response stores a duplicate of what it already has, and the
    // baseline ends up sampled at the cache's cadence rather than ours.
    fetchJson(TDX_LIVE_FREEWAY_URL, token, "no-store"),
    // Section names really are static, so this one stays cached.
    fetchJson(TDX_FREEWAY_SECTION_URL, token, SECTION_REVALIDATE_S),
  ]);

  if (!live.ok) {
    return {
      snapshots: [],
      health: {
        status: "unavailable",
        fetchedAt,
        error: `即時路況取得失敗:${live.error}`,
        triedUrls: [TDX_LIVE_FREEWAY_URL],
      },
    };
  }

  const liveRecords = unwrapRecords(live.payload);
  const nameIndex = sections.ok ? buildSectionNameIndex(sections.payload) : new Map<string, string>();

  const snapshots: CorridorSnapshot[] = [];
  for (const rec of liveRecords) {
    const sectionId = asText(firstKey(rec, SECTION_ID_KEYS));
    if (!sectionId) continue;
    const text = nameIndex.get(sectionId) ?? sectionDescriptiveText(rec);
    if (!text || !CORRIDOR_KEYWORDS.some((kw) => text.includes(kw))) continue;

    const travelTimeSec = Number(firstKey(rec, TRAVEL_TIME_KEYS));
    if (!Number.isFinite(travelTimeSec) || travelTimeSec <= 0) continue;

    const speedRaw = firstKey(rec, SPEED_KEYS);
    const speed = speedRaw === undefined ? undefined : Number(speedRaw);

    snapshots.push({
      sectionId,
      sectionName: text,
      travelTimeMinutes: Math.round((travelTimeSec / 60) * 10) / 10,
      speedKmh: speed !== undefined && Number.isFinite(speed) ? speed : undefined,
      asOf: asText(firstKey(rec, TIME_KEYS)) ?? fetchedAt,
    });
  }

  if (snapshots.length === 0) {
    return {
      snapshots: [],
      health: {
        status: "unavailable",
        fetchedAt,
        error:
          liveRecords.length === 0
            ? "TDX 回應中找不到路段陣列(格式與預期不符)"
            : `讀到 ${liveRecords.length} 筆路段,但沒有一筆落在竹科通勤走廊關鍵字內`,
        triedUrls: [TDX_LIVE_FREEWAY_URL, TDX_FREEWAY_SECTION_URL],
      },
    };
  }

  return {
    snapshots,
    health: { status: "ok", fetchedAt, url: TDX_LIVE_FREEWAY_URL },
  };
}
