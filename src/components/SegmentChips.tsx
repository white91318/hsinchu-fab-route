import { SEGMENTS } from "@/lib/data/segments";
import { LEVEL_LABEL, levelVar } from "@/lib/traffic/model";
import type { SegmentId, SegmentStatus } from "@/lib/traffic/types";

interface SegmentChipsProps {
  statuses: Record<SegmentId, SegmentStatus>;
  activeSeg: SegmentId | null;
  onSelect: (id: SegmentId) => void;
}

export function SegmentChips({ statuses, activeSeg, onSelect }: SegmentChipsProps) {
  return (
    <div className="chip-grid">
      {Object.keys(SEGMENTS).map((id) => {
        const s = statuses[id];
        return (
          <button
            key={id}
            type="button"
            className="seg-chip"
            aria-pressed={id === activeSeg}
            onClick={() => onSelect(id)}
          >
            <span className="sw" style={{ background: levelVar(s.level) }} />
            <span className="lbl">
              {s.name} · {LEVEL_LABEL[s.level]}
              {s.source === "live" && (
                <span className="live-dot" title="即時資料" aria-label="即時資料" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
