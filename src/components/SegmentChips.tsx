import { SEGMENTS } from "@/lib/data/segments";
import { LEVEL_LABEL, levelVar, segStatus } from "@/lib/traffic/model";
import type { SegmentId } from "@/lib/traffic/types";

interface SegmentChipsProps {
  hour: number;
  weekday: boolean;
  activeSeg: SegmentId | null;
  onSelect: (id: SegmentId) => void;
}

export function SegmentChips({ hour, weekday, activeSeg, onSelect }: SegmentChipsProps) {
  return (
    <div className="chip-grid">
      {Object.keys(SEGMENTS).map((id) => {
        const s = segStatus(id, hour, weekday);
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
            </span>
          </button>
        );
      })}
    </div>
  );
}
