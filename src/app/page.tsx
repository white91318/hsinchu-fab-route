"use client";

import { useMemo } from "react";
import { InfoPanel } from "@/components/InfoPanel";
import { MapLegend } from "@/components/MapLegend";
import { RouteResults } from "@/components/RouteResults";
import { SegmentChips } from "@/components/SegmentChips";
import { SelectionPills } from "@/components/SelectionPills";
import { TimeControls } from "@/components/TimeControls";
import { TrafficMap } from "@/components/TrafficMap";
import { useCommuteState } from "@/hooks/useCommuteState";
import { NODES } from "@/lib/data/nodes";
import { findPaths } from "@/lib/routing/pathfinding";
import { selectTopRoutes } from "@/lib/routing/selectRoutes";
import { hourFloat } from "@/lib/traffic/time";

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

  const hour = hourFloat(minutes);

  const { best, other, noRouteFound } = useMemo(() => {
    if (!origin || !dest) return { noRouteFound: false };
    const rawPaths = findPaths(origin, dest, MAX_PATH_LENGTH);
    return selectTopRoutes(rawPaths, hour, weekday);
  }, [origin, dest, hour, weekday]);

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
              hour={hour}
              weekday={weekday}
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
          <InfoPanel activeSeg={activeSeg} hour={hour} weekday={weekday} />
          <SegmentChips hour={hour} weekday={weekday} activeSeg={activeSeg} onSelect={setActiveSeg} />
        </div>

        <RouteResults
          hasSelection={Boolean(origin && dest)}
          noRouteFound={noRouteFound}
          best={best}
          other={other}
        />

        <div className="disclaimer">
          這是功能原型:路況邏輯用「時間函式」模擬一整天的尖峰規律(含施工示範情境),尚未串接即時路況、道路施工開放資料或大廠實際班別時間。正式版規劃會接入公路局路況資料與使用者即時回報。
        </div>
      </main>
    </>
  );
}
