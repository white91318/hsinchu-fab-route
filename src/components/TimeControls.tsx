"use client";

import { fmtMinutes, nowMinutes } from "@/lib/traffic/time";

interface TimeControlsProps {
  minutes: number;
  weekday: boolean;
  playing: boolean;
  onMinutesChange: (minutes: number) => void;
  onWeekdayChange: (weekday: boolean) => void;
  onPlayingChange: (playing: boolean) => void;
  onNow: () => void;
}

export function TimeControls({
  minutes,
  weekday,
  playing,
  onMinutesChange,
  onWeekdayChange,
  onPlayingChange,
  onNow,
}: TimeControlsProps) {
  const isCurrentlyNow = Math.abs(minutes - nowMinutes()) < 3;

  return (
    <div className="ctrl-row">
      <div className="time-block">
        <button
          type="button"
          className="icon-btn"
          aria-pressed={playing}
          title="自動播放一整天"
          aria-label="自動播放一整天"
          onClick={() => onPlayingChange(!playing)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="time-readout mono">{fmtMinutes(minutes)}</span>
        <input
          type="range"
          className="time-slider"
          min={0}
          max={1439}
          step={5}
          value={minutes}
          aria-label="一天中的時間"
          onPointerDown={() => {
            if (playing) onPlayingChange(false);
          }}
          onChange={(e) => onMinutesChange(parseInt(e.target.value, 10))}
        />
        <button type="button" className="icon-btn" title="跳到現在時間" aria-label="跳到現在時間" onClick={onNow}>
          ⟳
        </button>
      </div>
      <div className="seg" role="group" aria-label="平日或假日">
        <button type="button" aria-pressed={weekday} onClick={() => onWeekdayChange(true)}>
          平日
        </button>
        <button type="button" aria-pressed={!weekday} onClick={() => onWeekdayChange(false)}>
          假日
        </button>
      </div>
      <div className="day-context">
        {isCurrentlyNow
          ? `目前時間 · ${weekday ? "平日" : "假日"}`
          : `模擬時間 · ${weekday ? "平日" : "假日"}（非即時）`}
      </div>
    </div>
  );
}
