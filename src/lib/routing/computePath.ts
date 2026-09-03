import type {
  AdjacencyEntry,
  ComputedPath,
  DisplaySegment,
  SegmentId,
  SegmentStatus,
} from "@/lib/traffic/types";

const LEVEL_RANK = { good: 0, warning: 1, critical: 2 };

/**
 * Evaluates one candidate path against a precomputed segment→status map.
 * Consecutive edges on the same named road (e.g. 力行一路 → 力行二路 →
 * 力行六路, all "力行路") are merged into a single display leg with summed
 * minutes (PRD §6.1, §5.1 AC).
 */
export function computePath(
  path: AdjacencyEntry[],
  statuses: Record<SegmentId, SegmentStatus>,
): ComputedPath {
  const segs: SegmentStatus[] = path.map((e) => statuses[e.seg]);
  const total = Math.round(segs.reduce((s, x) => s + x.minutes, 0));
  const worst = segs.reduce(
    (a, b) => ((b.minutes - b.base) > (a.minutes - a.base) ? b : a),
    segs[0],
  );

  const display: DisplaySegment[] = [];
  segs.forEach((s) => {
    const last = display[display.length - 1];
    if (last && last.id === s.id) {
      last.minutes = Math.round((last.minutes + s.minutes) * 10) / 10;
      if (LEVEL_RANK[s.level] > LEVEL_RANK[last.level]) {
        last.level = s.level;
        last.reason = s.reason;
      }
    } else {
      display.push({ id: s.id, name: s.name, level: s.level, reason: s.reason, minutes: s.minutes, base: s.base });
    }
  });

  return { segs, display, total, worst, edgeIds: path.map((e) => e.id) };
}

export function pathLabel(r: ComputedPath): string {
  return r.display.map((s) => s.name.replace(/（.*?）/, "")).join(" → ");
}
