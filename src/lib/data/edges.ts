import type { AdjacencyEntry, Edge, EdgeDef, NodeId } from "@/lib/traffic/types";
import { NODES } from "@/lib/data/nodes";

/**
 * Every edge is an orthogonal polyline (horizontal / vertical runs with
 * square corners), metro-map style — `pts` are the hand-laid track
 * waypoints. Ported from the POC artifact's EDGES table.
 */
const EDGE_DEFS: EdgeDef[] = [
  // 國道1號
  { seg: "N1_NORTH", from: "O_xinfeng", to: "O_huko", pts: [[750, 70], [750, 150]] },
  { seg: "N1_NORTH", from: "O_huko", to: "J_zb", pts: [[750, 150], [750, 213]] },
  { seg: "N1_MID", from: "J_zb", to: "J_hc", pts: [[750, 247], [750, 453]] },
  {
    seg: "N1_SOUTH",
    from: "J_hc",
    to: "J_ic",
    pts: [[710, 487], [710, 530], [380, 530], [380, 993]],
  },
  // 光明六路（竹北橫線）
  { seg: "GUANGMING6", from: "O_zhubeiCity", to: "O_guangming", pts: [[270, 230], [510, 230]] },
  { seg: "GUANGMING6", from: "O_guangming", to: "J_zb", pts: [[510, 230], [698, 230]] },
  { seg: "GUANGMING6", from: "J_zb", to: "O_hsr", pts: [[802, 230], [950, 230]] },
  { seg: "GUANGMING6", from: "O_hsr", to: "D_biomed", pts: [[950, 230], [1150, 230]] },
  // 中華路（南北縱線）
  { seg: "ZHONGHUA_N", from: "O_zhubeiCity", to: "O_city", pts: [[270, 230], [270, 470]] },
  { seg: "ZHONGHUA_MID", from: "O_city", to: "O_xiangshan", pts: [[270, 470], [270, 810]] },
  { seg: "ZHONGHUA_S", from: "O_xiangshan", to: "O_zhunanTown", pts: [[270, 810], [270, 1150]] },
  // 公道五路（關埔橫線）
  { seg: "GONGDAO5", from: "O_hsr", to: "O_puding", pts: [[950, 230], [950, 350], [871, 350]] },
  { seg: "GONGDAO5", from: "O_puding", to: "O_guanpu", pts: [[860, 350], [620, 350]] },
  // 關新路／埔頂路（關埔往光復路）
  {
    seg: "GUANXIN",
    from: "O_guanpu",
    to: "J_hc",
    pts: [[620, 350], [620, 410], [720, 410], [720, 453]],
  },
  {
    seg: "PUDING",
    from: "O_puding",
    to: "O_guandong",
    pts: [[860, 350], [860, 410], [980, 410], [980, 459]],
  },
  // 光復路（東西橫線）
  { seg: "GUANGFU", from: "O_city", to: "O_nthu", pts: [[270, 470], [510, 470]] },
  { seg: "GUANGFU", from: "O_nthu", to: "J_hc", pts: [[510, 470], [698, 470]] },
  { seg: "GUANGFU", from: "J_hc", to: "O_guandong", pts: [[802, 470], [980, 470]] },
  { seg: "GUANGFU", from: "O_guandong", to: "O_zhudong", pts: [[980, 470], [1150, 470]] },
  // 新安路（園區正門聯絡道）
  {
    seg: "XINAN",
    from: "J_hc",
    to: "D_xinan",
    pts: [[750, 487], [750, 590], [560, 590], [560, 729]],
  },
  // 園區二路／篤行一路（園區東側入口）
  {
    seg: "PARK2",
    from: "O_guandong",
    to: "D_duxing",
    pts: [[980, 481], [980, 600], [1060, 600], [1060, 639]],
  },
  {
    seg: "DUXING",
    from: "D_duxing",
    to: "D_lixingRd",
    pts: [[1060, 650], [1060, 700], [1120, 700], [1120, 740]],
  },
  // 力行路主幹道（園區大廠一字排開）
  { seg: "LIXING", from: "D_xinan", to: "D_lixing1", pts: [[560, 740], [700, 740]] },
  { seg: "LIXING", from: "D_lixing1", to: "D_lixing2", pts: [[700, 740], [840, 740]] },
  { seg: "LIXING", from: "D_lixing2", to: "D_lixing6", pts: [[840, 740], [980, 740]] },
  { seg: "LIXING", from: "D_lixing6", to: "D_lixingRd", pts: [[980, 740], [1120, 740]] },
  // 研新一路／創新路／園區三路／工業東路
  { seg: "YANXIN1", from: "D_xinan", to: "D_yanxin1", pts: [[560, 740], [560, 830]] },
  {
    seg: "YANXIN1",
    from: "D_yanxin1",
    to: "D_chuangxin",
    pts: [[560, 830], [560, 920], [700, 920]],
  },
  { seg: "CHUANGXIN", from: "D_lixing1", to: "D_chuangxin", pts: [[700, 740], [700, 920]] },
  { seg: "PARK3", from: "D_lixing6", to: "D_park3", pts: [[980, 740], [980, 920]] },
  { seg: "PARK3", from: "D_chuangxin", to: "D_park3", pts: [[700, 920], [980, 920]] },
  { seg: "GONGYE_E", from: "D_lixingRd", to: "D_industry", pts: [[1120, 740], [1120, 830]] },
  { seg: "BAOSHAN", from: "D_park3", to: "O_baoshan", pts: [[980, 920], [1120, 920]] },
  // 國道3號／竹南
  {
    seg: "N3_ZHUNAN",
    from: "J_ic",
    to: "J_zn",
    pts: [[344, 1010], [110, 1010], [110, 1223]],
  },
  { seg: "ZHUNAN_RAMP", from: "J_zn", to: "D_zhunanPark", pts: [[162, 1240], [259, 1240]] },
  { seg: "KEXUE", from: "O_zhunanTown", to: "D_zhunanPark", pts: [[270, 1150], [270, 1240]] },
];

export const EDGES: Edge[] = EDGE_DEFS.map((e, i) => ({ ...e, id: `E${i}` }));

/** Roads run both ways — the router may use any edge in either direction. */
export function buildAdjacency(): Record<NodeId, AdjacencyEntry[]> {
  const adj: Record<NodeId, AdjacencyEntry[]> = {};
  Object.keys(NODES).forEach((id) => {
    adj[id] = [];
  });
  EDGES.forEach((e) => {
    adj[e.from].push({ seg: e.seg, id: e.id, to: e.to });
    adj[e.to].push({ seg: e.seg, id: e.id, to: e.from });
  });
  return adj;
}

export const ADJACENCY: Record<NodeId, AdjacencyEntry[]> = buildAdjacency();
