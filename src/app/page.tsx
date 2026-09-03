"use client";

import { useMemo } from "react";
import { LiveDataStatus } from "@/components/LiveDataStatus";
import { NetworkMapSection } from "@/components/NetworkMapSection";
import { RouteResults } from "@/components/RouteResults";
import { RouteSelectors } from "@/components/RouteSelectors";
import { TimeControls } from "@/components/TimeControls";
import { useCommuteState } from "@/hooks/useCommuteState";
import { useLiveTraffic } from "@/hooks/useLiveTraffic";
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

  return (
    <>
      <div className="appbar">
        <span className="dot" />
        <span className="name">竹科塞車通</span>
        <span className="sub">路況 · 通勤小工具</span>
        <span className="crumb">功能 / 今天走哪條路</span>
      </div>
      <div className="stripe" />

      <main>
        <div className="lede">
          <h1 className="display">今天走哪條路比較好?</h1>
          <p>選出發地和目的地,系統會在路網裡找路線並即時比較;也可以拖曳時間軸看一整天的路況怎麼變化。</p>
        </div>

        <LiveDataStatus liveTraffic={liveTraffic} liveCount={liveSegmentCount} />

        <div className="card">
          <RouteSelectors
            originId={origin}
            destId={dest}
            onOriginChange={setOriginId}
            onDestChange={setDestId}
            onReset={reset}
          />
        </div>

        <RouteResults
          hasSelection={Boolean(origin && dest)}
          noRouteFound={noRouteFound}
          best={best}
          other={other}
        />

        {/* Time scrubbing is a "what if" tool, not the main question — it sits
            below the answer so the recommendation lands above the fold on a
            phone. Defaults to now, which is what most commuters want. */}
        <div className="card">
          <p className="net-hint">想看其他時段?拖曳時間軸看一整天的路況怎麼變化。</p>
          <TimeControls
            minutes={minutes}
            weekday={weekday}
            playing={playing}
            onMinutesChange={setMinutes}
            onWeekdayChange={setWeekday}
            onPlayingChange={setPlaying}
            onNow={jumpToNow}
          />
        </div>

        <NetworkMapSection
          statuses={statuses}
          origin={origin}
          dest={dest}
          activeSeg={activeSeg}
          bestEdgeIds={best?.edgeIds ?? []}
          altEdgeIds={other?.edgeIds ?? []}
          onSelectNode={selectNode}
          onSelectSegment={setActiveSeg}
        />

        <div className="disclaimer">
          國道 1 號／3 號路段(頭前溪以北、竹北—新竹、新竹—系統交流道、竹南段)會嘗試向高速公路局即時路況資料抓取實際車速與旅行時間;抓不到時自動退回模擬值,並在上方狀態列與路段細節誠實標示來源。其餘市區與園區路段、班別交接尖峰,目前仍是「時間函式」模擬(含施工示範情境),尚未有可用的即時官方資料(見 PRD §7)。
        </div>
      </main>
    </>
  );
}
