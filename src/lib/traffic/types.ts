export type CongestionLevel = "good" | "warning" | "critical";

export interface SegmentAmplitudes {
  am?: number;
  pm?: number;
  night?: number;
}

export interface SegmentPhrases {
  am?: string;
  pm?: string;
  night?: string;
  base: string;
}

export interface SegmentDef {
  name: string;
  /** Free-flow travel time for this segment, in minutes. */
  base: number;
  amps: SegmentAmplitudes;
  phrases: SegmentPhrases;
  /** Segment only sees peak amplitude on weekdays (e.g. residential commute roads). */
  weekdayOnly?: boolean;
  /** Constant multiplier offset, e.g. a permanent lane reduction from construction. */
  constOffset?: number;
}

export type SegmentId = string;

export interface SegmentStatus {
  id: SegmentId;
  name: string;
  base: number;
  level: CongestionLevel;
  reason: string;
  minutes: number;
}

export type NodeType = "origin" | "dest" | "junction";
export type LabelPosition = "above" | "below" | "left" | "right" | "upright";

export interface NodeDef {
  type: NodeType;
  x: number;
  y: number;
  label: string;
  lab?: LabelPosition;
  /** Junction capsule width/height, in diagram units. */
  w?: number;
  h?: number;
}

export type NodeId = string;

export interface EdgeDef {
  seg: SegmentId;
  from: NodeId;
  to: NodeId;
  pts: Array<[number, number]>;
}

export interface Edge extends EdgeDef {
  id: string;
}

export interface AdjacencyEntry {
  seg: SegmentId;
  id: string;
  to: NodeId;
}

export interface DisplaySegment {
  id: SegmentId;
  name: string;
  level: CongestionLevel;
  reason: string;
  minutes: number;
  base: number;
}

export interface ComputedPath {
  segs: SegmentStatus[];
  display: DisplaySegment[];
  total: number;
  worst: SegmentStatus;
  edgeIds: string[];
}
