"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { EDGES } from "@/lib/data/edges";
import { NODES } from "@/lib/data/nodes";
import { SEGMENTS } from "@/lib/data/segments";
import { labelPos, pathD } from "@/lib/diagram/geometry";
import { levelVar } from "@/lib/traffic/model";
import type { NodeDef, NodeId, SegmentId, SegmentStatus } from "@/lib/traffic/types";

interface TrafficMapProps {
  statuses: Record<SegmentId, SegmentStatus>;
  origin: NodeId | null;
  dest: NodeId | null;
  activeSeg: SegmentId | null;
  bestEdgeIds: string[];
  altEdgeIds: string[];
  onSelectNode: (id: NodeId) => void;
  onSelectSegment: (id: SegmentId) => void;
}

function activateOnKey(handler: () => void) {
  return (ev: React.KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      handler();
    }
  };
}

export function TrafficMap({
  statuses,
  origin,
  dest,
  activeSeg,
  bestEdgeIds,
  altEdgeIds,
  onSelectNode,
  onSelectSegment,
}: TrafficMapProps) {
  return (
    <svg id="netSvg" viewBox="0 0 1340 1320" role="img" aria-label="竹科周邊道路網示意圖">
      <defs>
        <marker id="arrow2" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
          <polygon points="0 0, 7 3, 0 6" fill="currentColor" />
        </marker>
      </defs>

      {/* compass marker — the layout follows real relative geography (north is up) */}
      <g opacity={0.5}>
        <line x1={70} y1={110} x2={70} y2={60} stroke="currentColor" strokeWidth={1.5} markerEnd="url(#arrow2)" />
        <text x={70} y={130} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">
          N
        </text>
      </g>

      <g id="edgeLayer">
        {EDGES.map((edge) => {
          const status = statuses[edge.seg];
          const isBest = bestEdgeIds.includes(edge.id);
          const isAlt = altEdgeIds.includes(edge.id);
          const d = pathD(edge.pts, 14);
          const select = () => onSelectSegment(edge.seg);
          return (
            <g
              key={edge.id}
              className="netedge"
              tabIndex={0}
              role="button"
              aria-label={SEGMENTS[edge.seg].name}
              onClick={select}
              onKeyDown={activateOnKey(select)}
            >
              <path d={d} fill="none" stroke="transparent" strokeWidth={20} />
              <path
                d={d}
                fill="none"
                strokeWidth={15}
                strokeLinecap="round"
                strokeLinejoin="round"
                stroke={isBest ? "var(--accent)" : "currentColor"}
                opacity={isBest ? 0.6 : isAlt ? 0.18 : 0}
              />
              <path
                d={d}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                stroke={levelVar(status.level)}
                opacity={0.9}
                strokeWidth={isBest ? 8 : isAlt ? 7 : 6}
              />
              <path
                d={d}
                fill="none"
                stroke="var(--steel)"
                strokeWidth={12}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="1 10"
                opacity={edge.seg === activeSeg ? 0.9 : 0}
              />
            </g>
          );
        })}
      </g>

      <g id="nodeLayer">
        {Object.entries(NODES).map(([id, node]) =>
          node.type === "junction" ? (
            <JunctionNode key={id} node={node} />
          ) : (
            <StationNode
              key={id}
              id={id}
              node={node}
              selected={id === origin || id === dest}
              onSelect={onSelectNode}
            />
          ),
        )}
      </g>
    </svg>
  );
}

function JunctionNode({ node }: { node: NodeDef }) {
  const w = node.w ?? 0;
  const h = node.h ?? 0;
  return (
    <g className="netjunction">
      <rect
        x={node.x - w / 2}
        y={node.y - h / 2}
        width={w}
        height={h}
        rx={h / 2}
        fill="var(--surface)"
        stroke="currentColor"
        strokeWidth={2.2}
      />
      <text x={node.x} y={node.y + 5} textAnchor="middle" fontSize={13.5} fontWeight={700} fill="currentColor">
        {node.label}
      </text>
    </g>
  );
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function StationNode({
  id,
  node,
  selected,
  onSelect,
}: {
  id: NodeId;
  node: NodeDef;
  selected: boolean;
  onSelect: (id: NodeId) => void;
}) {
  const labelRef = useRef<SVGTextElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const [labelBg, setLabelBg] = useState<Box | null>(null);
  const [hitArea, setHitArea] = useState<Box | null>(null);
  const pos = labelPos(node);

  // Size the readable backdrop behind the label from its rendered text metrics.
  useLayoutEffect(() => {
    if (!labelRef.current) return;
    const bb = labelRef.current.getBBox();
    setLabelBg({ x: bb.x - 4, y: bb.y - 2, width: bb.width + 8, height: bb.height + 4 });
  }, []);

  // Then pad a transparent hit area around the whole mark + label.
  useLayoutEffect(() => {
    if (!groupRef.current || !labelBg) return;
    const gb = groupRef.current.getBBox();
    setHitArea({ x: gb.x - 5, y: gb.y - 5, width: gb.width + 10, height: gb.height + 10 });
  }, [labelBg]);

  const select = () => onSelect(id);

  return (
    <g
      ref={groupRef}
      className="netnode"
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={node.label}
      onClick={select}
      onKeyDown={activateOnKey(select)}
    >
      {node.type === "dest" ? (
        <rect
          className="nodemark"
          x={node.x - 11}
          y={node.y - 11}
          width={22}
          height={22}
          rx={6}
          fill={selected ? "var(--accent)" : "var(--surface)"}
          stroke={selected ? "var(--accent-ink)" : "currentColor"}
          strokeWidth={selected ? 4 : 3}
        />
      ) : (
        <circle
          className="nodemark"
          cx={node.x}
          cy={node.y}
          r={11}
          fill={selected ? "var(--accent)" : "var(--surface)"}
          stroke={selected ? "var(--accent-ink)" : "currentColor"}
          strokeWidth={selected ? 4 : 3}
        />
      )}
      {labelBg && (
        <rect x={labelBg.x} y={labelBg.y} width={labelBg.width} height={labelBg.height} rx={4} fill="var(--surface)" opacity={0.9} />
      )}
      <text
        ref={labelRef}
        className="nodelabel"
        x={pos.x}
        y={pos.y}
        textAnchor={pos.anchor}
        fontSize={15}
        fontWeight={selected ? 800 : 600}
        fill="currentColor"
      >
        {node.label}
      </text>
      {hitArea && (
        <rect x={hitArea.x} y={hitArea.y} width={hitArea.width} height={hitArea.height} fill="transparent" />
      )}
    </g>
  );
}
