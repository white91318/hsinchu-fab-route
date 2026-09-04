/**
 * How our four national-freeway segments are recognised in an upstream feed.
 *
 * Live feeds identify a stretch of freeway by an opaque SectionID, so the only
 * way to tie one to "國道1號（竹北—新竹段）" is to keyword-match the section's
 * human-readable start/end interchange names (see tdx/freeway.ts, which joins
 * the live readings to TDX's static section resource to get those names).
 *
 * Order and exclusions matter: 新竹 is a prefix of 新竹系統, so the plainer
 * segments explicitly exclude the more specific interchange names to stop
 * 新竹 ⇄ 新竹系統 cross-matches.
 */
export type FreewaySegmentId = "N1_NORTH" | "N1_MID" | "N1_SOUTH" | "N3_ZHUNAN";

interface SegmentMatcher {
  /** Section must match a keyword here on one end... */
  fromKeywords: string[];
  /** ...and a keyword here on the other end (either direction is accepted). */
  toKeywords: string[];
  /** Reject a candidate whose combined text contains any of these. */
  excludeIfContains?: string[];
}

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
