/**
 * Freeway Bureau (交通部高速公路局) live traffic feed — configuration.
 *
 * ============================================================================
 * UNVERIFIED — READ BEFORE RELYING ON THIS IN PRODUCTION
 * ============================================================================
 * The sandbox this integration was written in has its network egress blocked
 * for tisvcloud.freeway.gov.tw, so none of the URLs below have been hit
 * successfully. What IS confirmed (via public documentation / third-party
 * write-ups, not a live call):
 *   - The feed requires no API key/auth, and is free to poll (min. 40s
 *     between requests to be a good citizen).
 *   - It follows MOTC's "即時路況資料標準 v2.0/2.1" — live records carry
 *     `SectionID`, `TravelTime` (seconds) and `TravelSpeed` (km/h).
 *   - Live (current) files sit at the site root; historical snapshots are
 *     archived under `/history/...`. A root-level file `cctv_value.xml.gz`
 *     is confirmed to exist, which is the basis for guessing the section
 *     travel-time file follows the same `..._value.xml.gz` convention below.
 * What is a GUESS: the exact filename for the live section/travel-time feed.
 *
 * Before trusting this in production: open https://tisvcloud.freeway.gov.tw/
 * in a browser from a network that can reach it, find the actual live
 * section/travel-time filename, and update FREEWAY_LIVE_URL_CANDIDATES
 * below (put the confirmed one first).
 * ============================================================================
 */
export const FREEWAY_LIVE_URL_CANDIDATES = [
  "https://tisvcloud.freeway.gov.tw/section_value.xml.gz",
  "https://tisvcloud.freeway.gov.tw/livetraffic_value.xml.gz",
  "https://tisvcloud.freeway.gov.tw/LiveTraffic.xml.gz",
];

export type FreewaySegmentId = "N1_NORTH" | "N1_MID" | "N1_SOUTH" | "N3_ZHUNAN";

interface SegmentMatcher {
  /** Segment must match a keyword here on one end of the section... */
  fromKeywords: string[];
  /** ...and a keyword here on the other end (either direction is accepted). */
  toKeywords: string[];
  /** Reject a candidate whose combined text contains any of these (disambiguation). */
  excludeIfContains?: string[];
}

/**
 * Maps our 4 national-freeway segments to the interchange names likely to
 * appear in the upstream section's descriptive fields. Order matters: more
 * specific keywords (e.g. "新竹系統") are listed so they're checked as whole
 * substrings distinct from the plainer "新竹", with excludeIfContains guarding
 * against 新竹⇄新竹系統 cross-matches.
 */
export const FREEWAY_SEGMENT_MATCHERS: Record<FreewaySegmentId, SegmentMatcher> = {
  N1_NORTH: {
    fromKeywords: ["湖口"],
    toKeywords: ["竹北", "新竹系統", "新竹"],
  },
  N1_MID: {
    fromKeywords: ["竹北"],
    toKeywords: ["新竹"],
    excludeIfContains: ["新竹系統", "湖口"],
  },
  N1_SOUTH: {
    fromKeywords: ["新竹"],
    toKeywords: ["新竹系統", "系統"],
    excludeIfContains: ["竹北", "湖口"],
  },
  N3_ZHUNAN: {
    fromKeywords: ["新竹系統", "系統"],
    toKeywords: ["竹南"],
  },
};
