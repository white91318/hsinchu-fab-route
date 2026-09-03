/**
 * Freeway Bureau (交通部高速公路局) live traffic feed — configuration.
 *
 * ============================================================================
 * CONFIRMED UNREACHABLE FROM THIS DEPLOYMENT — see README "即時資料" section
 * ============================================================================
 * Tested live from the production deployment itself (not a sandbox
 * limitation): a probe route hit tisvcloud.freeway.gov.tw and
 * *.hccg.gov.tw from two different Vercel regions (iad1/US-East and
 * hnd1/Tokyo) and got "fetch failed" (connection-level failure, not a 404)
 * every time, from both regions. These domains appear to block cloud/
 * datacenter IP ranges outright, independent of geography.
 *
 * The authoritative source for this exact dataset — confirmed via its
 * official metadata on the national open-data platform
 * (data.nat.gov.tw/dataset/157203, "高速公路發布路段即時路況資料") — is
 * actually TDX (`https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/Freeway`),
 * which requires a free TDX account + API key. There is no way to get this
 * data without one; the URLs below are kept only so the app degrades
 * gracefully (see freewayClient.ts) rather than because they might work.
 *
 * To actually enable this: get a TDX API key (https://tdx.transportdata.tw/),
 * switch freewayClient.ts to call the TDX endpoint above with an OAuth2
 * client-credentials token instead of these tisvcloud URLs.
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
