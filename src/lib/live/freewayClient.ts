import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { FREEWAY_LIVE_URL_CANDIDATES, FREEWAY_SEGMENT_MATCHERS } from "@/lib/live/freewayConfig";
import type { LiveSegmentReading, SourceHealth } from "@/lib/live/types";

const FETCH_TIMEOUT_MS = 8000;

// Candidate key names for each field, checked case-sensitively in this order —
// the exact casing used by tisvcloud's feed is one of the unverified details
// (see freewayConfig.ts).
const SECTION_ID_KEYS = ["SectionID", "SectionId", "LinkID", "LinkId"];
const TRAVEL_TIME_KEYS = ["TravelTime", "TravelTimeSec", "travelTime"];
const SPEED_KEYS = ["TravelSpeed", "SpaceMeanSpeed", "AverageSpeed"];
const TIME_KEYS = ["DataCollectTime", "UpdateTime", "CollectTime", "DateTime"];
const NAME_KEYS = ["SectionName", "StartIC", "EndIC", "StartName", "EndName", "RoadName", "SubAuthorityCode"];

interface RawRecord {
  obj: Record<string, unknown>;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function firstKey(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Recursively scans a parsed XML object tree for records that look like a live section reading. */
function collectLiveRecords(node: unknown, out: RawRecord[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectLiveRecords(n, out));
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const hasSectionId = firstKey(obj, SECTION_ID_KEYS) !== undefined;
    const hasTravelTime = firstKey(obj, TRAVEL_TIME_KEYS) !== undefined;
    if (hasSectionId && hasTravelTime) {
      out.push({ obj });
    }
    Object.values(obj).forEach((v) => collectLiveRecords(v, out));
  }
}

/** Concatenates every likely descriptive text field so keyword matching can search all of them at once. */
function descriptiveText(obj: Record<string, unknown>): string {
  return NAME_KEYS.map((k) => asString(obj[k]))
    .filter((v): v is string => Boolean(v))
    .join(" | ");
}

function matchesSegment(text: string, matcher: (typeof FREEWAY_SEGMENT_MATCHERS)[keyof typeof FREEWAY_SEGMENT_MATCHERS]): boolean {
  if (matcher.excludeIfContains?.some((kw) => text.includes(kw))) return false;
  const hasFrom = matcher.fromKeywords.some((kw) => text.includes(kw));
  const hasTo = matcher.toKeywords.some((kw) => text.includes(kw));
  return hasFrom && hasTo;
}

async function fetchAndDecompress(
  urls: string[],
): Promise<{ xml: string; url: string } | { triedUrls: string[]; error: string }> {
  const triedUrls: string[] = [];
  for (const url of urls) {
    triedUrls.push(url);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "hsinchu-fab-route/0.1 (POC; +https://github.com/white91318/hsinchu-fab-route)" },
        // Next.js data cache: reuse this upstream response for 2 minutes so
        // client polling doesn't hammer the freeway bureau faster than its
        // "no more than one request per 40s" courtesy limit.
        next: { revalidate: 120 },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const looksGzipped = url.endsWith(".gz") || (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b);
      const xml = (looksGzipped ? gunzipSync(buf) : buf).toString("utf-8");
      if (!xml.trim().startsWith("<")) continue;
      return { xml, url };
    } catch {
      continue;
    }
  }
  return { triedUrls, error: "no candidate URL returned a parseable XML response" };
}

/**
 * Fetches the freeway bureau's live section travel-time feed and maps it onto
 * our national-freeway segments (N1_NORTH/N1_MID/N1_SOUTH/N3_ZHUNAN). Never
 * throws — any failure surfaces as `SourceHealth.status === "unavailable"`
 * and callers should fall back to the simulated model.
 */
export async function fetchFreewayLiveReadings(): Promise<{
  readings: LiveSegmentReading[];
  health: SourceHealth;
}> {
  const fetchedAt = new Date().toISOString();
  const result = await fetchAndDecompress(FREEWAY_LIVE_URL_CANDIDATES);

  if ("error" in result) {
    return {
      readings: [],
      health: { status: "unavailable", fetchedAt, error: result.error, triedUrls: result.triedUrls },
    };
  }

  try {
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(result.xml);
    const raw: RawRecord[] = [];
    collectLiveRecords(parsed, raw);

    const readings: LiveSegmentReading[] = [];
    (Object.keys(FREEWAY_SEGMENT_MATCHERS) as Array<keyof typeof FREEWAY_SEGMENT_MATCHERS>).forEach((segmentId) => {
      const matcher = FREEWAY_SEGMENT_MATCHERS[segmentId];
      const hit = raw.find((r) => matchesSegment(descriptiveText(r.obj), matcher));
      if (!hit) return;

      const travelTimeSec = Number(firstKey(hit.obj, TRAVEL_TIME_KEYS));
      if (!Number.isFinite(travelTimeSec) || travelTimeSec <= 0) return;
      const speedRaw = firstKey(hit.obj, SPEED_KEYS);
      const asOf = asString(firstKey(hit.obj, TIME_KEYS)) ?? fetchedAt;

      readings.push({
        segmentId,
        travelTimeMinutes: Math.round((travelTimeSec / 60) * 10) / 10,
        speedKmh: speedRaw !== undefined ? Number(speedRaw) : undefined,
        asOf,
        matchedSection: descriptiveText(hit.obj) || asString(firstKey(hit.obj, SECTION_ID_KEYS)),
      });
    });

    return { readings, health: { status: "ok", fetchedAt, url: result.url } };
  } catch (err) {
    return {
      readings: [],
      health: {
        status: "unavailable",
        fetchedAt,
        error: err instanceof Error ? err.message : "XML parse failed",
        triedUrls: [result.url],
      },
    };
  }
}
