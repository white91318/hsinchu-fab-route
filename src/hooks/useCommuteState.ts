"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NODES } from "@/lib/data/nodes";
import { isWeekdayNow, nowMinutes } from "@/lib/traffic/time";
import type { NodeId, SegmentId } from "@/lib/traffic/types";

const DEFAULT_MINUTES = 480; // 08:00 — placeholder until the real "now" lands on mount
const PLAY_STEP_MINUTES = 6;
const PLAY_INTERVAL_MS = 150;

export interface CommuteState {
  minutes: number;
  weekday: boolean;
  origin: NodeId | null;
  dest: NodeId | null;
  activeSeg: SegmentId | null;
  playing: boolean;
}

export interface CommuteActions {
  setMinutes: (minutes: number) => void;
  setWeekday: (weekday: boolean) => void;
  selectNode: (id: NodeId) => void;
  setActiveSeg: (id: SegmentId | null) => void;
  setPlaying: (playing: boolean) => void;
  jumpToNow: () => void;
  reset: () => void;
}

export function useCommuteState(): CommuteState & CommuteActions {
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [weekday, setWeekday] = useState(true);
  const [origin, setOrigin] = useState<NodeId | null>(null);
  const [dest, setDest] = useState<NodeId | null>(null);
  const [activeSeg, setActiveSeg] = useState<SegmentId | null>(null);
  const [playing, setPlayingState] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only the client knows "now" — sync it in after mount so SSR output stays deterministic.
  // Clock read from an external system (Date), not derived from props/state,
  // so it can't be computed during SSR.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinutes(nowMinutes());
    setWeekday(isWeekdayNow());
  }, []);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setMinutes((m) => (m + PLAY_STEP_MINUTES) % 1440);
    }, PLAY_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing]);

  const setPlaying = useCallback((on: boolean) => setPlayingState(on), []);

  const selectNode = useCallback((id: NodeId) => {
    const node = NODES[id];
    if (!node) return;
    if (node.type === "origin") {
      setOrigin((cur) => (cur === id ? null : id));
    } else if (node.type === "dest") {
      setDest((cur) => (cur === id ? null : id));
    }
  }, []);

  const jumpToNow = useCallback(() => {
    setPlayingState(false);
    setMinutes(nowMinutes());
    setWeekday(isWeekdayNow());
  }, []);

  const reset = useCallback(() => {
    setOrigin(null);
    setDest(null);
  }, []);

  return {
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
  };
}
