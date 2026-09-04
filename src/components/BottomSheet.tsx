"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

/** Snap heights as a fraction of the available pane height, smallest first. */
const SNAPS = [0.14, 0.5, 0.9] as const;
export type SnapIndex = 0 | 1 | 2;

const SNAP_LABEL: Record<SnapIndex, string> = {
  0: "展開面板",
  1: "展開更多",
  2: "收合面板",
};

interface BottomSheetProps {
  /** Compact line shown at every snap point, so a collapsed sheet still answers the question. */
  summary: ReactNode;
  children: ReactNode;
}

/**
 * Draggable bottom sheet over the map (phones), and the plain left column of
 * the split layout (desktop) — the CSS decides which, this component only
 * owns the snap state. The height is published as a CSS custom property
 * rather than an inline `height`, so the desktop rules can ignore it without
 * fighting inline-style specificity.
 *
 * Dragging is pointer-events based (works for touch, mouse and pen alike);
 * the handle is also a real button, so tapping it cycles snap points and it
 * stays operable by keyboard and screen reader, where a drag never lands.
 */
export function BottomSheet({ summary, children }: BottomSheetProps) {
  const [snap, setSnap] = useState<SnapIndex>(1);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; startFraction: number; paneHeight: number } | null>(null);

  const fraction = dragFraction ?? SNAPS[snap];

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const pane = sheetRef.current?.parentElement;
      if (!pane) return;
      dragState.current = {
        startY: e.clientY,
        startFraction: SNAPS[snap],
        paneHeight: pane.clientHeight,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [snap],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    if (!state || state.paneHeight === 0) return;
    // Dragging up grows the sheet, so the delta is inverted.
    const delta = (state.startY - e.clientY) / state.paneHeight;
    const next = state.startFraction + delta;
    setDragFraction(Math.min(Math.max(next, SNAPS[0]), SNAPS[SNAPS.length - 1]));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const state = dragState.current;
      dragState.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (!state) return;

      const moved = Math.abs(e.clientY - state.startY) > 8;
      if (!moved) {
        // A tap, not a drag — cycle to the next snap point.
        setDragFraction(null);
        setSnap((s) => (((s + 1) % SNAPS.length) as SnapIndex));
        return;
      }

      const landed = dragFraction ?? state.startFraction;
      let nearest: SnapIndex = 0;
      SNAPS.forEach((value, i) => {
        if (Math.abs(value - landed) < Math.abs(SNAPS[nearest] - landed)) nearest = i as SnapIndex;
      });
      setDragFraction(null);
      setSnap(nearest);
    },
    [dragFraction],
  );

  return (
    <div
      ref={sheetRef}
      className="sheet"
      data-snap={snap}
      data-dragging={dragFraction !== null ? "true" : undefined}
      style={{ ["--sheet-fraction" as string]: String(fraction) }}
    >
      <button
        type="button"
        className="sheet-handle"
        aria-label={SNAP_LABEL[snap]}
        aria-expanded={snap > 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="sheet-grip" aria-hidden="true" />
        <span className="sheet-summary">{summary}</span>
      </button>
      <div className="sheet-scroll">{children}</div>
    </div>
  );
}
