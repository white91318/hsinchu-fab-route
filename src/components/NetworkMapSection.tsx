"use client";

import { useState } from "react";
import { InfoPanel } from "@/components/InfoPanel";
import { MapLegend } from "@/components/MapLegend";
import { SegmentChips } from "@/components/SegmentChips";
import { TrafficMap } from "@/components/TrafficMap";
import { useIsWideViewport } from "@/hooks/useIsWideViewport";
import type { NodeId, SegmentId, SegmentStatus } from "@/lib/traffic/types";

const WIDE_BREAKPOINT = 760;

interface NetworkMapSectionProps {
  statuses: Record<SegmentId, SegmentStatus>;
  origin: NodeId | null;
  dest: NodeId | null;
  activeSeg: SegmentId | null;
  bestEdgeIds: string[];
  altEdgeIds: string[];
  onSelectNode: (id: NodeId) => void;
  onSelectSegment: (id: SegmentId) => void;
}

/**
 * The metro-map diagram, demoted to a secondary/reference view: choosing
 * origin/destination happens in RouteSelectors now (a phone can't reliably
 * tap a ~10px station), so this collapses by default and only auto-expands
 * once the client confirms a wide-enough viewport to make tapping the map
 * itself viable. A manual toggle always wins over that default.
 */
export function NetworkMapSection({
  statuses,
  origin,
  dest,
  activeSeg,
  bestEdgeIds,
  altEdgeIds,
  onSelectNode,
  onSelectSegment,
}: NetworkMapSectionProps) {
  const isWide = useIsWideViewport(WIDE_BREAKPOINT);
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const expanded = manualOverride ?? isWide;

  return (
    <div className="card">
      <button
        type="button"
        className="map-toggle"
        aria-expanded={expanded}
        onClick={() => setManualOverride(!expanded)}
      >
        <span>竹科周邊道路網示意圖</span>
        <span className="map-toggle-hint">{expanded ? "收合 ▲" : "展開查看地圖 ▼"}</span>
      </button>
      {expanded && (
        <>
          <p className="net-hint">
            點站點選出發地／目的地(再點一次取消);點路線或下面的路段標籤看即時路況。畫法比照捷運路線圖:只有直線和直角轉彎,站點方位依新竹地區實際相對地理位置排列(國道交流道座標取自公路局資料),距離則經過壓縮,不是等比例地圖。
          </p>
          <figure>
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
          </figure>
          <MapLegend />
          <InfoPanel activeSeg={activeSeg} statuses={statuses} />
          <SegmentChips statuses={statuses} activeSeg={activeSeg} onSelect={onSelectSegment} />
        </>
      )}
    </div>
  );
}
