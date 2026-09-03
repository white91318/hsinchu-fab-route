import { LEVEL_LABEL, levelVar, segStatus } from "@/lib/traffic/model";
import type { SegmentId } from "@/lib/traffic/types";

interface InfoPanelProps {
  activeSeg: SegmentId | null;
  hour: number;
  weekday: boolean;
}

export function InfoPanel({ activeSeg, hour, weekday }: InfoPanelProps) {
  if (!activeSeg) {
    return <div className="info-panel">點選地圖上的路段線條，或下面的路段標籤，看目前路況細節。</div>;
  }

  const s = segStatus(activeSeg, hour, weekday);
  return (
    <div className="info-panel">
      <span className="sw" style={{ background: levelVar(s.level) }} />
      <span>
        <b>{s.name}</b> — {LEVEL_LABEL[s.level]}，約 {s.minutes} 分鐘（基準 {s.base} 分）。{s.reason}。
      </span>
    </div>
  );
}
