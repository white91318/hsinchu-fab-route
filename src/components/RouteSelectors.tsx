import { NODES } from "@/lib/data/nodes";
import type { NodeId } from "@/lib/traffic/types";

const ORIGIN_OPTIONS = Object.entries(NODES).filter(([, n]) => n.type === "origin");
const DEST_OPTIONS = Object.entries(NODES).filter(([, n]) => n.type === "dest");

interface RouteSelectorsProps {
  originId: NodeId | null;
  destId: NodeId | null;
  onOriginChange: (id: NodeId | null) => void;
  onDestChange: (id: NodeId | null) => void;
  onReset: () => void;
}

/**
 * Primary way to pick origin/destination on every screen size — a phone
 * can't reliably tap a ~10px station on the network diagram, so this
 * dropdown pair is the actual input; the map (see TrafficMap) is a
 * secondary, collapsible reference rather than the only way in.
 */
export function RouteSelectors({ originId, destId, onOriginChange, onDestChange, onReset }: RouteSelectorsProps) {
  return (
    <div className="ctrl-row selectors-row">
      <label className="select-field">
        <span className="select-label">出發</span>
        <select
          className="node-select"
          value={originId ?? ""}
          onChange={(e) => onOriginChange(e.target.value || null)}
        >
          <option value="">請選擇出發地</option>
          {ORIGIN_OPTIONS.map(([id, n]) => (
            <option key={id} value={id}>
              {n.label}
            </option>
          ))}
        </select>
      </label>
      <label className="select-field">
        <span className="select-label">目的地</span>
        <select className="node-select" value={destId ?? ""} onChange={(e) => onDestChange(e.target.value || null)}>
          <option value="">請選擇目的地</option>
          {DEST_OPTIONS.map(([id, n]) => (
            <option key={id} value={id}>
              {n.label}
            </option>
          ))}
        </select>
      </label>
      {(originId || destId) && (
        <button type="button" className="reset-btn" onClick={onReset}>
          清除選擇
        </button>
      )}
    </div>
  );
}
