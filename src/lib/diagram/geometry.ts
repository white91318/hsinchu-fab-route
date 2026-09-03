import type { LabelPosition, NodeDef } from "@/lib/traffic/types";

/** Orthogonal polyline → SVG path data, with softly rounded corners. */
export function pathD(pts: Array<[number, number]>, r: number): string {
  if (pts.length < 2) return "";
  let d = "M" + pts[0][0] + "," + pts[0][1];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const l1 = Math.sqrt((cur[0] - prev[0]) ** 2 + (cur[1] - prev[1]) ** 2);
    const l2 = Math.sqrt((next[0] - cur[0]) ** 2 + (next[1] - cur[1]) ** 2);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = cur[0] + ((prev[0] - cur[0]) / l1) * rr;
    const ay = cur[1] + ((prev[1] - cur[1]) / l1) * rr;
    const bx = cur[0] + ((next[0] - cur[0]) / l2) * rr;
    const by = cur[1] + ((next[1] - cur[1]) / l2) * rr;
    d += "L" + ax + "," + ay + "Q" + cur[0] + "," + cur[1] + " " + bx + "," + by;
  }
  const last = pts[pts.length - 1];
  return d + "L" + last[0] + "," + last[1];
}

export interface LabelAnchor {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

export function labelPos(n: Pick<NodeDef, "x" | "y" | "lab">): LabelAnchor {
  const lab: LabelPosition | undefined = n.lab;
  switch (lab) {
    case "below":
      return { x: n.x, y: n.y + 30, anchor: "middle" };
    case "left":
      return { x: n.x - 18, y: n.y + 5, anchor: "end" };
    case "right":
      return { x: n.x + 18, y: n.y + 5, anchor: "start" };
    case "upright":
      return { x: n.x + 16, y: n.y - 16, anchor: "start" };
    default:
      return { x: n.x, y: n.y - 20, anchor: "middle" };
  }
}
