import { FREEWAY_SEGMENT_MATCHERS } from "@/lib/live/freewayConfig";
import { LEVEL_LABEL, levelVar } from "@/lib/traffic/model";
import type { SegmentId, SegmentStatus } from "@/lib/traffic/types";

interface InfoPanelProps {
  activeSeg: SegmentId | null;
  statuses: Record<SegmentId, SegmentStatus>;
}

/** Only these four national-freeway segments have a live source at all — every other road is always modeled. */
const LIVE_CAPABLE_IDS = new Set<SegmentId>(Object.keys(FREEWAY_SEGMENT_MATCHERS));

/**
 * "模擬推估" alone doesn't say why: a surface street inside the park never has
 * a live source to begin with, while a national-freeway segment normally does
 * but TDX didn't answer this time. Those are different situations for the
 * user to reason about, so the label spells out which one it is.
 */
function sourceLabel(id: SegmentId, s: SegmentStatus): string {
  if (s.source === "live") {
    const time = s.asOf ? new Date(s.asOf) : null;
    const timeText =
      time && !Number.isNaN(time.getTime())
        ? `，更新於 ${time.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`
        : "";
    return `即時資料${timeText}`;
  }
  if (LIVE_CAPABLE_IDS.has(id)) {
    return "模擬推估（國道路段，目前抓不到即時路況，暫以時段模型計算）";
  }
  return "模擬推估（依時段與日夜班規律計算，此路段沒有即時感測來源）";
}

export function InfoPanel({ activeSeg, statuses }: InfoPanelProps) {
  if (!activeSeg) {
    return <div className="info-panel">點選地圖上的路段線條，或下面的路段標籤，看目前路況細節。</div>;
  }

  const s = statuses[activeSeg];
  return (
    <div className="info-panel">
      <span className="sw" style={{ background: levelVar(s.level) }} />
      <span>
        <b>{s.name}</b> — {LEVEL_LABEL[s.level]}，約 {s.minutes} 分鐘（基準 {s.base} 分）。{s.reason}。
        <span className="source-tag"> · {sourceLabel(activeSeg, s)}</span>
      </span>
    </div>
  );
}
