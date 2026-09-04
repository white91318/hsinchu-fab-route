"use client";

import { ConstructionNotices } from "@/components/ConstructionNotices";
import { InfoPanel } from "@/components/InfoPanel";
import { LiveDataStatus } from "@/components/LiveDataStatus";
import { RouteResults } from "@/components/RouteResults";
import { RouteSelectors } from "@/components/RouteSelectors";
import { SegmentChips } from "@/components/SegmentChips";
import { TimeControls } from "@/components/TimeControls";
import type { LiveTrafficState } from "@/hooks/useLiveTraffic";
import type { ComputedPath, NodeId, SegmentId, SegmentStatus } from "@/lib/traffic/types";

interface RoutePanelProps {
  origin: NodeId | null;
  dest: NodeId | null;
  onOriginChange: (id: NodeId | null) => void;
  onDestChange: (id: NodeId | null) => void;
  onReset: () => void;

  minutes: number;
  weekday: boolean;
  playing: boolean;
  onMinutesChange: (minutes: number) => void;
  onWeekdayChange: (weekday: boolean) => void;
  onPlayingChange: (playing: boolean) => void;
  onNow: () => void;

  best?: ComputedPath;
  other?: ComputedPath;
  noRouteFound: boolean;

  statuses: Record<SegmentId, SegmentStatus>;
  activeSeg: SegmentId | null;
  onSelectSegment: (id: SegmentId) => void;

  liveTraffic: LiveTrafficState;
  liveSegmentCount: number;
}

/**
 * Everything that isn't the map, in one scrollable column. The same element
 * serves both layouts — a bottom sheet over the map on a phone, the left
 * column of the desktop split — so the two never drift apart in behaviour and
 * nothing remounts (and loses state) when the viewport crosses the breakpoint.
 *
 * Order is by how often it's needed: pick where you're going, read the answer,
 * then the optional stuff (other times, roadworks, per-segment detail).
 */
export function RoutePanel({
  origin,
  dest,
  onOriginChange,
  onDestChange,
  onReset,
  minutes,
  weekday,
  playing,
  onMinutesChange,
  onWeekdayChange,
  onPlayingChange,
  onNow,
  best,
  other,
  noRouteFound,
  statuses,
  activeSeg,
  onSelectSegment,
  liveTraffic,
  liveSegmentCount,
}: RoutePanelProps) {
  return (
    <>
      <section className="panel-section">
        <RouteSelectors
          originId={origin}
          destId={dest}
          onOriginChange={onOriginChange}
          onDestChange={onDestChange}
          onReset={onReset}
        />
      </section>

      <section className="panel-section">
        <RouteResults
          hasSelection={Boolean(origin && dest)}
          noRouteFound={noRouteFound}
          best={best}
          other={other}
        />
      </section>

      <section className="panel-section">
        <h2 className="panel-heading">其他時段</h2>
        <TimeControls
          minutes={minutes}
          weekday={weekday}
          playing={playing}
          onMinutesChange={onMinutesChange}
          onWeekdayChange={onWeekdayChange}
          onPlayingChange={onPlayingChange}
          onNow={onNow}
        />
      </section>

      <section className="panel-section">
        <LiveDataStatus liveTraffic={liveTraffic} liveCount={liveSegmentCount} />
        <ConstructionNotices construction={liveTraffic.construction} />
      </section>

      <section className="panel-section">
        <h2 className="panel-heading">路段路況</h2>
        <InfoPanel activeSeg={activeSeg} statuses={statuses} />
        <SegmentChips statuses={statuses} activeSeg={activeSeg} onSelect={onSelectSegment} />
      </section>

      <p className="disclaimer">
        國道 1 號／3 號路段會向 TDX 抓取實際車速與旅行時間;抓不到時自動退回模擬值,並在上方誠實標示來源。其餘市區與園區路段、班別交接尖峰仍是「時間函式」模擬(含施工示範情境)。施工公告只列出來供參考,不會自動換算成某段路的壅塞係數。
      </p>
    </>
  );
}
