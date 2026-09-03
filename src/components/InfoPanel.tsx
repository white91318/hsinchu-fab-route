import { LEVEL_LABEL, levelVar } from "@/lib/traffic/model";
import type { SegmentId, SegmentStatus } from "@/lib/traffic/types";

interface InfoPanelProps {
  activeSeg: SegmentId | null;
  statuses: Record<SegmentId, SegmentStatus>;
}

function sourceLabel(s: SegmentStatus): string {
  if (s.source !== "live") return "模擬推估";
  const time = s.asOf ? new Date(s.asOf) : null;
  const timeText = time && !Number.isNaN(time.getTime()) ? `,更新於 ${time.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}` : "";
  return `即時資料${timeText}`;
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
        <span className="source-tag"> · {sourceLabel(s)}</span>
      </span>
    </div>
  );
}
