"use client";

import { useMemo } from "react";
import { InfoPanel } from "@/components/InfoPanel";
import { LiveDataStatus } from "@/components/LiveDataStatus";
import { MapLegend } from "@/components/MapLegend";
import { RouteResults } from "@/components/RouteResults";
import { SegmentChips } from "@/components/SegmentChips";
import { SelectionPills } from "@/components/SelectionPills";
import { TimeControls } from "@/components/TimeControls";
import { TrafficMap } from "@/components/TrafficMap";
import { useCommuteState } from "@/hooks/useCommuteState";
import { useLiveTraffic } from "@/hooks/useLiveTraffic";
import { NODES } from "@/lib/data/nodes";
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
          <p>拖曳時間軸看一整天的路況怎麼變化,直接點地圖上的出發地和目的地,系統會在路網裡找路線並即時比較。</p>
        </div>

        <LiveDataStatus liveTraffic={liveTraffic} liveCount={liveSegmentCount} />

        <div className="card">
          <TimeControls
            minutes={minutes}
            weekday={weekday}
            playing={playing}
            onMinutesChange={setMinutes}
            onWeekdayChange={setWeekday}
            onPlayingChange={setPlaying}
            onNow={jumpToNow}
          />
          <SelectionPills
            originLabel={origin ? NODES[origin].label : null}
            destLabel={dest ? NODES[dest].label : null}
            onReset={reset}
          />
        </div>

        <div className="card">
          <p className="net-hint">
            點站點選出發地／目的地(再點一次取消);點路線或下面的路段標籤看即時路況。畫法比照捷運路線圖:只有直線和直角轉彎,站點方位依新竹地區實際相對地理位置排列(國道交流道座標取自公路局資料),距離則經過壓縮,不是等比例地圖。
          </p>
          <figure>
            <TrafficMap
              statuses={statuses}
              origin={origin}
              dest={dest}
              activeSeg={activeSeg}
              bestEdgeIds={best?.edgeIds ?? []}
              altEdgeIds={other?.edgeIds ?? []}
              onSelectNode={selectNode}
              onSelectSegment={setActiveSeg}
            />
          </figure>
          <MapLegend />
          <InfoPanel activeSeg={activeSeg} statuses={statuses} />
          <SegmentChips statuses={statuses} activeSeg={activeSeg} onSelect={setActiveSeg} />
        </div>

        <RouteResults
          hasSelection={Boolean(origin && dest)}
          noRouteFound={noRouteFound}
          best={best}
          other={other}
        />

        <div className="disclaimer">
          國道 1 號／3 號路段(頭前溪以北、竹北—新竹、新竹—系統交流道、竹南段)會嘗試向高速公路局即時路況資料抓取實際車速與旅行時間;抓不到時自動退回模擬值,並在上方狀態列與路段細節誠實標示來源。其餘市區與園區路段、班別交接尖峰,目前仍是「時間函式」模擬(含施工示範情境),尚未有可用的即時官方資料(見 PRD §7)。
        </div>
      </main>
    </>
  );
}
