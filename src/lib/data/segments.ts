import type { SegmentDef, SegmentId } from "@/lib/traffic/types";

/**
 * Road segments in the Hsinchu Science Park commuter network, keyed by id.
 * `base` is free-flow minutes; `amps` are Gaussian peak amplitudes (see
 * src/lib/traffic/model.ts) for the morning / evening-shift-change / late-night
 * shift-change bumps. Ported from the POC artifact's SEGMENTS table.
 */
export const SEGMENTS: Record<SegmentId, SegmentDef> = {
  GUANGFU: {
    name: "光復路",
    base: 8,
    amps: { am: 0.8, pm: 0.7, night: 0.3 },
    phrases: {
      am: "日班上班車潮（晶圓廠 24 小時運轉，假日也有交接車潮）",
      pm: "日班下班／中班上班交接車潮",
      night: "大夜班交接車潮",
      base: "車流順暢",
    },
  },
  N1_NORTH: {
    name: "國道1號（頭前溪以北）",
    base: 10,
    amps: { am: 0.25, pm: 0.25, night: 0 },
    phrases: { am: "湖口／新豐往南國道通勤車潮", pm: "國道通勤車潮", base: "順暢" },
  },
  N1_MID: {
    name: "國道1號（竹北—新竹段）",
    base: 6,
    amps: { am: 0.35, pm: 0.35, night: 0.1 },
    phrases: { am: "國道匯入車潮", pm: "國道匯入車潮", night: "夜間匯入車潮", base: "順暢" },
  },
  N1_SOUTH: {
    name: "國道1號（新竹—系統交流道）",
    base: 7,
    amps: { am: 0.3, pm: 0.3, night: 0.1 },
    phrases: { am: "國道南下通勤車潮", pm: "國道通勤車潮", base: "順暢" },
  },
  GUANGMING6: {
    name: "光明六路（竹北）",
    base: 7,
    amps: { am: 0.3, pm: 0.35, night: 0 },
    weekdayOnly: true,
    phrases: { am: "竹北往園區上班車潮", pm: "竹北下班車潮", base: "順暢" },
  },
  ZHONGHUA_N: {
    name: "中華路（竹北—市區）",
    base: 9,
    amps: { am: 0.2, pm: 0.3, night: 0 },
    phrases: { pm: "竹北往市區車潮", base: "順暢" },
  },
  ZHONGHUA_MID: {
    name: "中華路（市區—香山）",
    base: 9,
    amps: { am: 0.1, pm: 0.3, night: 0 },
    weekdayOnly: true,
    phrases: { pm: "市區下班車潮", base: "順暢" },
  },
  ZHONGHUA_S: {
    name: "中華路（香山—竹南）",
    base: 13,
    amps: { am: 0.2, pm: 0.2, night: 0 },
    phrases: { am: "往竹南／頭份通勤車潮", pm: "往竹南／頭份通勤車潮", base: "車少，距離較長" },
  },
  GONGDAO5: {
    name: "公道五路（關埔）",
    base: 9,
    amps: { am: 0.15, pm: 0.3, night: 0.0 },
    phrases: { pm: "尖峰分流車潮增加", base: "50 米大道，車少順暢" },
  },
  GUANXIN: {
    name: "關新路（關埔重劃區）",
    base: 6,
    amps: { am: 0.35, pm: 0.35, night: 0.1 },
    weekdayOnly: true,
    phrases: {
      am: "關埔住宅區上班車潮（園區近、住戶密集）",
      pm: "關埔住宅區下班車潮",
      base: "順暢",
    },
  },
  PUDING: {
    name: "埔頂路（關埔）",
    base: 6,
    amps: { am: 0.3, pm: 0.3, night: 0.1 },
    weekdayOnly: true,
    phrases: { am: "關埔往園區上班車潮", pm: "關埔下班車潮", base: "順暢" },
  },
  YANXIN1: {
    name: "研新一路（台積3廠）",
    base: 5,
    amps: { am: 0.25, pm: 0.25, night: 0.2 },
    phrases: { am: "園區內尖峰車流", pm: "園區內尖峰車流", night: "大夜交接車流", base: "順暢" },
  },
  XINAN: {
    name: "新安路（施工中）",
    base: 5,
    constOffset: 0.2,
    amps: { am: 0.4, pm: 0.4, night: 0.1 },
    phrases: {
      am: "施工縮減車道＋上班尖峰",
      pm: "施工縮減車道＋下班尖峰",
      night: "施工縮減車道，夜間車少",
      base: "施工縮減車道（示範情境）",
    },
  },
  LIXING: {
    name: "力行路（園區主幹道）",
    base: 4,
    amps: { am: 0.35, pm: 0.35, night: 0.28 },
    phrases: {
      am: "大廠交接班車潮（力行一路～六路沿線）",
      pm: "大廠交接班車潮",
      night: "大夜交接車流",
      base: "順暢",
    },
  },
  DUXING: {
    name: "篤行一路（聯發科）",
    base: 5,
    amps: { am: 0.3, pm: 0.3, night: 0.15 },
    phrases: { am: "上班車潮", pm: "下班車潮", night: "夜間車流", base: "順暢" },
  },
  GONGYE_E: {
    name: "工業東路（環球晶）",
    base: 5,
    amps: { am: 0.25, pm: 0.25, night: 0.2 },
    phrases: { am: "園區內尖峰車流", pm: "園區內尖峰車流", night: "大夜交接車流", base: "順暢" },
  },
  PARK2: {
    name: "園區二路",
    base: 5,
    amps: { am: 0.3, pm: 0.3, night: 0.15 },
    phrases: { am: "園區東側入口車潮", pm: "園區東側出口車潮", base: "順暢" },
  },
  PARK3: {
    name: "園區三路（台積2／5廠．世界先進）",
    base: 6,
    amps: { am: 0.25, pm: 0.25, night: 0.2 },
    phrases: { am: "園區內尖峰車流", pm: "園區內尖峰車流", night: "大夜交接車流", base: "順暢" },
  },
  CHUANGXIN: {
    name: "創新路（瑞昱／聯詠．寶山）",
    base: 5,
    amps: { am: 0.25, pm: 0.25, night: 0.2 },
    phrases: { am: "寶山基地上班車潮", pm: "寶山基地下班車潮", base: "順暢" },
  },
  BAOSHAN: {
    name: "寶山路",
    base: 8,
    amps: { am: 0.3, pm: 0.3, night: 0 },
    phrases: { am: "寶山往園區車潮", pm: "園區往寶山車潮", base: "順暢" },
  },
  N3_ZHUNAN: {
    name: "國道3號（竹南段）",
    base: 12,
    amps: { am: 0.3, pm: 0.3, night: 0 },
    phrases: { am: "國道通勤車潮", pm: "國道通勤車潮", base: "順暢" },
  },
  ZHUNAN_RAMP: {
    name: "竹南交流道匝道",
    base: 5,
    amps: { am: 0.2, pm: 0.2, night: 0 },
    phrases: { am: "匝道匯入車潮", pm: "匝道匯入車潮", base: "順暢" },
  },
  KEXUE: {
    name: "科學路（竹南園區）",
    base: 6,
    amps: { am: 0.25, pm: 0.25, night: 0.2 },
    phrases: { am: "竹南園區上班車潮", pm: "竹南園區下班車潮", base: "順暢" },
  },
};
