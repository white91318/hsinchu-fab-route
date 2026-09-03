# 竹科塞車通

給新竹科學園區通勤族的路況決策工具:今天走哪條路、哪裡在施工、大廠什麼時候交接班。

這個 Next.js 專案是 Phase 1 功能「今天走哪條路」的正式程式碼版本,移植自互動原型(見產品 PRD 附錄 A)。路況資料目前仍是**時間函式模擬**,尚未串接真實路況來源(TDX、1968 高速公路資訊網等,見 PRD §7)。

## 開發

```bash
npm install
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000)。

```bash
npm run lint   # ESLint
npx tsc --noEmit  # 型別檢查
npm run build  # production build
```

## 專案結構

- `src/lib/data/` — 路網資料:路段(`segments.ts`)、節點(`nodes.ts`)、邊(`edges.ts`,含雙向鄰接表)
- `src/lib/traffic/` — 壅塞模型(`model.ts`,以尖峰時刻為中心的時間函式)與型別定義
- `src/lib/routing/` — 路徑搜尋(`pathfinding.ts`)、單一路徑評估與合併同路多段(`computePath.ts`)、選出最佳與次佳相異路線(`selectRoutes.ts`)
- `src/lib/diagram/` — 捷運圖式 SVG 幾何工具(直角轉彎路徑、標籤定位)
- `src/hooks/useCommuteState.ts` — 頁面互動狀態(時間、平日/假日、出發地/目的地、播放)
- `src/components/` — 地圖、時間軸控制、路段標籤、建議路線卡等 UI 元件

## 已知限制

路況為時間函式模擬(含施工示範情境),尚未串接即時路況、道路施工開放資料或大廠實際班別時間。詳見產品 PRD 的「非功能需求」與「風險與假設」章節。
