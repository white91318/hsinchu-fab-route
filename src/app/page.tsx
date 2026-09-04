"use client";

import { useMemo } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { MapPane } from "@/components/MapPane";
import { RoutePanel } from "@/components/RoutePanel";
import { useCommuteState } from "@/hooks/useCommuteState";
import { useLiveTraffic } from "@/hooks/useLiveTraffic";
import { NODES } from "@/lib/data/nodes";
import { pathLabel } from "@/lib/routing/computePath";
import { findPaths } from "@/lib/routing/pathfinding";
import { selectTopRoutes } from "@/lib/routing/selectRoutes";
import { computeSegmentStatuses } from "@/lib/traffic/model";
import { hourFloat, nowMinutes } from "@/lib/traffic/time";

const MAX_PATH_LENGTH = 6;

export default function Home() {
  const {
    minutes,
    weekday,
    origin,
    dest,
    activeSeg,
    playing,
    setMinutes,
    setWeekday,
    selectNode,
    setOriginId,
    setDestId,
    setActiveSeg,
    setPlaying,
    jumpToNow,
    reset,
  } = useCommuteState();

  const liveTraffic = useLiveTraffic();
  const hour = hourFloat(minutes);
  // Live readings only reflect the actual present — applying them while the
  // user is scrubbing the time slider to a different moment would be
  // misleading, so they're only overlaid when the slider sits on "now".
  const isCurrentlyNow = Math.abs(minutes - nowMinutes()) < 3;

  const statuses = useMemo(
    () => computeSegmentStatuses(hour, weekday, isCurrentlyNow ? liveTraffic.readings : {}),
    [hour, weekday, isCurrentlyNow, liveTraffic.readings],
  );

  const { best, other, noRouteFound } = useMemo(() => {
    if (!origin || !dest) return { noRouteFound: false };
    const rawPaths = findPaths(origin, dest, MAX_PATH_LENGTH);
    return selectTopRoutes(rawPaths, statuses);
  }, [origin, dest, statuses]);

  const liveSegmentCount = Object.values(statuses).filter((s) => s.source === "live").length;

  // The one line a collapsed sheet must still answer: where to, and how long.
  const summary = best ? (
    <>
      <span className="summary-route">{pathLabel(best)}</span>
      <span className="summary-time mono">約 {best.total} 分鐘</span>
    </>
  ) : origin || dest ? (
    <span className="summary-hint">
      {origin ? NODES[origin].label : "選出發地"} → {dest ? NODES[dest].label : "選目的地"}
    </span>
  ) : (
    <span className="summary-hint">選出發地和目的地,看建議路線</span>
  );

  const panel = (
    <RoutePanel
      origin={origin}
      dest={dest}
      onOriginChange={setOriginId}
      onDestChange={setDestId}
      onReset={reset}
      minutes={minutes}
      weekday={weekday}
      playing={playing}
      onMinutesChange={setMinutes}
      onWeekdayChange={setWeekday}
      onPlayingChange={setPlaying}
      onNow={jumpToNow}
      best={best}
      other={other}
      noRouteFound={noRouteFound}
      statuses={statuses}
      activeSeg={activeSeg}
      onSelectSegment={setActiveSeg}
      liveTraffic={liveTraffic}
      liveSegmentCount={liveSegmentCount}
    />
  );

  return (
    <div className="app-shell">
      <header className="appbar">
        <span className="dot" />
        <span className="name">竹科塞車通</span>
        <span className="sub">路況 · 通勤小工具</span>
        <span className="crumb">今天走哪條路</span>
      </header>
      <div className="stripe" />

      {/* One DOM tree for both layouts: on a phone the sheet floats over the
          map, on a wide screen CSS turns it into the left column. Rendering it
          once keeps the two in sync and avoids remount-on-resize. */}
      <main className="app-body">
        <MapPane
          statuses={statuses}
          origin={origin}
          dest={dest}
          activeSeg={activeSeg}
          bestEdgeIds={best?.edgeIds ?? []}
          altEdgeIds={other?.edgeIds ?? []}
          onSelectNode={selectNode}
          onSelectSegment={setActiveSeg}
          weather={liveTraffic.weather?.state ?? null}
        />
        <BottomSheet summary={summary}>{panel}</BottomSheet>
      </main>
    </div>
  );
}
