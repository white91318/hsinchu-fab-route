import { ADJACENCY } from "@/lib/data/edges";
import type { AdjacencyEntry, NodeId } from "@/lib/traffic/types";

const MAX_RESULTS = 400;

/** Limited-length simple-path enumeration between two nodes (DFS, no revisits). */
export function findPaths(
  startId: NodeId,
  endId: NodeId,
  maxLen: number,
): AdjacencyEntry[][] {
  const results: AdjacencyEntry[][] = [];

  function dfs(node: NodeId, path: AdjacencyEntry[], visited: Set<NodeId>) {
    if (results.length >= MAX_RESULTS || path.length > maxLen) return;
    if (node === endId && path.length > 0) {
      results.push(path.slice());
      return;
    }
    (ADJACENCY[node] || []).forEach((e) => {
      if (visited.has(e.to)) return;
      visited.add(e.to);
      path.push(e);
      dfs(e.to, path, visited);
      path.pop();
      visited.delete(e.to);
    });
  }

  dfs(startId, [], new Set([startId]));
  return results;
}
