"use client";

import { useState } from "react";
import { MapLegend } from "@/components/MapLegend";
import { TrafficMap } from "@/components/TrafficMap";
import { WeatherBackdrop } from "@/components/WeatherBackdrop";
import type { NodeId, SegmentId, SegmentStatus } from "@/lib/traffic/types";
import type { WeatherState } from "@/lib/weather/types";

const ZOOM_STEPS = [1, 1.5, 2, 3] as const;

interface MapPaneProps {
  statuses: Record<SegmentId, SegmentStatus>;
  origin: NodeId | null;
  dest: NodeId | null;
  activeSeg: SegmentId | null;
  bestEdgeIds: string[];
  altEdgeIds: string[];
  onSelectNode: (id: NodeId) => void;
  onSelectSegment: (id: SegmentId) => void;
  /** Null before the first weather read — the map then sits on the plain page ground. */
  weather: WeatherState | null;
}

/**
 * The map as the primary view. Zoom is stepped buttons rather than a pinch
 * gesture: the pane is a plain scroll container, so once the diagram is wider
 * than the viewport the browser's own panning (and pinch-zoom, which we don't
 * suppress) does the rest — no custom gesture handling to get wrong on touch.
 */
export function MapPane({
  statuses,
  origin,
  dest,
  activeSeg,
  bestEdgeIds,
  altEdgeIds,
  onSelectNode,
  onSelectSegment,
  weather,
}: MapPaneProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_STEPS[zoomIndex];

  return (
    <div className="map-pane" data-weather={weather ?? undefined}>
      {weather && <WeatherBackdrop state={weather} />}
      <div className="map-scroll">
        <div
          className="map-canvas"
          data-zoomed={zoom > 1 ? "true" : undefined}
          style={{ width: `${zoom * 100}%` }}
        >
          <TrafficMap
            statuses={statuses}
            origin={origin}
            dest={dest}
            activeSeg={activeSeg}
            bestEdgeIds={bestEdgeIds}
            altEdgeIds={altEdgeIds}
            onSelectNode={onSelectNode}
            onSelectSegment={onSelectSegment}
          />
        </div>
      </div>

      <div className="map-controls">
        <button
          type="button"
          className="icon-btn"
          aria-label="放大地圖"
          title="放大地圖"
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          onClick={() => setZoomIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1))}
        >
          ＋
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="縮小地圖"
          title="縮小地圖"
          disabled={zoomIndex === 0}
          onClick={() => setZoomIndex((i) => Math.max(i - 1, 0))}
        >
          －
        </button>
      </div>

      <div className="map-legend-float">
        <MapLegend />
      </div>
    </div>
  );
}
