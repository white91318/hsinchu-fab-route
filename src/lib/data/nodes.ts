import type { NodeDef, NodeId } from "@/lib/traffic/types";

/**
 * Nodes in the metro-map-style network diagram. Positions are hand-placed:
 * relative compass direction and rough spacing follow real Hsinchu geography
 * (interchange coordinates sourced from the national freeway bureau), but
 * exact distances are compressed to fit a schematic canvas — like a transit
 * map, not a to-scale survey. Ported from the POC artifact's NODES table.
 */
export const NODES: Record<NodeId, NodeDef> = {
  O_xinfeng: { type: "origin", x: 750, y: 70, label: "新豐", lab: "above" },
  O_huko: { type: "origin", x: 750, y: 150, label: "湖口", lab: "right" },
  O_zhubeiCity: { type: "origin", x: 270, y: 230, label: "竹北縣治特區", lab: "above" },
  O_guangming: { type: "origin", x: 510, y: 230, label: "竹北光明六路", lab: "above" },
  O_hsr: { type: "origin", x: 950, y: 230, label: "竹北高鐵特區", lab: "above" },
  O_guanpu: { type: "origin", x: 620, y: 350, label: "關埔／關新路", lab: "above" },
  O_puding: { type: "origin", x: 860, y: 350, label: "埔頂／慈雲路", lab: "above" },
  O_city: { type: "origin", x: 270, y: 470, label: "新竹市區（東門）", lab: "left" },
  O_nthu: { type: "origin", x: 510, y: 470, label: "清大／交大", lab: "above" },
  O_guandong: { type: "origin", x: 980, y: 470, label: "關東橋／金山面", lab: "above" },
  O_zhudong: { type: "origin", x: 1150, y: 470, label: "竹東", lab: "above" },
  O_xiangshan: { type: "origin", x: 270, y: 810, label: "香山", lab: "left" },
  O_baoshan: { type: "origin", x: 1120, y: 920, label: "寶山", lab: "right" },
  O_zhunanTown: { type: "origin", x: 270, y: 1150, label: "竹南／頭份", lab: "left" },

  J_zb: { type: "junction", x: 750, y: 230, w: 104, h: 34, label: "竹北交流道" },
  J_hc: { type: "junction", x: 750, y: 470, w: 104, h: 34, label: "新竹交流道" },
  J_ic: { type: "junction", x: 400, y: 1010, w: 112, h: 34, label: "新竹系統交流道" },
  J_zn: { type: "junction", x: 110, y: 1240, w: 104, h: 34, label: "竹南交流道" },

  D_biomed: { type: "dest", x: 1150, y: 230, label: "生醫園區（竹北）", lab: "above" },
  D_duxing: { type: "dest", x: 1060, y: 650, label: "篤行一路（聯發科）", lab: "right" },
  D_xinan: { type: "dest", x: 560, y: 740, label: "新安路口（正門）", lab: "left" },
  D_lixing1: { type: "dest", x: 700, y: 740, label: "力行一路（力積電）", lab: "above" },
  D_lixing2: { type: "dest", x: 840, y: 740, label: "力行二路（聯電）", lab: "below" },
  D_lixing6: { type: "dest", x: 980, y: 740, label: "力行六路（台積12廠）", lab: "above" },
  D_lixingRd: { type: "dest", x: 1120, y: 740, label: "力行路（台積8廠）", lab: "right" },
  D_yanxin1: { type: "dest", x: 560, y: 830, label: "研新一路（台積3廠）", lab: "left" },
  D_industry: { type: "dest", x: 1120, y: 830, label: "工業東路（環球晶）", lab: "right" },
  D_chuangxin: { type: "dest", x: 700, y: 920, label: "創新路（寶山基地）", lab: "left" },
  D_park3: { type: "dest", x: 980, y: 920, label: "園區三路（台積2／5廠）", lab: "below" },
  D_zhunanPark: { type: "dest", x: 270, y: 1240, label: "竹南園區（科學路）", lab: "right" },
};
